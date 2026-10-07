import { createHash, timingSafeEqual } from 'node:crypto'
import { assertSameOrigin, checkRateLimit, getClientIpFromHeaders, isLoopbackIp, isTrustedIp, parseTrustedIps, trustedRangesFromEnv } from './mission-api'

const reads = new Map<string, { count: number; resetAt: number }>()
const writes = new Map<string, { count: number; resetAt: number }>()

const TAILNET_V4 = parseTrustedIps('100.64.0.0/10')

function bearerMatches(headers: Headers, secret: string): boolean {
  const auth = headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  const digest = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(digest(auth.slice(7)), digest(secret))
}

function isTailnetIp(ip: string): boolean {
  return (isTrustedIp(ip, TAILNET_V4) && !isLoopbackIp(ip)) || ip.toLowerCase().startsWith('fd7a:115c:a1e0:')
}

/**
 * Agent-control authorization (chat, bot lifecycle, kanban writes, handoff, herdr …).
 *
 * Legacy mode (INTERNAL_API_SECRET unset): loopback or a trusted CIDR, as before.
 *
 * Locked mode (INTERNAL_API_SECRET set) — neither the tailnet nor loopback is a
 * trust boundary:
 *   1. `Authorization: Bearer <secret>` — programmatic callers.
 *   2. The dashboard in a browser via `tailscale serve`: Tailscale-User-Login in
 *      MC_TAILSCALE_ALLOWED_LOGINS. tailscale serve overwrites any client copy of
 *      that header and of X-Forwarded-For (verified 2026-10-06), so a tailnet
 *      peer cannot forge it; tagged nodes get no identity. The *.ts.net Host and
 *      tailnet X-Forwarded-For checks reject a DNS-rebound page talking straight
 *      to 127.0.0.1 — a browser cannot forge Host.
 */
export function isAgentControlAuthorized(headers: Headers): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (!secret) return isTrustedIp(getClientIpFromHeaders(headers), trustedRangesFromEnv())
  return bearerMatches(headers, secret) || isAllowedTailnetUser(headers)
}

function isAllowedTailnetUser(headers: Headers): boolean {
  const login = headers.get('tailscale-user-login')?.trim().toLowerCase()
  if (!login) return false
  const host = (headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '')
  if (!host.endsWith('.ts.net')) return false
  if (!isTailnetIp(getClientIpFromHeaders(headers))) return false
  const allowed = (process.env.MC_TAILSCALE_ALLOWED_LOGINS ?? '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return allowed.includes(login)
}

/** Private terminal contents require authorization even when general dashboard reads are public. */
export function herdrGate(req: Pick<Request, 'headers'>, write = false) {
  const origin = assertSameOrigin(req)
  if (!origin.ok) return { status: origin.status, error: 'Cross-origin request rejected' }
  if (!isAgentControlAuthorized(req.headers)) return { status: 401, error: 'unauthorized' }
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(write ? writes : reads, ip, Date.now(), write ? 30 : 120)
  if (!limit.allowed) return { status: 429, error: 'rate limited', retryAfter: limit.retryAfter }
  return null
}
