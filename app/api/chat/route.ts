/**
 * Chat with your agent from the dashboard.
 *
 * Backend: the configured agent CLI (default `hermes`) in one-shot mode —
 *   <command> --continue <session> -z <message> --cli
 * The session name keeps conversation continuity across turns; "new chat"
 * from the UI rotates it. One run at a time: agent turns are heavyweight,
 * so concurrent sends get a 409 instead of queuing silently.
 *
 * Security: same posture as /api/setup — loopback (plus FRIDAY_TRUSTED_IPS)
 * unless INTERNAL_API_SECRET is set (then bearer required). The binary comes from
 * operator config only; the user message is passed as a single argv element
 * (no shell), validated and length-capped.
 */
import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getConfig } from '@/lib/config'
import { getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv, checkRateLimit } from '@/lib/mission-api'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)
const rateBucket = new Map<string, { count: number; resetAt: number }>()

const RUN_TIMEOUT_MS = 180_000
const MAX_MESSAGE_LEN = 4000
const SESSION_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,48}$/

let busy = false
let availability: { command: string; available: boolean } | null = null

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  const ip = getClientIpFromHeaders(req.headers)
  return isTrustedIp(ip === 'unknown' ? '127.0.0.1' : ip, trustedRangesFromEnv())
}

async function checkAvailable(command: string): Promise<boolean> {
  if (availability && availability.command === command) return availability.available
  try {
    await execFileAsync(command, ['--version'], { timeout: 15_000 })
    availability = { command, available: true }
  } catch {
    availability = { command, available: false }
  }
  return availability.available
}

export async function GET() {
  const command = getConfig().chat.command
  const available = command ? await checkAvailable(command) : false
  return NextResponse.json(
    { available, command: available ? command : command || '(not configured)', busy },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateBucket, ip, Date.now(), 20, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { message?: unknown; session?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })
  if (message.length > MAX_MESSAGE_LEN) return NextResponse.json({ error: `message too long (max ${MAX_MESSAGE_LEN})` }, { status: 400 })
  const session = typeof body.session === 'string' && SESSION_RE.test(body.session) ? body.session : 'friday-dashboard'

  const command = getConfig().chat.command
  if (!command || !(await checkAvailable(command))) {
    return NextResponse.json({ error: `agent CLI "${command || '(unset)'}" is not available on this machine` }, { status: 503 })
  }
  if (busy) {
    return NextResponse.json({ error: 'agent is already handling a message — wait for it to finish' }, { status: 409 })
  }

  busy = true
  const started = Date.now()
  try {
    const { stdout, stderr } = await execFileAsync(
      command,
      ['--continue', session, '-z', message, '--cli'],
      { timeout: RUN_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, cwd: process.cwd() },
    )
    const reply = stdout.trim() || stderr.trim() || '(no output)'
    return NextResponse.json({ reply, elapsedMs: Date.now() - started, session })
  } catch (err) {
    logger.error('chat/run', err)
    const timedOut = (err as { killed?: boolean }).killed
    return NextResponse.json(
      { error: timedOut ? `agent run exceeded ${RUN_TIMEOUT_MS / 1000}s and was stopped` : 'agent run failed — check server logs' },
      { status: 502 },
    )
  } finally {
    busy = false
  }
}
