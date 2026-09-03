import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/mission-api'
import { sessionCookieOptions, SESSION_COOKIE } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** POST /api/auth/logout — clear the session cookie. */
export async function POST(req: NextRequest) {
  const _origin = assertSameOrigin(req)
  if (!_origin.ok) return NextResponse.json(_origin.body, { status: _origin.status })

  const secure = req.headers.get('x-forwarded-proto') === 'https' || req.nextUrl.protocol === 'https:'
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(secure), maxAge: 0 })
  return res
}