import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/mission-api'
import { authEnabled, authPassword, createSessionToken, secureEquals, sessionCookieOptions, SESSION_COOKIE } from '@/lib/session'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/** POST /api/auth/login — verify password, set session cookie. */
export async function POST(req: NextRequest) {
  const _origin = assertSameOrigin(req)
  if (!_origin.ok) return NextResponse.json(_origin.body, { status: _origin.status })

  if (!authEnabled()) {
    return NextResponse.json({ error: 'auth is not enabled (set MC_AUTH_PASSWORD)' }, { status: 403 })
  }
  const password = authPassword()

  let body: { password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (typeof body?.password !== 'string' || !body.password) {
    return NextResponse.json({ error: 'password is required' }, { status: 400 })
  }

  const ok = await secureEquals(body.password, password)
  if (!ok) {
    logger.warn('auth/login', 'failed login attempt (invalid password)')
    return NextResponse.json({ error: 'invalid password' }, { status: 401 })
  }

  const token = await createSessionToken()
  const secure = req.headers.get('x-forwarded-proto') === 'https' || req.nextUrl.protocol === 'https:'
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(secure))
  return res
}