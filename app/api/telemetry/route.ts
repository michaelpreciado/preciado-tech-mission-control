/**
 * Live host telemetry for the RIG HUD.
 *
 * Separate from /api/mission-control on purpose: that aggregate walks thousands
 * of files and is cached for 15s, which is the wrong shape for a 1 Hz scope
 * trace. This route is a pure read off the in-process sampler — cheap enough to
 * poll every couple of seconds.
 */
import { NextResponse } from 'next/server'
import { getHostMetrics } from '@/lib/host-metrics'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getHostMetrics(), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
