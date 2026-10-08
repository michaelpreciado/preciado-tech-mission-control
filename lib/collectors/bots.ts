/**
 * Bots collector — a read-only surface over Hermes **Bot Mode**.
 *
 * A "Bot" is literally a Hermes profile: a directory under
 * `<hermes>/profiles/<name>/` (plus the implicit `default` profile at
 * `<hermes>/state.db`). Each profile owns a `state.db` with the same
 * `sessions` + `messages` schema the Chat console reads (see
 * `lib/conversations.ts`), a `gateway_state.json` the gateway writes, and a
 * set of cron "routines" namespaced `[bot:<name>] <routine>` in
 * `hermes cron list` (surfaced here via the existing cron collector).
 *
 * This module only READS. Create / rename / delete of profiles is out of
 * scope for this pass and, when added, must go through a gated action route.
 *
 * Base directory resolves from `getConfig().paths.gatewayStateFile` (which
 * honours `MC_HOME` / `FRIDAY_GATEWAY_STATE_FILE`), never `process.env.HOME`
 * — an agent restarting the server with its own HOME would otherwise empty
 * every collector.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { getConfig } from '../config'
import { logger } from '../logger'
import { collectCron } from './cron'
import { getCachedCollector } from '../collector-cache'

/* ── Types ───────────────────────────────────────────────── */

export type BotGatewayStatus = 'running' | 'degraded' | 'stopped' | 'unknown'

export type BotGateway = {
  status: BotGatewayStatus
  /** Short human string — raw gateway_state, or which platforms need attention. */
  detail: string
  platforms?: { name: string; state: string; needsAttention: boolean }[]
  updatedAt?: string
}

export type BotRoutine = {
  id: string
  /** The routine label — the part after the `[bot:<name>]` namespace. */
  routine: string
  /** Full cron job name, namespace included. */
  name: string
  enabled: boolean
  schedule: string
  cadence: string
  nextRunAt?: string
  lastRunAt?: string
  lastRunStatus?: string
}

export type Bot = {
  /** Profile name — the bot's identity. */
  name: string
  /** The implicit `default` profile at `<hermes>/state.db`. */
  isDefault: boolean
  /** Model of the most recently started session, if any. */
  model: string | null
  gateway: BotGateway
  sessions: number
  messages: number
  /** Max message timestamp across the bot's sessions, epoch ms. */
  lastActiveAt: number | null
  /** Max message timestamp in the canonical Bot Chat, epoch ms. */
  canonicalLastActiveAt: number | null
  routineCount: number
  routines: BotRoutine[]
  /** First letter of the name, upper-cased — a placeholder avatar. */
  avatarInitial: string
}

export type BotsSnapshot = {
  generatedAt: string
  bots: Bot[]
  totals: { bots: number; routines: number; running: number }
}

/* ── Filesystem layout ───────────────────────────────────── */

/** `<home>/.hermes` — the Hermes root: nearest ancestor of the configured
 *  gateway_state.json that contains a `profiles/` dir (or the dir itself when
 *  it already is the root — gateway_state_file may live at `<root>/gateway_state.json`
 *  for the default profile, or at `<root>/profiles/<name>/gateway_state.json`
 *  for a named one). Resolving from the ancestor keeps `default` + every named
 *  profile discoverable regardless of which profile the file points at. */
