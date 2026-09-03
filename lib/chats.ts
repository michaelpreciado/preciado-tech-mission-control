/**
 * CHATS — live chat mirror for Mission Control.
 *
 * Surfaces ongoing desktop conversations in real time, straight from each
 * local Hermes profile's session store (`state.db` messages table — the same
 * source the Chat console reads). A lightweight poll endpoint
 * (`/api/chats/live?since=<ms>`) returns every recent session with its new
 * messages since the cursor, so the UI can tick a live pane at ~3s cadence
 * with incremental payloads. Hybrid-local friendly: this box only; remote
 * hosts join through the existing conversation-store path when they're on.
 *
 * Read-only by design — the messages table is never written here. Sending
 * stays in lib/conversation-actions.ts via the real agent CLI.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { logger } from './logger'

/* ── Types ───────────────────────────────────────────────── */

export type LiveMessage = {
  sessionId: string
  id: number
  role: string // user | assistant | tool | session_meta | system
  content: string | null
  toolName: string | null
  timestamp: number // ms epoch
}

export type LiveSession = {
  id: string
  profile: string
  source: string
  model: string | null
  firstTs: number
  lastTs: number
  active: boolean
  messages: LiveMessage[]
}

/* ── Window & caps ─────────────────────────────────────────
   Revisit the last 5 minutes of every profile so a dropped poll or a
   briefly-offline tab never leaves a hole in the live pane; bound each
   profile's read to keep the payload sane. */
const MIN_MS = 5 * 60_000
const MAX_ROWS = 500

/* ── Profile discovery (local only) ─────────────────────── */

function localDbPath(profile: string): string | null {
  const home = os.homedir()
  if (profile === 'default') {
    const p = path.join(home, '.hermes', 'state.db')
    return fs.existsSync(p) ? p : null
  }
  const p = path.join(home, '.hermes', 'profiles', profile, 'state.db')
  return fs.existsSync(p) ? p : null
}

/** All Hermes profiles present on this machine with a session store. */
export function localProfiles(): string[] {
  const home = os.homedir()
  const dir = path.join(home, '.hermes', 'profiles')
  const named = fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'state.db')))
        .map(d => d.name)
        .sort()
    : []
  return ['default', ...named]
}

/* ── DB read helpers ────────────────────────────────────── */

function withDbFile<T>(file: string | null, fn: (db: DatabaseSync) => T): T | null {
  if (!file || !fs.existsSync(file)) return null
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(file, { readOnly: true })
    return fn(db)
  } catch (err) {
    logger.error('chats/withDb', err)
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

function clip(s: string | null, n: number): string | null {
  if (!s) return null
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

/* Sessions with any message since the cursor (or within the lookback window),
 * each carrying its new messages. One read per profile DB. */
function readRecent(file: string | null, profile: string, sinceMs: number, now: number): LiveSession[] {
  return withDbFile(file, db => {
    const floor = Math.min(sinceMs, now - MIN_MS) / 1000
    const rows = db.prepare(
      `SELECT s.id, s.source, s.model,
              m.id AS mid, m.role, m.content, m.tool_name, m.timestamp
         FROM sessions s
         JOIN messages m ON m.session_id = s.id
        WHERE s.archived = 0 AND m.timestamp > ?
        ORDER BY m.timestamp ASC
        LIMIT ?`,
    ).all(floor, MAX_ROWS) as Array<{
      id: string; source: string | null; model: string | null
      mid: number; role: string; content: string | null; tool_name: string | null; timestamp: number
    }>

    const bySession = new Map<string, LiveSession>()
    for (const r of rows) {
      let s = bySession.get(r.id)
      if (!s) {
        s = {
          id: r.id,
          profile,
          source: r.source || 'desktop',
          model: r.model || null,
          firstTs: 0,
          lastTs: 0,
          active: false,
          messages: [],
        }
        bySession.set(r.id, s)
      }
      const ts = toMs(r.timestamp)
      if (s.firstTs === 0 || ts < s.firstTs) s.firstTs = ts
      if (ts > s.lastTs) s.lastTs = ts
      s.messages.push({
        sessionId: r.id,
        id: r.mid,
        role: r.role,
        content: clip(r.content, 1200),
        toolName: r.tool_name,
        timestamp: ts,
      })
    }
    const out: LiveSession[] = []
    for (const s of bySession.values()) {
      s.active = s.lastTs > now - 90 * 1000
      // Include quiet-but-recent sessions (no new messages) so the pane
      // keeps showing the current conversation even between keystrokes.
      out.push(s)
    }
    return out.sort((a, b) => b.lastTs - a.lastTs)
  }) ?? []
}

/* One full thread (all messages), for the click-through detail view. */
function readThread(file: string | null, profile: string, sessionId: string): LiveMessage[] {
  return withDbFile(file, db => {
    const rows = db.prepare(
      `SELECT id, role, content, tool_name, timestamp
         FROM messages WHERE session_id = ?
        ORDER BY id ASC
        LIMIT 2000`,
    ).all(sessionId) as Array<{
      id: number; role: string; content: string | null; tool_name: string | null; timestamp: number
    }>
    return rows.map(m => ({
      sessionId,
      id: m.id,
      role: m.role,
      content: clip(m.content, 4000),
      toolName: m.tool_name,
      timestamp: toMs(m.timestamp),
    }))
  }) ?? []
}

/* ── Public API ─────────────────────────────────────────── */

/**
 * Every recent session across all local profiles, newest activity first.
 * `sinceMs` is the client's last seen timestamp; messages older than the
 * lookup floor (5 min) are never re-sent. Callers should pass 0 on first load.
 */
export function recentChats(sinceMs: number): { sessions: LiveSession[]; generatedAt: number } {
  const now = Date.now()
  const since = Number.isFinite(sinceMs) && sinceMs > 0 ? sinceMs : now - MIN_MS
  const sessions: LiveSession[] = []
  for (const profile of localProfiles()) {
    sessions.push(...readRecent(localDbPath(profile), profile, since, now))
  }
  return { sessions, generatedAt: now }
}

/** Full message thread for one session on a local profile. */
export function sessionMessages(profile: string, sessionId: string): LiveMessage[] {
  return readThread(localDbPath(profile), profile, sessionId)
}