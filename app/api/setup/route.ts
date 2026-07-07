/**
 * F.R.I.D.A.Y. setup API — backs the /setup page.
 *
 * GET  → current resolved config with secrets masked (never echoes keys).
 * POST → validates + merges a partial config into data/config.json
 *        (local-only, gitignored). Config hot-reloads via lib/config.ts.
 *
 * Security: writes require loopback origin, or a bearer token when
 * INTERNAL_API_SECRET is set (then the token is required from everywhere).
 * POSTs are rate-limited.
 */
import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CONFIG_FILE, getConfig, isConfigured, resetConfigCache, type ConfigFile } from '@/lib/config'
import { getClientIpFromHeaders, isLoopbackIp, checkRateLimit } from '@/lib/mission-api'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const rateBucket = new Map<string, { count: number; resetAt: number }>()

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  return isLoopbackIp(getClientIpFromHeaders(req.headers) === 'unknown' ? '127.0.0.1' : getClientIpFromHeaders(req.headers))
}

export async function GET() {
  const cfg = getConfig()
  return NextResponse.json({
    configured: isConfigured(),
    configFile: CONFIG_FILE.replace(process.cwd(), '.'),
    config: {
      appName: cfg.appName,
      appTagline: cfg.appTagline,
      homeDir: cfg.homeDir,
      github: cfg.github,
      paths: cfg.paths,
      services: cfg.services,
      // Never return key material — only whether a key is present.
      keysSet: { openrouterApiKey: Boolean(cfg.keys.openrouterApiKey) },
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/* ── input validation ─────────────────────────────────── */

const STRING_KEYS = ['appName', 'appTagline', 'homeDir'] as const
const NESTED: Record<string, readonly string[]> = {
  github: ['username', 'projectRepo'],
  paths: [
    'agentsDir', 'workspaceDir', 'projectWorkspaceDir', 'repoDir', 'vaultDir',
    'projectVaultDir', 'usageLogsDir', 'inboxDir', 'cronJobsFile', 'kanbanDbFile',
    'openclawConfigFile', 'gatewayStateFile', 'providerEnvFile', 'pipelineDir',
    'mlContentIdeasDir', 'eventbusEnvFile', 'googleCalendarCredsFile',
  ],
  services: ['eventbusUrl', 'openclawGatewayUrl', 'ollamaUrl', 'llmsterUrl'],
  keys: ['openrouterApiKey'],
}

function cleanString(v: unknown, field: string): string | { error: string } {
  if (typeof v !== 'string') return { error: `${field} must be a string` }
  if (v.length > 1024) return { error: `${field} too long` }
  // Control characters have no place in names, paths, URLs, or keys.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v)) return { error: `${field} contains control characters` }
  return v.trim()
}

/** Validate a partial config body into a ConfigFile patch. */
function validate(body: unknown): { ok: true; patch: ConfigFile } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'body must be a JSON object' }
  const input = body as Record<string, unknown>
  const patch: Record<string, unknown> = {}

  for (const key of STRING_KEYS) {
    if (input[key] === undefined) continue
    const v = cleanString(input[key], key)
    if (typeof v !== 'string') return { ok: false, error: v.error }
    patch[key] = v
  }

  for (const [section, fields] of Object.entries(NESTED)) {
    if (input[section] === undefined) continue
    const src = input[section]
    if (!src || typeof src !== 'object' || Array.isArray(src)) return { ok: false, error: `${section} must be an object` }
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!fields.includes(k)) continue // unknown keys ignored
      const cleaned = cleanString(v, `${section}.${k}`)
      if (typeof cleaned !== 'string') return { ok: false, error: cleaned.error }
      out[k] = cleaned
    }
    if (Object.keys(out).length) patch[section] = out
  }

  return { ok: true, patch: patch as ConfigFile }
}

export async function POST(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateBucket, ip, Date.now(), 10, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const result = validate(body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  try {
    // Merge onto whatever is already in the file (not the env-resolved view),
    // so env-var overrides never get baked into config.json.
    let existing: Record<string, unknown> = {}
    try { existing = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8')) } catch { /* first write */ }
    const merged: Record<string, unknown> = { ...existing, ...result.patch }
    for (const section of Object.keys(NESTED)) {
      const prev = existing[section]
      const next = (result.patch as Record<string, unknown>)[section]
      if (prev && typeof prev === 'object' && next) merged[section] = { ...prev, ...next }
    }
    await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true })
    await fs.writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 })
    resetConfigCache()
    return NextResponse.json({
      ok: true,
      note: 'Saved. Data collectors pick this up immediately; brand/metadata changes need a server restart.',
    })
  } catch (err) {
    logger.error('setup/write', err)
    return NextResponse.json({ error: 'failed to write config file' }, { status: 500 })
  }
}
