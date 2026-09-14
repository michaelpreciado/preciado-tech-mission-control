import type { MissionData } from './types'

const STREAM_ALIASES = new Map<string, keyof MissionData | 'invalid'>([
  ['tasks', 'tasks'],
  ['calendar', 'cron'],
  ['cron', 'cron'],
  ['projects', 'projects'],
  ['crew', 'crew'],
  ['memory', 'memory'],
  ['github', 'github'],
  ['costs', 'costs'],
  ['operations', 'operations'],
  ['activity', 'operations'],
  ['kanban', 'kanban'],
])

export const VALID_STREAMS = [...STREAM_ALIASES.keys()]
export const RATE_LIMIT = 30
export const RATE_WINDOW_MS = 60 * 1000

export function normalizeStream(stream: string | null | undefined): keyof MissionData | 'invalid' | null {
  if (stream == null || stream === '') return null
  const normalized = String(stream).trim().toLowerCase()
  return STREAM_ALIASES.get(normalized) ?? 'invalid'
}

type StreamResult = {
  ok: boolean
  status: number
  body: Record<string, unknown>
}

export function streamPayload(data: MissionData, stream: string | null | undefined): StreamResult {
  const normalized = normalizeStream(stream)
  if (normalized === 'invalid') {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Unknown mission-control stream "${String(stream).slice(0, 40)}".`,
        hint: `Use one of: ${VALID_STREAMS.join(', ')}.`,
      },
    }
  }

  if (!normalized) return { ok: true, status: 200, body: data as unknown as Record<string, unknown> }

  return {
    ok: true,
    status: 200,
    body: { [normalized]: data[normalized], generatedAt: data.generatedAt },
  }
}

export function getClientIpFromHeaders(headers: Headers): string {
  // Next.js supplies x-forwarded-for with the socket peer when there is no
  // proxy, which is how direct LAN/Tailscale access reaches the app. A proxy
  // must append its own address; only accept the original client address when
  // that final hop is in the explicitly trusted proxy list.
  const forwarded = headers.get('x-forwarded-for')
  const forwardedIps = forwarded?.split(',').map(value => value.trim()).filter(Boolean) ?? []
  const trustedProxies = parseTrustedIps(process.env.MC_TRUSTED_PROXIES)
  if (forwardedIps.length > 1) {
    const proxyIp = forwardedIps[forwardedIps.length - 1]
    if (isIpInRanges(proxyIp, trustedProxies)) return forwardedIps[0]
    return 'unknown'
  }
  if (forwardedIps.length === 1) return forwardedIps[0]

  // x-real-ip is also proxy-controlled, so honor it only when the request
  // declares a trusted proxy hop via MC_TRUSTED_PROXIES.
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp && isIpInRanges(realIp, trustedProxies)) return realIp
  return 'unknown'
}

export function isLoopbackIp(ip: string): boolean {
  return ip === '::1' || ip === 'localhost' || ip === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(ip)
}

/* ── Trusted-client allowlist ─────────────────────────────
   Write endpoints (/api/setup, /api/chat, …) are loopback-only by default.
   That breaks the common self-host case of reaching the dashboard over a
   private overlay network (Tailscale, WireGuard, a LAN), because `next start`
   always populates x-forwarded-for with the peer address — so the client IP is
   never loopback even though nothing is proxying. FRIDAY_TRUSTED_IPS lets the
   operator opt specific ranges in, e.g. "100.64.0.0/10" for a tailnet.

   Forwarded chains are accepted only when their final hop is listed in
   MC_TRUSTED_PROXIES. A single forwarded address is treated as Next.js'
   socket peer, preserving direct LAN/Tailscale access. */

export type TrustedRange = { base: number; bits: number }

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let out = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    out = out * 256 + n
  }
  return out
}

/** Parse a comma-separated list of IPv4 addresses/CIDRs. Junk entries are dropped. */
export function parseTrustedIps(spec: string | undefined | null): TrustedRange[] {
  if (!spec) return []
  const out: TrustedRange[] = []
  for (const raw of spec.split(',')) {
    const entry = raw.trim()
    if (!entry) continue
    const [addr, prefix] = entry.split('/')
    const base = ipv4ToInt(addr)
    if (base === null) continue
    let bits = 32
    if (prefix !== undefined) {
      if (!/^\d{1,2}$/.test(prefix)) continue
      bits = Number(prefix)
      if (bits > 32) continue
    }
    // Mask off host bits so "10.0.0.5/8" and "10.0.0.0/8" compare identically.
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    out.push({ base: (base & mask) >>> 0, bits })
  }
  return out
}

/** True if `ip` is loopback or falls inside one of the allowed ranges. */
export function isTrustedIp(ip: string, ranges: TrustedRange[]): boolean {
  if (isLoopbackIp(ip)) return true
  return isIpInRanges(ip, ranges)
}

function isIpInRanges(ip: string, ranges: TrustedRange[]): boolean {
  const value = ipv4ToInt(ip)
  if (value === null) return false
  return ranges.some(({ base, bits }) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return ((value & mask) >>> 0) === base
  })
}

/** Default private/overlay ranges plus any operator-configured ranges. */
export function trustedRangesFromEnv(): TrustedRange[] {
  return parseTrustedIps([
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '100.64.0.0/10',
    process.env.FRIDAY_TRUSTED_IPS ?? '',
  ].join(','))
}

/**
 * Whether the API is bound to an external interface (i.e. reachable by other
 * machines). `MC_BIND_HOST` is the single source of truth for the bind
 * address (`dev`/`start` both force `-H 0.0.0.0`). Unset or loopback → local
 * app, no extra cross-origin gate.
 */
export function isExternalBind(value: string | undefined | null = process.env.MC_BIND_HOST): boolean {
  return !!(
    value &&
    value.trim() &&
    value.trim() !== 'localhost' &&
    value.trim() !== '127.0.0.1' &&
    value.trim() !== '::1'
  )
}

type RateLimitRecord = { count: number; resetAt: number }

const MAX_BUCKET_SIZE = 10_000

export function checkRateLimit(
  bucket: Map<string, RateLimitRecord>,
  ip: string,
  now = Date.now(),
  limit = RATE_LIMIT,
  windowMs = RATE_WINDOW_MS,
): { allowed: boolean; retryAfter: number } {
  const key = ip || 'unknown'
  const record = bucket.get(key)
  if (!record || now > record.resetAt) {
    // Evict expired entries when the bucket grows too large to prevent unbounded memory use
    if (bucket.size > MAX_BUCKET_SIZE) {
      for (const [k, v] of bucket) {
        if (now > v.resetAt) bucket.delete(k)
      }
    }
    bucket.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }
  if (record.count >= limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((record.resetAt - now) / 1000)) }
  }
  record.count += 1
  return { allowed: true, retryAfter: 0 }
}

/* ── CSRF / same-origin guard ─────────────────────────────────
   Browsers attach an Origin header to every cross-origin request
   (and to same-origin POSTs), and an attacker page cannot forge that
   header — the browser sets it. So a "foreign" Origin that does not
   match this server's own Host is proof of a cross-site request and is
   rejected. Requests with NO Origin header (curl, server-to-server,
   Hermes agents, CLI) are allowed through — this is a browser-CSRF
   boundary, not an auth gate; trusted-IP + INTERNAL_API_SECRET are the
   real authorization. Call at the top of every mutating handler. */

export function assertSameOrigin(
  req: Pick<Request, 'headers'>,
): { ok: boolean; status: number; body: Record<string, unknown> } {
  const origin = req.headers.get('origin')
  // Presence of a foreign origin is the signal. Missing Origin = non-browser → allow.
  if (!origin) return { ok: true, status: 200, body: {} }
  const host = req.headers.get('host') ?? req.headers.get('x-forwarded-host')
  if (!host) return { ok: true, status: 200, body: {} }

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return { ok: false, status: 403, body: { error: 'Malformed Origin header.' } }
  }
  // 'null' Origin is sent for sandboxed/opaque origins → treat as foreign.
  if (originHost === 'null' || originHost === '') {
    return { ok: false, status: 403, body: { error: 'Cross-origin request rejected.' } }
  }
  const hostHost = host.includes('://') ? new URL(host).host : host
  if (originHost === hostHost) return { ok: true, status: 200, body: {} }

  return { ok: false, status: 403, body: { error: 'Cross-origin request rejected.' } }
}
