import { NextRequest, NextResponse } from 'next/server'
import { getMessages } from '@/lib/conversations'
import { continueConversation } from '@/lib/conversation-actions'
import {checkRateLimit, getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv, isLoopbackIp, assertSameOrigin } from '@/lib/mission-api'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const MAX_MESSAGE_LEN = 8000
const SESSION_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
const PROFILE_RE = /^[a-zA-Z0-9][a-zA-Z0-9\/_-]{0,63}$/

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  const ip = getClientIpFromHeaders(req.headers)
  return isTrustedIp(ip === 'unknown' ? '127.0.0.1' : ip, trustedRangesFromEnv())
}

function rate(req: NextRequest): boolean {
  const ip = getClientIpFromHeaders(req.headers)
  if (isLoopbackIp(ip)) return true
  const r = checkRateLimit(rateLimitMap, ip, Date.now(), 20, 60_000)
  if (r.allowed) return true
  return false
}

type RouteCtx = { params: Promise<{ id: string }> }

/** GET /api/conversations/[id] — full message thread for a conversation. */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const sp = _req.nextUrl.searchParams
  const profile = sp.get('profile') ?? 'default'
  const device = sp.get('device') ?? ''
  if (!SESSION_RE.test(id)) {
    return NextResponse.json({ error: 'invalid conversation id' }, { status: 400 })
  }
  const messages = getMessages({ profile, device, sessionId: id })
  return NextResponse.json({ id, profile, device, messages }, { headers: { 'Cache-Control': 'no-store' } })
}

function enc(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

/** POST /api/conversations/[id] — continue an existing conversation (SSE stream). */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const _origin = assertSameOrigin(req)
  if (!_origin.ok) return NextResponse.json(_origin.body, { status: _origin.status })
  const { id } = await ctx.params
  if (!rate(req)) return NextResponse.json({ error: 'rate limited' }, { status: 429 })
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { message?: unknown; profile?: unknown; device?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })
  if (message.length > MAX_MESSAGE_LEN) return NextResponse.json({ error: `message too long (max ${MAX_MESSAGE_LEN})` }, { status: 400 })
  const profile = typeof body.profile === 'string' && PROFILE_RE.test(body.profile) ? body.profile : 'default'
  const device = typeof body.device === 'string' ? body.device : ''
  if (!SESSION_RE.test(id)) return NextResponse.json({ error: 'invalid conversation id' }, { status: 400 })

  logger.info('conversations/continue', `id=${id} profile=${profile} device=${device || '(local)'} len=${message.length}`)

  const startMs = Date.now()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(enc('start', { profile, device }))

      const hb = setInterval(() => {
        if (closed) return
        controller.enqueue(enc('heartbeat', { elapsedMs: Date.now() - startMs }))
      }, 5000)

      try {
        const result = await continueConversation(id, message, { profile, device })
        if (!result.ok) {
          controller.enqueue(enc('done', { ok: false, error: result.error }))
        } else {
          const messages = getMessages({ profile, device, sessionId: id })
          controller.enqueue(enc('done', { ok: true, reply: result.result, messages }))
        }
      } catch (err) {
        controller.enqueue(enc('done', { ok: false, error: 'agent run failed' }))
        logger.warn('conversations/continue', String(err))
      } finally {
        clearInterval(hb)
        closed = true
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
