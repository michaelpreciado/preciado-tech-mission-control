import { NextRequest, NextResponse } from 'next/server'
import { collectSubAgentDeck } from '@/lib/collectors/subagents'
import { checkRateLimit, getClientIpFromHeaders, isLoopbackIp, RATE_LIMIT, RATE_WINDOW_MS } from '@/lib/mission-api'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export async function GET(request: NextRequest) {
  const clientIp = getClientIpFromHeaders(request.headers)
  const headers = { 'Cache-Control': 'no-store' }
  const rate = isLoopbackIp(clientIp)
    ? { allowed: true, retryAfter: 0 }
    : checkRateLimit(rateLimitMap, clientIp, Date.now(), RATE_LIMIT, RATE_WINDOW_MS)
  if (!rate.allowed) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfter) } })
  }

  try {
    return NextResponse.json(await collectSubAgentDeck(), { headers })
  } catch (err) {
    logger.error('subagents/api', err)
    return NextResponse.json(
      { generatedAt: new Date().toISOString(), tree: [], mesh: [], gatewayRunning: false, openclawUp: false, lastActivityAt: null, warnings: ['subagents collector failed'] },
      { headers },
    )
  }
}
