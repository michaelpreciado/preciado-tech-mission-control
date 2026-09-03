import { NextRequest, NextResponse } from 'next/server'
import { getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv } from '@/lib/mission-api'
import { authEnabled, SESSION_COOKIE, verifySessionToken } from '@/lib/session'

/**
 * Auth gate for non-loopback access (portable/cloud deployments, PWA/TWA).
 *
 * Behavior when MC_AUTH_PASSWORD is UNSET: pass everything through — the app
 * keeps its legacy open + loopback/trusted-IP semantics (write routes stay
 * gated per-route). This is the default and MUST NOT change existing LAN /
 * Tailscale behavior.
 *
 * When MC_AUTH_PASSWORD IS SET, every page and API route requires either a
 * trusted IP (loopback or FRIDAY_TRUSTED_IPS CIDR), a valid session cookie,
 * or (for /api/*) the service bearer (INTERNAL_API_SECRET). Untrusted clients
 * can only reach /login, /api/auth/*, and static assets.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-|apple-touch-icon|manifest.json|rain.js|assets/).*)'],
}

const isApiPath = (p: string) => p.startsWith('/api')

export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next()

  const { pathname } = req.nextUrl

  // Public surface: the login page and all /api/auth/* endpoints self-gate
  // (check reports status, login verifies the password, logout clears the cookie).
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) return NextResponse.next()

  // Trusted IPs bypass the login (loopback + FRIDAY_TRUSTED_IPS CIDRs).
  const ip = getClientIpFromHeaders(req.headers)
  if (isTrustedIp(ip === 'unknown' ? '127.0.0.1' : ip, trustedRangesFromEnv())) return NextResponse.next()

  // API-to-API relay: the cloud instance authenticates with the service bearer
  // (server-side), which the home instance accepts regardless of client IP.
  if (isApiPath(pathname)) {
    const secret = process.env.INTERNAL_API_SECRET
    if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return NextResponse.next()
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value
  if (cookie && (await verifySessionToken(cookie))) return NextResponse.next()

  if (isApiPath(pathname)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}
