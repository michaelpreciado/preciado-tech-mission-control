import { NextRequest, NextResponse } from 'next/server'
import { getTaskDetail } from '@/lib/hermes-kanban'
import { completeTask, commentTask, unblockTask } from '@/lib/kanban-actions'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/** GET /api/kanban/[id] → full task detail (runs/comments/events) from any board. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id || id.length > 128) return NextResponse.json({ error: 'invalid task id' }, { status: 400 })
  const detail = getTaskDetail(id)
  if (!detail) return NextResponse.json({ error: 'task not found' }, { status: 404 })
  return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } })
}

/** POST /api/kanban/[id] → actions. Body: { action: 'complete'|'comment'|'unblock', ... }. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    if (!id || id.length > 128) return NextResponse.json({ error: 'invalid task id' }, { status: 400 })

    // The task's origin decides which machine's CLI runs. Look it up first.
    const detail = getTaskDetail(id)
    const origin = detail?.origin

    const b = await req.json()
    const action = String(b?.action ?? '')

    let out: { ok: boolean; error?: string; result?: string }
    if (action === 'complete') {
      out = completeTask(id, typeof b.result === 'string' ? b.result : undefined, origin)
    } else if (action === 'comment') {
      const body = typeof b.body === 'string' ? b.body : ''
      if (!body.trim()) return NextResponse.json({ error: 'comment body is required' }, { status: 400 })
      out = commentTask(id, body, String(b.author ?? 'mission-control'), origin)
    } else if (action === 'unblock') {
      out = unblockTask(id, typeof b.reason === 'string' ? b.reason : undefined, origin)
    } else {
      return NextResponse.json({ error: `unknown action '${action}'` }, { status: 400 })
    }

    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 500 })
    return NextResponse.json({ ok: true, result: out.result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    logger.error('kanban/action', err)
    return NextResponse.json({ error: 'action failed' }, { status: 500 })
  }
}
