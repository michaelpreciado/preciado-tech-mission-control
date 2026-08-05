import { NextRequest, NextResponse } from 'next/server'
import { initiateConversation, checkAvailable } from '@/lib/conversation-actions'
import { checkRateLimit, getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv, isLoopbackIp } from '@/lib/mission-api'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const MAX_MESSAGE_LEN = 8000
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
  return checkRateLimit(rateLimitMap, ip, Date.now(), 20, 60_000).allowed
}

/** POST /api/conversations/new — initiate a brand-new conversation. */
export async function POST(req: NextRequest) {
  if (!rate(req)) return NextResponse.json({ error: 'rate limited' }, { status: 429 })
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { message?: unknown; profile?: unknown; device?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })
  if (message.length > MAX_MESSAGE_LEN) return NextResponse.json({ error: `message too long (max ${MAX_MESSAGE_LEN})` }, { status: 400 })
  const profile = typeof body.profile === 'string' && PROFILE_RE.test(body.profile) ? body.profile : 'default'
  const device = typeof body.device === 'string' ? body.device : ''

  if (!checkAvailable(device)) {
    return NextResponse.json({ error: `the hermes agent CLI is not available${device ? ` on ${device}` : ''}` }, { status: 503 })
  }

  logger.info('conversations/new', `profile=${profile} device=${device || '(local)'}`)
  const result = initiateConversation(message, { profile, device })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, reply: result.result, profile, device }, { headers: { 'Cache-Control': 'no-store' } })
}
