import { NextRequest, NextResponse } from 'next/server'
import { collectLocalAi } from '@/lib/collectors/local-ai'
import { checkRateLimit, getClientIpFromHeaders } from '@/lib/mission-api'

export const dynamic = 'force-dynamic'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

/** Read-only snapshot of the Local AI stack. Each source reports its own state; a failed probe never fails the route. */
export async function GET(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateLimitMap, ip, Date.now(), 30, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }
  try {
    return NextResponse.json(await collectLocalAi(), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'local ai snapshot unavailable' }, { status: 502 })
  }
}
