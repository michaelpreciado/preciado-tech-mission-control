import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv } from '@/lib/mission-api'
import { getTaskDetail } from '@/lib/hermes-kanban'
import { completeTask, commentTask, unblockTask, setStatusTask } from '@/lib/kanban-actions'
import { dispatchClaude } from '@/lib/kanban-dispatch'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/** Same trusted-client gate as every other write route: bearer INTERNAL_API_SECRET if set, else loopback / FRIDAY_TRUSTED_IPS CIDR. */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  const ip = getClientIpFromHeaders(req.headers)
  return isTrustedIp(ip === 'unknown' ? '127.0.0.1' : ip, trustedRangesFromEnv())
}

/** GET /api/kanban/[id] → full task detail (runs/comments/events) from any board. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id || id.length > 128) return NextResponse.json({ error: 'invalid task id' }, { status: 400 })
  const detail = getTaskDetail(id)
  if (!detail) return NextResponse.json({ error: 'task not found' }, { status: 404 })
  return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } })
}

/** POST /api/kanban/[id] → actions. Body: { action: 'complete'|'comment'|'unblock'|'set-status'|'dispatch-claude', ... }. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const _origin = assertSameOrigin(req)
  if (!_origin.ok) return NextResponse.json(_origin.body, { status: _origin.status })
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    if (!id || id.length > 128) return NextResponse.json({ error: 'invalid task id' }, { status: 400 })

    // The task's origin decides which machine's CLI runs. Look it up first.
    const detail = getTaskDetail(id)
    const origin = detail?.origin

    const b = await req.json()
    const action = String(b?.action ?? '')

    // Dispatch a headless Claude Code worker into the task's own workspace.
    // Returns immediately with the worker pid + log path.
    if (action === 'dispatch-claude') {
      const res = await dispatchClaude(id, detail, origin)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
      return NextResponse.json(
        { ok: true, pid: res.pid, logPath: res.logPath },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    let out: { ok: boolean; error?: string; result?: string }
    if (action === 'complete') {
      out = completeTask(id, typeof b.result === 'string' ? b.result : undefined, origin)
    } else if (action === 'comment') {
      const body = typeof b.body === 'string' ? b.body : ''
      if (!body.trim()) return NextResponse.json({ error: 'comment body is required' }, { status: 400 })
      out = commentTask(id, body, String(b.author ?? 'mission-control'), origin)
    } else if (action === 'unblock') {
      out = unblockTask(id, typeof b.reason === 'string' ? b.reason : undefined, origin)
    } else if (action === 'set-status') {
      const status = typeof b.status === 'string' ? b.status.trim() : ''
      if (!status) return NextResponse.json({ error: 'status is required' }, { status: 400 })
      out = setStatusTask(id, status, detail?.status, origin)
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
