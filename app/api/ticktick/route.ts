/**
 * Weekly TickTick tasks for the ASCII calendar on /calendar.
 * Read-only proxy: the server holds the bearer token (keys.ticktickToken),
 * only task titles/dates reach the browser.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { fetchTickTickWeek } from '@/lib/ticktick'
import { checkRateLimit, getClientIpFromHeaders, isLoopbackIp, RATE_LIMIT, RATE_WINDOW_MS } from '@/lib/mission-api'

export const dynamic = 'force-dynamic'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export async function GET(request: NextRequest) {
  const clientIp = getClientIpFromHeaders(request.headers)
  const headers = { 'Cache-Control': 'no-store' }
  const rate = isLoopbackIp(clientIp) ? { allowed: true, retryAfter: 0 } : checkRateLimit(rateLimitMap, clientIp, Date.now(), RATE_LIMIT, RATE_WINDOW_MS)
  if (!rate.allowed) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfter) } })
  }

  const data = await fetchTickTickWeek()
  return NextResponse.json(data, { headers })
}