export function hermesDir(): string {
  const start = path.dirname(getConfig().paths.gatewayStateFile)
  let dir = start
  while (dir !== path.dirname(dir)) {
    // The Hermes root is the one directory containing a `profiles/` child
    // (named profile *dirs* have their own state.db — only the root's
    // `profiles/` identifies it, so don't stop on state.db alone).
    if (fs.existsSync(path.join(dir, 'profiles'))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  return start
}

type ProfileEntry = { name: string; isDefault: boolean; dbPath: string; dir: string }

/** Discover every local Hermes profile: `default` + each named dir with a
 *  `state.db`. `chat.profiles` in config, when set, restricts the list — same
 *  rule the Chat console's `localProfiles()` applies. */
function discoverProfiles(): ProfileEntry[] {
  const root = hermesDir()
  const out: ProfileEntry[] = []

  const defaultDb = path.join(root, 'state.db')
  if (fs.existsSync(defaultDb)) {
    out.push({ name: 'default', isDefault: true, dbPath: defaultDb, dir: root })
  }

  const profilesDir = path.join(root, 'profiles')
  if (fs.existsSync(profilesDir)) {
    for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = path.join(profilesDir, entry.name)
      const dbPath = path.join(dir, 'state.db')
      if (fs.existsSync(dbPath)) out.push({ name: entry.name, isDefault: false, dbPath, dir })
    }
  }

  const restrict = getConfig().chat.profiles ?? []
  const filtered = restrict.length ? out.filter(p => restrict.includes(p.name)) : out
  return filtered.sort((a, b) =>
    a.isDefault ? -1 : b.isDefault ? 1 : a.name.localeCompare(b.name),
  )
}

/* ── state.db read ───────────────────────────────────────── */

const toMs = (epoch: unknown): number | null => {
  const n = typeof epoch === 'number' ? epoch : Number(epoch ?? 0)
  if (!Number.isFinite(n) || n <= 0) return null
  return n > 1e12 ? n : n * 1000
}

type BotDbStats = {
  model: string | null
  sessions: number
  messages: number
  lastActiveAt: number | null
  canonicalSessionId: string | null
  canonicalLastActiveAt: number | null
}

export function readBotDb(dbPath: string): BotDbStats {
  const fallback: BotDbStats = {
    model: null,
    sessions: 0,
    messages: 0,
    lastActiveAt: null,
    canonicalSessionId: null,
    canonicalLastActiveAt: null,
  }
  if (!fs.existsSync(dbPath)) return fallback
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
    const agg = db.prepare(
      `SELECT COUNT(*) AS sessions, COALESCE(SUM(message_count), 0) AS messages
         FROM sessions WHERE archived = 0`,
    ).get() as { sessions: number; messages: number } | undefined
    const modelRow = db.prepare(
      `SELECT model FROM sessions
         WHERE archived = 0 AND model IS NOT NULL AND model != ''
         ORDER BY started_at DESC LIMIT 1`,
    ).get() as { model: string | null } | undefined
    const tsRow = db.prepare(`SELECT MAX(timestamp) AS ts FROM messages`).get() as { ts: number | null } | undefined
    const canonicalRow = db.prepare(
      `SELECT id,
         (SELECT MAX(timestamp) FROM messages WHERE session_id = sessions.id) AS last_ts
         FROM sessions WHERE title = 'Bot Chat' AND archived = 0 LIMIT 1`,
    ).get() as { id: string; last_ts: number | null } | undefined
    return {
      model: modelRow?.model ?? null,
      sessions: Number(agg?.sessions ?? 0),
      messages: Number(agg?.messages ?? 0),
      lastActiveAt: toMs(tsRow?.ts ?? null),
      canonicalSessionId: canonicalRow?.id ?? null,
      canonicalLastActiveAt: toMs(canonicalRow?.last_ts ?? null),
    }
  } catch (err) {
    logger.error('bots/readDb', err)
    return fallback
  } finally {
    try { db?.close() } catch { /* already closed */ }
  }
}

/* ── gateway_state.json read ─────────────────────────────── */

type RawGatewayState = {
  pid?: number
  gateway_state?: string
  updated_at?: string
  platforms?: Record<string, { state?: string; needs_attention?: boolean; updated_at?: string }>
}

/** The fleet-wide (multiplexed) gateway_state.json. When the configured file
 *  lives at `<root>/profiles/<name>/gateway_state.json` the root file is
 *  `<root>/gateway_state.json`; otherwise the configured file IS the root
 *  (the `default` profile's own file). */
function rootGatewayStateFile(): string {
  const configured = getConfig().paths.gatewayStateFile
  const parent = path.dirname(configured)
  return path.basename(parent) === 'profiles' ? path.join(path.dirname(parent), 'gateway_state.json') : configured
}

function parseGatewayState(file: string): RawGatewayState | null {
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as RawGatewayState
  } catch (err) {
    logger.error('bots/gateway', err)
    return null
  }
}

function gatewayStatus(raw: string, flagged: number): BotGatewayStatus {
  if (raw === 'running') return flagged ? 'degraded' : 'running'
  return /fail|stopped|exit|error/i.test(raw) ? 'stopped' : 'unknown'
}

/** Multiplexed fleet state keys platforms as `<profile>:<platform>`; the
 *  `default` profile keeps the bare platform name. A profile with no scoped
 *  platform is not served by this gateway — 'unknown', never a false 'down'
 *  read off a stale per-profile file that the gateway stopped writing. */
function scopedGateway(root: RawGatewayState, entry: ProfileEntry): BotGateway {
  const prefix = entry.isDefault ? null : `${entry.name}:`
  const scoped = Object.entries(root.platforms ?? {}).filter(([key]) => prefix ? key.startsWith(prefix) : !key.includes(':'))
  if (!scoped.length) {
    return {
      status: 'unknown',
      detail: root.gateway_state === 'running' ? 'not served by the running gateway' : 'no gateway_state.json',
    }
  }
  const platforms = scoped.map(([key, p]) => ({
    name: prefix ? key.slice(prefix.length) : key,
    state: String(p?.state ?? 'unknown'),
    needsAttention: Boolean(p?.needs_attention),
  }))
  const raw = String(root.gateway_state ?? 'unknown')
  const flagged = platforms.filter(p => p.needsAttention)
  const updatedAt = scoped.map(([, p]) => p?.updated_at).filter((v): v is string => typeof v === 'string').sort().at(-1)
  return {
    status: gatewayStatus(raw, flagged.length),
    detail: flagged.length ? `running · ${flagged.map(p => p.name).join(', ')} needs attention` : raw,
    platforms,
    updatedAt: updatedAt ?? (typeof root.updated_at === 'string' ? root.updated_at : undefined),
  }
}

