import { NextRequest, NextResponse } from 'next/server'
import { getCachedMissionData } from '@/lib/server-cache'
import { checkRateLimit, getClientIpFromHeaders, isLoopbackIp, normalizeStream, streamPayload, VALID_STREAMS } from '@/lib/mission-api'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export async function GET(request: NextRequest) {
  const clientIp = getClientIpFromHeaders(request.headers)
  const stream = request.nextUrl.searchParams.get('stream')
  const headers = { 'Cache-Control': 'no-store' }

  // Validate stream param before doing any work
  const normalized = normalizeStream(stream)
  if (normalized === 'invalid') {
    return NextResponse.json(
      { error: `Unknown mission-control stream "${String(stream).slice(0, 40)}".`, hint: `Use one of: ${VALID_STREAMS.join(', ')}.` },
      { status: 400, headers },
    )
  }

  const rate = isLoopbackIp(clientIp) ? { allowed: true, retryAfter: 0 } : checkRateLimit(rateLimitMap, clientIp)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Mission Control is receiving too many refresh requests. Please wait a moment and try again.' },
      { status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfter) } },
    )
  }

  try {
    const data = await getCachedMissionData()
    const payload = streamPayload(data, stream)
    return NextResponse.json(payload.body, { status: payload.status, headers })
  } catch (error) {
    logger.error('mission-control/api', error)
    return NextResponse.json(
      { error: 'Mission Control could not refresh live data. The last known dashboard may still be usable; try again in a moment.' },
      { status: 500, headers },
    )
  }
}
