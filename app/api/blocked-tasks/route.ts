import { NextRequest, NextResponse } from 'next/server'
import { getBlockedTasks } from '@/lib/hermes-kanban'
import { checkRateLimit, getClientIpFromHeaders } from '@/lib/mission-api'

export const dynamic = 'force-dynamic'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

/**
 * Blocked/failing Hermes tasks — informational "needs a look" signal for
 * ActionFeed's NEEDS YOU strip. Distinct from the markdown-based `data.tasks`
 * attention rows (lib/mission-data.ts): this reads the live ~/.hermes/kanban.db
 * via lib/hermes-kanban.ts, so it surfaces agent-run failures the markdown
 * collector never sees. Read-only, informational only — no decision endpoint.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const rl = checkRateLimit(rateLimitMap, ip, Date.now(), 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }
  const limitRaw = Number(req.nextUrl.searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20
  return NextResponse.json({ tasks: getBlockedTasks(limit) }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
