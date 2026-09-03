import { NextRequest, NextResponse } from 'next/server'
import { collectSystemHealth } from '@/lib/system-health'
import { checkRateLimit, getClientIpFromHeaders } from '@/lib/mission-api'

export const dynamic = 'force-dynamic'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export async function GET(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateLimitMap, ip, Date.now(), 30, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }
  return NextResponse.json(await collectSystemHealth(), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
