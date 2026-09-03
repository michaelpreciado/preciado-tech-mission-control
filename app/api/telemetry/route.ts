/**
 * Live host telemetry for the RIG HUD.
 *
 * Separate from /api/mission-control on purpose: that aggregate walks thousands
 * of files and is cached for 15s, which is the wrong shape for a 1 Hz scope
 * trace. This route is a pure read off the in-process sampler — cheap enough to
 * poll every couple of seconds.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getHostMetrics } from '@/lib/host-metrics'
import { checkRateLimit, getClientIpFromHeaders } from '@/lib/mission-api'

export const dynamic = 'force-dynamic'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// 120/min, not the usual 30: the RIG HUD polls this every 2 s (30/min is
// exactly its cadence — a 30/min gate would 429 a visible dashboard).
export async function GET(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateLimitMap, ip, Date.now(), 120, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }
  return NextResponse.json(await getHostMetrics(), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
