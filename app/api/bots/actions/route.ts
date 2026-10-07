import { NextRequest, NextResponse } from 'next/server'
import { herdrGate } from '@/lib/herdr-auth'
import { createBot, deleteBot, gatewayAction, editBotModel, toggleRoutine } from '@/lib/bot-actions'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/bots/actions — bot profile management (Hermes desktop parity).
 *
 * Body (one of):
 *   { action: 'create',        name, cloneFrom }
 *   { action: 'delete',        name }
 *   { action: 'start' | 'stop' | 'restart', name }   — per-bot gateway lifecycle
 *   { action: 'edit-model',    name, model, provider? }
 *   { action: 'toggle-routine', id, enabled }
 *
 * Every branch runs the same gate as create/delete: herdrGate (same-origin +
 * agent-control auth + rate limit), then server-side name/charset/`default` checks in
 * lib/bot-actions.ts. Shells out to the `hermes` CLI — the roster on disk stays
 * the single source of truth.
 */
const LIFECYCLE = new Set(['start', 'stop', 'restart'])
export async function POST(req: NextRequest) {
  const denied = herdrGate(req, true)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })
  try {
    const b = await req.json()
    const action = typeof b?.action === 'string' ? b.action : ''
    if (action === 'create') {
      if (typeof b.name !== 'string' || !b.name.trim()) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 })
      }
      const out = await createBot(b.name, typeof b.cloneFrom === 'string' ? b.cloneFrom : 'default')
      if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 })
      return NextResponse.json({ ok: true, result: out.result }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (action === 'delete') {
      if (typeof b.name !== 'string' || !b.name.trim()) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 })
      }
      const out = await deleteBot(b.name)
      if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 })
      return NextResponse.json({ ok: true, result: out.result }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (LIFECYCLE.has(action)) {
      if (typeof b.name !== 'string' || !b.name.trim()) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 })
      }
      const out = await gatewayAction(b.name, action as 'start' | 'stop' | 'restart')
      if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 })
      return NextResponse.json({ ok: true, result: out.result }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (action === 'edit-model') {
      if (typeof b.name !== 'string' || !b.name.trim()) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 })
      }
      if (typeof b.model !== 'string' || !b.model.trim()) {
        return NextResponse.json({ error: 'model is required' }, { status: 400 })
      }
      const out = await editBotModel(b.name, b.model, typeof b.provider === 'string' ? b.provider : undefined)
      if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 })
      return NextResponse.json({ ok: true, result: out.result }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (action === 'toggle-routine') {
      if (typeof b.id !== 'string' || !b.id.trim()) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }
      const out = await toggleRoutine(b.id, b.enabled !== false)
      if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 })
      return NextResponse.json({ ok: true, result: out.result }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(
      { error: "action must be 'create', 'delete', 'start', 'stop', 'restart', 'edit-model', or 'toggle-routine'" },
      { status: 400 },
    )
  } catch (err) {
    logger.error('bots/actions', err)
    return NextResponse.json({ error: 'could not run bot action' }, { status: 500 })
  }
}