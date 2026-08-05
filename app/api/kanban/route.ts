import { NextRequest, NextResponse } from 'next/server'
import { getKanbanSnapshot } from '@/lib/hermes-kanban'
import { createTask } from '@/lib/kanban-actions'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/** GET /api/kanban → column-grouped multi-machine snapshot. */
export async function GET(req: NextRequest) {
  const limitRaw = Number(req.nextUrl.searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 300
  return NextResponse.json(getKanbanSnapshot(undefined, limit), {
    headers: { 'Cache-Control': 'no-store' },
  })
}

/** POST /api/kanban → create a task. Body: { title, body?, assignee?, priority?, workspace?, origin? }. */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const title = typeof b?.title === 'string' ? b.title.trim() : ''
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
    const out = createTask(title, {
      body: typeof b.body === 'string' ? b.body : undefined,
      assignee: typeof b.assignee === 'string' ? b.assignee : undefined,
      priority: typeof b.priority === 'string' ? b.priority : undefined,
      workspace: typeof b.workspace === 'string' ? b.workspace : undefined,
      origin: typeof b.origin === 'string' ? b.origin : undefined,
    })
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 500 })
    return NextResponse.json({ ok: true, id: out.result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    logger.error('kanban/create', err)
    return NextResponse.json({ error: 'could not create task' }, { status: 500 })
  }
}
