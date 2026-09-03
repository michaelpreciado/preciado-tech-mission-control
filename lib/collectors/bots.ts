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
  /** The bot's Telegram connection token (full value) from its profile
   *  `.env`, or null when the profile has none on file. Displayed masked;
   *  copied in full so Michael can re-wire a bot from the roster. */
  telegramToken: string | null
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

type BotDbStats = { model: string | null; sessions: number; messages: number; lastActiveAt: number | null }

function readBotDb(dbPath: string): BotDbStats {
  const fallback: BotDbStats = { model: null, sessions: 0, messages: 0, lastActiveAt: null }
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
    return {
      model: modelRow?.model ?? null,
      sessions: Number(agg?.sessions ?? 0),
      messages: Number(agg?.messages ?? 0),
      lastActiveAt: toMs(tsRow?.ts ?? null),
    }
  } catch (err) {
    logger.error('bots/readDb', err)
    return fallback
  } finally {
    try { db?.close() } catch { /* already closed */ }
  }
}

/* ── gateway_state.json read ─────────────────────────────── */

function readGateway(entry: ProfileEntry): BotGateway {
  // `default` uses the configured gateway_state.json (env-overridable, same
  // file system-health.ts probes); named profiles keep their own copy.
  const file = entry.isDefault
    ? getConfig().paths.gatewayStateFile
    : path.join(entry.dir, 'gateway_state.json')
  if (!fs.existsSync(file)) return { status: 'unknown', detail: 'no gateway_state.json' }
  try {
    const st = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      gateway_state?: string
      updated_at?: string
      platforms?: Record<string, { state?: string; needs_attention?: boolean }>
    }
    const raw = String(st?.gateway_state ?? 'unknown')
    const platforms = st?.platforms && typeof st.platforms === 'object'
      ? Object.entries(st.platforms).map(([name, p]) => ({
          name,
          state: String(p?.state ?? 'unknown'),
          needsAttention: Boolean(p?.needs_attention),
        }))
      : undefined
    const flagged = platforms?.filter(p => p.needsAttention) ?? []
    const status: BotGatewayStatus =
      raw === 'running'
        ? (flagged.length ? 'degraded' : 'running')
        : /fail|stopped|exit|error/i.test(raw)
          ? 'stopped'
          : 'unknown'
    return {
      status,
      detail: flagged.length ? `running · ${flagged.map(p => p.name).join(', ')} needs attention` : raw,
      platforms,
      updatedAt: typeof st?.updated_at === 'string' ? st.updated_at : undefined,
    }
  } catch (err) {
    logger.error('bots/gateway', err)
    return { status: 'unknown', detail: 'gateway_state.json unreadable' }
  }
}

/* ── profile .env read (connection token) ───────────────── */

/** Best-effort `TELEGRAM_BOT_TOKEN` from the profile's own `.env` — for the
 *  default profile that's `<hermes-root>/.env`, for named profiles
 *  `<profile dir>/.env` (entry.dir covers both). The value is never logged;
 *  it reaches the dashboard only so the human can copy it to re-wire a bot. */
function readTelegramToken(entry: ProfileEntry): string | null {
  const file = path.join(entry.dir, '.env')
  try {
    if (!fs.existsSync(file)) return null
    const m = fs.readFileSync(file, 'utf8').match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.*)$/m)
    if (!m) return null
    let value = m[1].trim()
    const q = value[0]
    if ((q === '"' || q === "'") && value.length > 1 && value.endsWith(q)) {
      value = value.slice(1, -1)
    } else {
      value = value.split(/\s+#/)[0].trim()
    }
    return value.length ? value : null
  } catch (err) {
    logger.error('bots/token', err)
    return null
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

let cache: { snap: BotsSnapshot; at: number } | null = null
const TTL_MS = 5_000

/** Every local Bot (Hermes profile) with its metadata + routine readout.
 *  Pass `refresh = true` to bypass the short TTL (used right after a
 *  create/delete so the caller sees the on-disk truth immediately). */
export async function collectBots(refresh = false): Promise<BotsSnapshot> {
  const now = Date.now()
  if (!refresh && cache && now - cache.at < TTL_MS) return cache.snap

  const [profiles, routineMap] = [discoverProfiles(), await routinesByBot()]

  const bots: Bot[] = profiles.map(entry => {
    const db = readBotDb(entry.dbPath)
    const routines = routineMap.get(entry.name) ?? []
    return {
      name: entry.name,
      isDefault: entry.isDefault,
      model: db.model,
      gateway: readGateway(entry),
      sessions: db.sessions,
      messages: db.messages,
      lastActiveAt: db.lastActiveAt,
      telegramToken: readTelegramToken(entry),
      routineCount: routines.length,
      routines,
      avatarInitial: (entry.name[0] || '?').toUpperCase(),
    }
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
  cache = { snap, at: now }
  return snap
}
