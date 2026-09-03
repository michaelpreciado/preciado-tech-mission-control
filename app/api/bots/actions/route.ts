import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv } from '@/lib/mission-api'
import { createBot, deleteBot } from '@/lib/bot-actions'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/** Same trusted-client gate as every other write route: bearer INTERNAL_API_SECRET if set, else loopback / FRIDAY_TRUSTED_IPS CIDR. */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  const ip = getClientIpFromHeaders(req.headers)
  return isTrustedIp(ip === 'unknown' ? '127.0.0.1' : ip, trustedRangesFromEnv())
}

/**
 * POST /api/bots/actions — bot profile management (Hermes desktop parity).
 *
 * Body: { action: 'create', name, cloneFrom } | { action: 'delete', name }
 * Safety gates (see lib/bot-actions.ts): name charset, no clobber, `default`
 * protected, live gateway protected. Shells out to `hermes profile` — the
 * roster on disk stays the single source of truth.
 */
export async function POST(req: NextRequest) {
  const _origin = assertSameOrigin(req)
  if (!_origin.ok) return NextResponse.json(_origin.body, { status: _origin.status })
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const b = await req.json()
    const action = typeof b?.action === 'string' ? b.action : ''
    if (action === 'create') {
      if (typeof b.name !== 'string' || !b.name.trim()) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 })
      }
      const out = await createBot(b.name, typeof b.cloneFrom === 'string' ? b.cloneFrom : 'default')
      if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 })
      return NextResponse.json({ ok: true, result: out.result }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (action === 'delete') {
      if (typeof b.name !== 'string' || !b.name.trim()) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 })
      }
      const out = await deleteBot(b.name)
      if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 })
      return NextResponse.json({ ok: true, result: out.result }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ error: "action must be 'create' or 'delete'" }, { status: 400 })
  } catch (err) {
    logger.error('bots/actions', err)
    return NextResponse.json({ error: 'could not run bot action' }, { status: 500 })
  }
}