import { NextRequest, NextResponse } from 'next/server'
import { getBlockedTasks } from '@/lib/hermes-kanban'

export const dynamic = 'force-dynamic'

/**
 * Blocked/failing Hermes tasks — informational "needs a look" signal for
 * ActionFeed's NEEDS YOU strip. Distinct from the markdown-based `data.tasks`
 * attention rows (lib/mission-data.ts): this reads the live ~/.hermes/kanban.db
 * via lib/hermes-kanban.ts, so it surfaces agent-run failures the markdown
 * collector never sees. Read-only, informational only — no decision endpoint.
 */
export async function GET(req: NextRequest) {
  const limitRaw = Number(req.nextUrl.searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20
  return NextResponse.json({ tasks: getBlockedTasks(limit) }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
