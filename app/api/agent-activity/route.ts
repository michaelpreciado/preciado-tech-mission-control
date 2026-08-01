/**
 * Live agent activity for the office floor (lib/agent-activity.ts).
 * Read-only. Emits channel state and tty names only — never message bodies,
 * prompts, or filesystem paths.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { collectAgentActivity } from '@/lib/agent-activity'
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
    return NextResponse.json(await collectAgentActivity(), { headers })
  } catch (err) {
    logger.error('agent-activity/api', err)
    return NextResponse.json(
      { generatedAt: new Date().toISOString(), channels: [], terminals: [], gatewayRunning: false },
      { headers },
    )
  }
}