function readGateway(entry: ProfileEntry): BotGateway {
  const root = parseGatewayState(rootGatewayStateFile())
  // Detect the multiplexed shape from the data itself, not from the path: any
  // `<profile>:<platform>` key means one gateway serves the whole fleet.
  if (root?.platforms && Object.keys(root.platforms).some(key => key.includes(':'))) {
    return scopedGateway(root, entry)
  }
  // Legacy shape: one gateway_state.json per profile with bare platform names.
  const legacy = entry.isDefault ? root : parseGatewayState(path.join(entry.dir, 'gateway_state.json'))
  if (!legacy) return { status: 'unknown', detail: 'no gateway_state.json' }
  const raw = String(legacy.gateway_state ?? 'unknown')
  const platforms = legacy.platforms && typeof legacy.platforms === 'object'
    ? Object.entries(legacy.platforms).map(([name, p]) => ({
        name,
        state: String(p?.state ?? 'unknown'),
        needsAttention: Boolean(p?.needs_attention),
      }))
    : undefined
  const flagged = platforms?.filter(p => p.needsAttention) ?? []
  return {
    status: gatewayStatus(raw, flagged.length),
    detail: flagged.length ? `running · ${flagged.map(p => p.name).join(', ')} needs attention` : raw,
    platforms,
    updatedAt: typeof legacy.updated_at === 'string' ? legacy.updated_at : undefined,
  }
}

/* ── routines (namespaced cron jobs) ────────────────────── */

const ROUTINE_NS = /^\[bot:\s*([^\]]+)\]\s*(.*)$/i

async function routinesByBot(): Promise<Map<string, BotRoutine[]>> {
  const map = new Map<string, BotRoutine[]>()
  let cron: Awaited<ReturnType<typeof collectCron>>
  try {
    cron = await collectCron()
  } catch (err) {
    logger.error('bots/routines', err)
    return map
  }
  for (const job of cron) {
    const m = job.name.match(ROUTINE_NS)
    if (!m) continue
    const bot = m[1].trim()
    const list = map.get(bot) ?? []
    list.push({
      id: job.id,
      routine: (m[2] || job.name).trim(),
      name: job.name,
      enabled: job.enabled,
      schedule: job.schedule,
      cadence: job.cadence,
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      lastRunStatus: job.lastRunStatus,
    })
    map.set(bot, list)
  }
  for (const list of map.values()) {
    list.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.routine.localeCompare(b.routine))
  }
  return map
}

/* ── Public API ──────────────────────────────────────────── */

/** Explicit server-side allowlist, including nested objects. Extra runtime keys
 * (even if introduced by a future collector) never become status DTO fields.
 * readBotDb may use session IDs internally; the public collector never reads .env. */
export function toBotStatus(bot: Bot): Bot {
  return {
    name: bot.name,
    isDefault: bot.isDefault,
    model: bot.model,
    gateway: {
      status: bot.gateway.status,
      detail: bot.gateway.detail,
      updatedAt: bot.gateway.updatedAt,
      platforms: bot.gateway.platforms?.map(platform => ({
        name: platform.name,
        state: platform.state,
        needsAttention: platform.needsAttention,
      })),
    },
    sessions: bot.sessions,
    messages: bot.messages,
    lastActiveAt: bot.lastActiveAt,
    canonicalLastActiveAt: bot.canonicalLastActiveAt,
    routineCount: bot.routineCount,
    routines: bot.routines.map(routine => ({
      id: routine.id,
      routine: routine.routine,
      name: routine.name,
      enabled: routine.enabled,
      schedule: routine.schedule,
      cadence: routine.cadence,
      nextRunAt: routine.nextRunAt,
      lastRunAt: routine.lastRunAt,
      lastRunStatus: routine.lastRunStatus,
    })),
    avatarInitial: bot.avatarInitial,
  }
}

/** Every local Bot (Hermes profile) with its metadata + routine readout.
 *  Pass `refresh = true` to bypass the short TTL (used right after a
 *  create/delete so the caller sees the on-disk truth immediately). */
export async function collectBots(refresh = false): Promise<BotsSnapshot> {
  return getCachedCollector('bots', collectBotsFresh, 5_000, refresh)
}

async function collectBotsFresh(): Promise<BotsSnapshot> {
  const [profiles, routineMap] = [discoverProfiles(), await routinesByBot()]

  const bots: Bot[] = profiles.map(entry => {
    const db = readBotDb(entry.dbPath)
    const routines = routineMap.get(entry.name) ?? []
    return toBotStatus({
      name: entry.name,
      isDefault: entry.isDefault,
      model: db.model,
      gateway: readGateway(entry),
      sessions: db.sessions,
      messages: db.messages,
      lastActiveAt: db.lastActiveAt,
      canonicalLastActiveAt: db.canonicalLastActiveAt,
      routineCount: routines.length,
      routines,
      avatarInitial: (entry.name[0] || '?').toUpperCase(),
    })
  })

  bots.sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0))

  const snap: BotsSnapshot = {
    generatedAt: new Date().toISOString(),
    bots,
    totals: {
      bots: bots.length,
      routines: bots.reduce((s, b) => s + b.routineCount, 0),
      running: bots.filter(b => b.gateway.status === 'running').length,
    },
  }
  return snap
}
