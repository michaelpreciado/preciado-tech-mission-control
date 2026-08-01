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
  const forwarded = headers.get('x-forwarded-for')
  const firstForwarded = forwarded?.split(',')[0]?.trim()
  const realIp = headers.get('x-real-ip')?.trim()
  return firstForwarded || realIp || 'unknown'
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

   Note: x-forwarded-for is client-supplied and therefore spoofable by anyone
   who can reach the port. This is a convenience boundary for a private
   network, NOT an authentication mechanism — set INTERNAL_API_SECRET if the
   port is exposed anywhere untrusted. */

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
  const value = ipv4ToInt(ip)
  if (value === null) return false
  return ranges.some(({ base, bits }) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return ((value & mask) >>> 0) === base
  })
}

/** Allowlist from FRIDAY_TRUSTED_IPS. Re-read per call so .env edits apply on restart only. */
export function trustedRangesFromEnv(): TrustedRange[] {
  return parseTrustedIps(process.env.FRIDAY_TRUSTED_IPS)
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
