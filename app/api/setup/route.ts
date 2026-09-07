/**
 * F.R.I.D.A.Y. setup API — backs the /setup page.
 *
 * GET  → current resolved config with secrets masked (never echoes keys).
 * POST → validates + merges a partial config into data/config.json
 *        (local-only, gitignored). Config hot-reloads via lib/config.ts.
 *
 * Security: writes require a loopback origin (or an IP in FRIDAY_TRUSTED_IPS),
 * or a bearer token when INTERNAL_API_SECRET is set (then the token is
 * required from everywhere). POSTs are rate-limited.
 */
import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CONFIG_FILE, getConfig, isConfigured, resetConfigCache, type ConfigFile } from '@/lib/config'
import {getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv, checkRateLimit, assertSameOrigin } from '@/lib/mission-api'
import { isHexColor } from '@/lib/theme'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const rateBucket = new Map<string, { count: number; resetAt: number }>()

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  const ip = getClientIpFromHeaders(req.headers)
  return isTrustedIp(ip === 'unknown' ? '127.0.0.1' : ip, trustedRangesFromEnv())
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
      appearance: cfg.appearance,
      // Never return key material — only whether a key is present.
      keysSet: {
        openrouterApiKey: Boolean(cfg.keys.openrouterApiKey),
        ticktickToken: Boolean(cfg.keys.ticktickToken),
      },
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
    'openclawConfigFile', 'gatewayStateFile', 'providerEnvFile', 'pipelineDir', 'agentStateDbFile',
    'mlContentIdeasDir', 'eventbusEnvFile', 'googleCalendarCredsFile',
  ],
  services: ['eventbusUrl', 'openclawGatewayUrl', 'ollamaUrl', 'llmsterUrl'],
  keys: ['openrouterApiKey', 'ticktickToken'],
}

const TAB_ID_RE = /^\/[a-z0-9-]*$/
const MOTION_VALUES = new Set(['full', 'reduced', 'off'])
const DENSITY_VALUES = new Set(['compact', 'expanded'])
const ELEMENTS_3D_KEYS = ['coreOrb', 'memoryGraph', 'teamGraph', 'pipelineOrbit'] as const

/** Validate the `appearance` patch — mixed types (string/enum/array/nested
 * booleans), so it gets its own path instead of the generic string-only
 * NESTED loop below. */
function validateAppearance(input: unknown): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'appearance must be an object' }
  const a = input as Record<string, unknown>
  const out: Record<string, unknown> = {}

  if (a.accentColor !== undefined) {
    const cleaned = cleanString(a.accentColor, 'appearance.accentColor')
    if (typeof cleaned !== 'string') return { ok: false, error: cleaned.error }
    if (cleaned !== '' && !isHexColor(cleaned)) return { ok: false, error: 'appearance.accentColor must be a #rrggbb hex color' }
    out.accentColor = cleaned
  }
  if (a.motion !== undefined) {
    if (typeof a.motion !== 'string' || !MOTION_VALUES.has(a.motion)) return { ok: false, error: 'appearance.motion must be full|reduced|off' }
    out.motion = a.motion
  }
  if (a.density !== undefined) {
    if (typeof a.density !== 'string' || !DENSITY_VALUES.has(a.density)) return { ok: false, error: 'appearance.density must be compact|expanded' }
    out.density = a.density
  }
  if (a.hiddenTabs !== undefined) {
    if (!Array.isArray(a.hiddenTabs) || a.hiddenTabs.length > 40 || !a.hiddenTabs.every(t => typeof t === 'string' && TAB_ID_RE.test(t)))
      return { ok: false, error: 'appearance.hiddenTabs must be an array of tab ids' }
    out.hiddenTabs = a.hiddenTabs.filter(t => t !== '/' && t !== '/setup')
  }
  if (a.tabOrder !== undefined) {
    if (!Array.isArray(a.tabOrder) || a.tabOrder.length > 40 || !a.tabOrder.every(t => typeof t === 'string' && TAB_ID_RE.test(t)))
      return { ok: false, error: 'appearance.tabOrder must be an array of tab ids' }
    out.tabOrder = a.tabOrder
  }
  if (a.elements3d !== undefined) {
    const e = a.elements3d
    if (!e || typeof e !== 'object' || Array.isArray(e)) return { ok: false, error: 'appearance.elements3d must be an object' }
    const eo: Record<string, boolean> = {}
    for (const k of ELEMENTS_3D_KEYS) {
      const v = (e as Record<string, unknown>)[k]
      if (v === undefined) continue
      if (typeof v !== 'boolean') return { ok: false, error: `appearance.elements3d.${k} must be boolean` }
      eo[k] = v
    }
    out.elements3d = eo
  }
  return { ok: true, patch: out }
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

  if (input.appearance !== undefined) {
    const result = validateAppearance(input.appearance)
    if (!result.ok) return result
    if (Object.keys(result.patch).length) patch.appearance = result.patch
  }

  return { ok: true, patch: patch as ConfigFile }
}

export async function POST(req: NextRequest) {
  const _origin = assertSameOrigin(req)
  if (!_origin.ok) return NextResponse.json(_origin.body, { status: _origin.status })
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
    // appearance needs its own merge: it has mixed types and one nested
    // object (elements3d) that itself deserves a shallow merge, not a clobber.
    const prevAppearance = existing.appearance
    const nextAppearance = (result.patch as Record<string, unknown>).appearance
    if (prevAppearance && typeof prevAppearance === 'object' && nextAppearance && typeof nextAppearance === 'object') {
      const mergedAppearance: Record<string, unknown> = { ...(prevAppearance as object), ...(nextAppearance as object) }
      const prevElements3d = (prevAppearance as Record<string, unknown>).elements3d
      const nextElements3d = (nextAppearance as Record<string, unknown>).elements3d
      if (prevElements3d && typeof prevElements3d === 'object' && nextElements3d && typeof nextElements3d === 'object') {
        mergedAppearance.elements3d = { ...(prevElements3d as object), ...(nextElements3d as object) }
      }
      merged.appearance = mergedAppearance
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
