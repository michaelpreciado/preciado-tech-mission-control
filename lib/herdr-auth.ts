import { assertSameOrigin, checkRateLimit, getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv } from './mission-api'

const reads = new Map<string, { count: number; resetAt: number }>()
const writes = new Map<string, { count: number; resetAt: number }>()

/** Private terminal contents require authorization even when general dashboard reads are public. */
export function herdrGate(req: Pick<Request, 'headers'>, write = false) {
  const origin = assertSameOrigin(req)
  if (!origin.ok) return { status: origin.status, error: 'Cross-origin request rejected' }
  const secret = process.env.INTERNAL_API_SECRET
  const ip = getClientIpFromHeaders(req.headers)
  const authorized = secret
    ? req.headers.get('authorization') === `Bearer ${secret}`
    : isTrustedIp(ip, trustedRangesFromEnv())
  if (!authorized) return { status: 401, error: 'unauthorized' }
  const limit = checkRateLimit(write ? writes : reads, ip, Date.now(), write ? 30 : 120)
  if (!limit.allowed) return { status: 429, error: 'rate limited', retryAfter: limit.retryAfter }
  return null
}
