import { NextRequest, NextResponse } from 'next/server'
import { authEnabled } from '@/lib/session'
import { isReadAuthorized } from '@/lib/pt/read-auth'

export const dynamic = 'force-dynamic'

/** GET /api/auth/check — is the caller already allowed through? Used by the login page / client gate. */
export async function GET(req: NextRequest) {
  const ok = await isReadAuthorized(req)
  return NextResponse.json({ ok, authEnabled: authEnabled() }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
