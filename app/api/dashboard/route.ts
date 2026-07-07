import { type NextRequest, NextResponse } from 'next/server'
import { getCachedMissionData } from '@/lib/server-cache'
import { checkRateLimit, getClientIpFromHeaders, isLoopbackIp, RATE_LIMIT, RATE_WINDOW_MS } from '@/lib/mission-api'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// Backward-compatible alias for older open tabs/components that still request /api/dashboard.
export async function GET(request: NextRequest) {
  const clientIp = getClientIpFromHeaders(request.headers)
  const headers = { 'Cache-Control': 'no-store' }
  const rate = isLoopbackIp(clientIp) ? { allowed: true, retryAfter: 0 } : checkRateLimit(rateLimitMap, clientIp)

  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many dashboard refresh requests. Please wait a moment and try again.' },
      { status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfter) } },
    )
  }

  try {
    const data = await getCachedMissionData()
    return NextResponse.json(data, { headers })
  } catch (error) {
    logger.error('dashboard/api', error)
    return NextResponse.json({ error: 'Dashboard data collection failed. Please try again in a moment.' }, { status: 500, headers })
  }
}
