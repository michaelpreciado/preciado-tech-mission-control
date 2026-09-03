import { NextRequest, NextResponse } from 'next/server'
import { collectBots } from '@/lib/collectors/bots'
import { checkRateLimit, getClientIpFromHeaders } from '@/lib/mission-api'

export const dynamic = 'force-dynamic'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

/**
 * GET /api/bots — the Bot Mode roster: every local Hermes profile with its
 * model, gateway status, session/message counts, last activity, and its
 * `[bot:<name>]` cron routines. Read-only; create / rename / delete land on a
 * gated action route in a later pass.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateLimitMap, ip, Date.now(), 30, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }
  try {
    const snapshot = await collectBots()
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json(
      { error: 'failed to collect bots', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
