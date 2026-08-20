/**
 * Conversations — a unified, read-mostly view of EVERY Hermes conversation
 * across all agents (profiles) and all devices (this box + remote hosts),
 * straight from each profile's real SQLite session store (`state.db`).
 *
 * The source of truth is the Hermes `state.db` `sessions` + `messages`
 * tables. Local profiles are discovered under `~/.hermes/state.db` (the
 * `default` profile) and `~/.hermes/profiles/<name>/state.db`. Remote hosts
 * (e.g. the MacBook) are pulled read-only over SSH and cached, mirroring the
 * kanban remote pattern.
 *
 * A conversation is one `sessions` row. Reading is always read-only; sending
 * goes through the `hermes` CLI (see lib/conversation-actions.ts) so the DB
 * stays the single source of truth.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { getConfig } from './config'
import { logger } from './logger'
import type { FridayChatRemote } from './config'

/* ── Types ───────────────────────────────────────────────── */

export type ConversationSource = 'default' | string // profile name or remote name

export type ChatMessage = {
  id: number
  role: string // user | assistant | tool | session_meta | system
  content: string | null
  toolName?: string
  toolCalls?: string
  timestamp: number
}

export type Conversation = {
  id: string // Hermes session id
  title: string
  profile: string // owning profile (default | jarvis | friday | ...)
  device: string // local hostname or remote name
  source: string // session .source (desktop/tui/kanban/telegram/cron/...)
  model: string | null
  startedAt: number
  lastActiveAt: number
  messageCount: number
  /** Latest user/assistant text, for the row preview. */
  preview: string
  /** True when this conversation hasn't ended (still ongoing). */
  active: boolean
}

export type ConversationRef = {
  profile: string
  device: string
  sessionId: string
}

/* ── Profile discovery (local) ───────────────────────────── */

function localDbPath(profile: string): string | null {
  const home = os.homedir()
  if (profile === 'default') {
    const p = path.join(home, '.hermes', 'state.db')
    return fs.existsSync(p) ? p : null
  }
  const p = path.join(home, '.hermes', 'profiles', profile, 'state.db')
  return fs.existsSync(p) ? p : null
}

/** All Hermes profiles present on this machine (the 'default' profile + each
 *  named profile dir under ~/.hermes/profiles). Config `chat.profiles` can
 *  restrict the list. */
export function localProfiles(): string[] {
  const home = os.homedir()
  const dir = path.join(home, '.hermes', 'profiles')
  const named = fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'state.db')))
        .map(d => d.name)
        .sort()
    : []
  const all = ['default', ...named]
  const restrict = getConfig().chat.profiles ?? []
  if (restrict.length) return all.filter(p => restrict.includes(p))
  return all
}

const localDevice = () => os.hostname() || 'local'

/* ── DB read helpers ─────────────────────────────────────── */

function withDbFile<T>(file: string, fn: (db: DatabaseSync) => T): T | null {
  if (!file || !fs.existsSync(file)) return null
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(file, { readOnly: true })
    return fn(db)
  } catch (err) {
    logger.error('conversations/withDb', err)
    return null
  } finally {
    try { db?.close() } catch { /* already closed */ }
  }
}

