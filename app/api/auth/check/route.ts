import { NextRequest, NextResponse } from 'next/server'
import { getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv } from '@/lib/mission-api'
import { authEnabled, SESSION_COOKIE, verifySessionToken } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** GET /api/auth/check — is the caller already allowed through? Used by the login page / client gate. */
export async function GET(req: NextRequest) {
  const enabled = authEnabled()
  if (!enabled) {
    return NextResponse.json({ ok: true, authEnabled: false })
  }

  // Same bypass rules as middleware: trusted IP or valid session.
  const ip = getClientIpFromHeaders(req.headers)
  const trusted = isTrustedIp(ip === 'unknown' ? '127.0.0.1' : ip, trustedRangesFromEnv())
  const cookie = req.cookies.get(SESSION_COOKIE)?.value
  const ok = trusted || (cookie ? await verifySessionToken(cookie) : false)
  return NextResponse.json({ ok, authEnabled: true })
}