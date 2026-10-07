import { getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv } from '../mission-api'
import { secureEquals, SESSION_COOKIE, verifySessionToken } from '../session'

type ReadRequest = {
  headers: Headers
  cookies: { get(name: string): { value: string } | undefined }
}

/** Private GET policy only. Never use this to authorize mutations.
 * INTENTIONAL: trusted IPs (including Tailnet widget callers) and valid sessions
 * may read without a bearer, even if a supplied bearer is wrong. This is not a
 * bearer-only policy. INTERNAL_API_SECRET is the deployed service credential.
 * The existing proxy-aware resolver and default trusted ranges (including
 * 100.64.0.0/10) own IP trust. Unknown addresses stay unknown.
 * An unset login password/service secret is not permission to read private data.
 */
export async function isReadAuthorized(req: ReadRequest): Promise<boolean> {
  if (isTrustedIp(getClientIpFromHeaders(req.headers), trustedRangesFromEnv())) return true

  const secret = process.env.INTERNAL_API_SECRET
  const authorization = req.headers.get('authorization')
  if (secret && authorization?.startsWith('Bearer ') &&
      await secureEquals(authorization.slice(7), secret)) return true

  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
}