const toMs = (epoch: unknown): number => {
  const n = typeof epoch === 'number' ? epoch : Number(epoch ?? 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n > 1e12 ? n : n * 1000
}

/** Read the sessions list from one state.db. */
function readSessions(file: string, profile: string, device: string): Conversation[] {
  return withDbFile(file, db => {
    const rows = db.prepare(
      `SELECT s.id, s.title, s.source, s.model, s.started_at, s.message_count,
              (SELECT m.timestamp FROM messages m WHERE m.session_id = s.id
                AND (m.role='user' OR m.role='assistant') AND m.content IS NOT NULL AND m.content != ''
                ORDER BY m.timestamp DESC LIMIT 1) AS last_ts,
              (SELECT m.content FROM messages m WHERE m.session_id = s.id
                AND (m.role='user' OR m.role='assistant') AND m.content IS NOT NULL AND m.content != ''
                ORDER BY m.timestamp DESC LIMIT 1) AS preview,
              (SELECT m.content FROM messages m WHERE m.session_id = s.id AND m.role='user'
                AND m.content IS NOT NULL AND m.content != ''
                ORDER BY m.timestamp ASC LIMIT 1) AS first_user
         FROM sessions s
         WHERE s.archived = 0
         ORDER BY COALESCE((SELECT MAX(m.timestamp) FROM messages m WHERE m.session_id = s.id), s.started_at) DESC
         LIMIT 500`,
    ).all() as Array<{
      id: string; title: string | null; source: string | null; model: string | null
      started_at: number; message_count: number | null; last_ts: number | null; preview: string | null; first_user: string | null
    }>

    return rows.map(r => {
      const lastActiveAt = toMs(r.last_ts) || toMs(r.started_at)
      return {
        id: r.id,
        title: r.title?.trim() || truncate(r.first_user || r.preview || '', 60) || '(untitled)',
        profile,
        device,
        source: r.source || 'desktop',
        model: r.model || null,
        startedAt: toMs(r.started_at),
        lastActiveAt,
        messageCount: r.message_count ?? 0,
        preview: truncate(r.preview || '', 140),
        active: lastActiveAt > Date.now() - 90 * 1000,
      }
    })
  }) ?? []
}

function truncate(s: string, n: number): string {
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/* ── Remote (SSH) pull with TTL cache ────────────────────── */

interface CachedRemote {
  conversations: Conversation[]
  fetchedAt: number
}

const remoteCache = new Map<string, CachedRemote>()

function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p
}

/** Pull a remote Hermes state.db over SSH to a temp file, read it, delete it. */
function pullRemoteDb(remote: FridayChatRemote, dbPath: string): string | null {
  const keyFile = expandHome(remote.keyFile ?? '~/.ssh/id_ed25519')
  const tmp = path.join(os.tmpdir(), `mc-chat-${remote.name}-${crypto.randomBytes(4).toString('hex')}.db`)
  const target = `${remote.user}@${remote.host}:${dbPath}`
  try {
    execFileSync(
      'scp',
      ['-q', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=6', '-i', keyFile, target, tmp],
      { timeout: remote.timeoutMs ?? 8000, stdio: 'pipe' },
    )
    return fs.existsSync(tmp) ? tmp : null
  } catch (err) {
    logger.warn('conversations/remote', `${remote.name}: scp failed — ${(err as Error).message}`)
    try { fs.unlinkSync(tmp) } catch { /* best effort */ }
    return null
  }
}

/**
 * Fast reachability probe: one short-BatchMode ssh `true` to the remote host.
 * Returns true only if the host is actually up, so fetchRemote can bail out in
 * ~2s instead of burning a full ConnectTimeout+timeout on every dbPath when
 * the MacBook is asleep. Cached alongside the conversation payload.
 */
function probeReachable(remote: FridayChatRemote): boolean {
  const keyFile = expandHome(remote.keyFile ?? '~/.ssh/id_ed25519')
  try {
    execFileSync(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=4',
        '-o', 'ServerAliveInterval=2', '-o', 'ServerAliveCountMax=1', '-i', keyFile,
        `${remote.user}@${remote.host}`, 'true'],
      { timeout: 6000, stdio: 'pipe' },
    )
    return true
  } catch (err) {
    logger.warn('conversations/probe', `${remote.name}: host unreachable — ${(err as Error).message}`)
    return false
  }
}

function fetchRemote(remote: FridayChatRemote): Conversation[] {
  const now = Date.now()
  const hit = remoteCache.get(remote.name)
  if (hit && now - hit.fetchedAt < (remote.cacheMs ?? 30000)) return hit.conversations

  // Fail fast when the remote is offline (~2-4s) instead of timing out on each
  // of the N dbPaths sequentially. Cache the empty result so the UI never
  // blocks for tens of seconds while the MacBook sleeps.
  if (!probeReachable(remote)) {
    remoteCache.set(remote.name, { conversations: [], fetchedAt: now })
    return []
  }

  const dbPaths = remote.dbPaths ?? ['~/.hermes/state.db']
  const out: Conversation[] = []
  for (const dbPath of dbPaths) {
    // Remote path keeps literal '~' for the REMOTE shell to expand.
    const tmp = pullRemoteDb(remote, dbPath)
    if (!tmp) continue
    const profile = dbPath.includes('/profiles/')
      ? dbPath.split('/profiles/')[1]!.split('/')[0]!
      : 'default'
    // Re-point to the local temp file — readSessions needs a real path.
    const list = readSessions(tmp, profile, remote.name)
    try { fs.unlinkSync(tmp) } catch { /* best effort */ }
    out.push(...list)
  }

  remoteCache.set(remote.name, { conversations: out, fetchedAt: now })
  return out
}

/* ── Public API ──────────────────────────────────────────── */

/**
 * Every conversation from every local profile + configured remote, de-duped and
 * newest first. NOT capped — callers that need a page slice it themselves, and
 * aggregate callers need the true total (there are hundreds of sessions; a
 * dashboard built on a capped list silently under-reports).
 */
let collectCache: { rows: Conversation[]; at: number } | null = null
/** Long enough for one request's two callers to share, short enough to feel live. */
const COLLECT_TTL_MS = 1_500

function collectAll(): Conversation[] {
  // listConversations() and conversationStats() both need the full set and are
  // called together on every request. Without this they each re-read every
  // profile's SQLite store — the same hundreds of sessions, twice per request.
  const now = Date.now()
  if (collectCache && now - collectCache.at < COLLECT_TTL_MS) return collectCache.rows

  const localDeviceName = localDevice()
  const all: Conversation[] = []

  for (const profile of localProfiles()) {
    const file = localDbPath(profile)
    if (file) all.push(...readSessions(file, profile, localDeviceName))
  }

  for (const remote of getConfig().chat.remotes ?? []) {
    all.push(...fetchRemote(remote))
  }

  const seen = new Set<string>()
  const rows = all
    .filter(c => { const k = `${c.device}::${c.profile}::${c.id}`; if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)

  collectCache = { rows, at: now }
  return rows
}

/** Drop the collect cache so a just-sent message shows up immediately. */
export function invalidateConversationCache(): void {
  collectCache = null
}

/* ── Aggregate stats (the chat intel dashboard) ──────────── */

export type ConversationStats = {
  totalConversations: number
  totalMessages: number
  activeConversations: number
  byAgent: { name: string; count: number; messages: number }[]
  byDevice: { name: string; count: number; messages: number }[]
  bySource: { name: string; count: number }[]
  byModel: { name: string; count: number }[]
  /** Oldest → newest daily message counts for the heatmap. */
  heatmap: { date: string; count: number }[]
  busiest: { id: string; title: string; profile: string; device: string; messageCount: number }[]
  firstActiveAt: number | null
  lastActiveAt: number | null
}

const HEATMAP_DAYS = 84 // 12 weeks

function tally(rows: Conversation[], key: (c: Conversation) => string | null, withMessages: boolean) {
  const map = new Map<string, { count: number; messages: number }>()
  for (const c of rows) {
    const k = key(c)
    if (!k) continue
    const cur = map.get(k) ?? { count: 0, messages: 0 }
    cur.count++
    cur.messages += c.messageCount
    map.set(k, cur)
  }
  return [...map.entries()]
    .map(([name, v]) => (withMessages ? { name, count: v.count, messages: v.messages } : { name, count: v.count }))
    .sort((a, b) => b.count - a.count)
}

/** Aggregates over EVERY conversation — deliberately ignores search/filters. */
export function conversationStats(): ConversationStats {
  const all = collectAll()

  // Heatmap buckets are keyed by LOCAL calendar day so the grid lines up with
  // the day-grouped list; toISOString would bucket by UTC and drift.
  const dayKey = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const counts = new Map<string, number>()
  for (const c of all) counts.set(dayKey(c.lastActiveAt), (counts.get(dayKey(c.lastActiveAt)) ?? 0) + c.messageCount)

  const heatmap: { date: string; count: number }[] = []
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  cursor.setDate(cursor.getDate() - (HEATMAP_DAYS - 1))
  for (let i = 0; i < HEATMAP_DAYS; i++) {
    const k = dayKey(cursor.getTime())
    heatmap.push({ date: k, count: counts.get(k) ?? 0 })
    cursor.setDate(cursor.getDate() + 1)
  }

  return {
    totalConversations: all.length,
    totalMessages: all.reduce((s, c) => s + c.messageCount, 0),
    activeConversations: all.filter(c => c.active).length,
    byAgent: tally(all, c => c.profile, true) as ConversationStats['byAgent'],
    byDevice: tally(all, c => c.device, true) as ConversationStats['byDevice'],
    bySource: tally(all, c => c.source || null, false) as ConversationStats['bySource'],
    byModel: tally(all, c => (c.model ? c.model.split('/').pop()! : null), false).slice(0, 6) as ConversationStats['byModel'],
    heatmap,
    busiest: [...all].sort((a, b) => b.messageCount - a.messageCount).slice(0, 5)
      .map(c => ({ id: c.id, title: c.title, profile: c.profile, device: c.device, messageCount: c.messageCount })),
    firstActiveAt: all.length ? Math.min(...all.map(c => c.startedAt)) : null,
    lastActiveAt: all.length ? Math.max(...all.map(c => c.lastActiveAt)) : null,
  }
}

/** All conversations across local profiles + configured remotes, newest first. */
export function listConversations(opts?: { q?: string; profile?: string; device?: string; limit?: number }): Conversation[] {
  const all = collectAll()

  const q = opts?.q?.trim().toLowerCase()
  const prof = opts?.profile
  const dev = opts?.device
  // Was 200 with no way for the route to override it, which silently hid
  // every conversation past the newest 200. The list uses content-visibility,
  // so the extra rows cost DOM but not paint.
  const limit = Math.max(1, Math.min(opts?.limit ?? 1000, 5000))

  let results = all
  if (q) {
    results = results.filter(c =>
      (c.title?.toLowerCase().includes(q) ?? false) ||
      (c.preview?.toLowerCase().includes(q) ?? false) ||
      (c.id?.toLowerCase().includes(q) ?? false),
    )
  }
  if (prof) results = results.filter(c => c.profile === prof)
  if (dev) results = results.filter(c => c.device === dev)

  // collectAll() already de-duped and sorted; only the page slice is left.
  return results.slice(0, limit)
}

/** Read the full message thread for one conversation. */
export function getMessages(ref: ConversationRef): ChatMessage[] {
  // Local or remote? device === local hostname → local.
  const isLocal = ref.device === localDevice()
  let file: string | null = null
  let dispose: (() => void) | null = null

  if (isLocal) {
    file = localDbPath(ref.profile)
  } else {
    const remote = getConfig().chat.remotes?.find(r => r.name === ref.device)
    if (remote) {
      const p = ref.profile
      const remotePath = p === 'default'
        ? '~/.hermes/state.db'
        : `~/.hermes/profiles/${p}/state.db`
      const tmp = pullRemoteDb(remote, remotePath)
      if (tmp) { file = tmp; dispose = () => { try { fs.unlinkSync(tmp) } catch { /* best effort */ } } }
    }
  }

  if (!file) return []
  try {
    const msgs = withDbFile(file, db => db.prepare(
      `SELECT id, role, content, tool_name, tool_calls, timestamp
         FROM messages WHERE session_id = ? ORDER BY timestamp ASC`,
    ).all(ref.sessionId) as Array<{ id: number; role: string; content: string | null; tool_name: string | null; tool_calls: string | null; timestamp: number }>) ?? []
    return msgs.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolName: m.tool_name ?? undefined,
      toolCalls: m.tool_calls ?? undefined,
      timestamp: toMs(m.timestamp),
    }))
  } finally {
    dispose?.()
  }
}

/** The set of devices (local hostname + remote names) that have conversations. */
export function listDevices(): { name: string; isLocal: boolean }[] {
  const local = localDevice()
  const out = [{ name: local, isLocal: true }]
  for (const r of getConfig().chat.remotes ?? []) out.push({ name: r.name, isLocal: false })
  return out
}
