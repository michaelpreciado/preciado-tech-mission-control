/**
 * Chat with your agent from the dashboard.
 *
 * Backend: the configured agent CLI (default `hermes`) in one-shot mode —
 *   <command> --continue <session> -z <message> --cli
 * The session name keeps conversation continuity across turns; "new chat"
 * from the UI rotates it. One run per agent at a time: turns are heavyweight,
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
import { randomUUID } from 'node:crypto'
import { adapters, configuredAgents, selectAgent, isAgentBusy, withAgentFlight, sendAgent } from '@/lib/agent-adapters'
import { invalidateConversationCache, listConversations, listDevices } from '@/lib/conversations'
import {getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv, checkRateLimit, assertSameOrigin } from '@/lib/mission-api'
import { chatContinuity, continuityStore } from '@/lib/chat-continuity'
import { logger } from '@/lib/logger'
import { sanitizeCliFailure, sanitizeServerError } from '@/lib/server-error-sanitizer'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)
const rateBucket = new Map<string, { count: number; resetAt: number }>()

const RUN_TIMEOUT_MS = 180_000
const MAX_MESSAGE_LEN = 4000
const SESSION_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,48}$/
/** Same conservative id charsets the bot roster uses when it writes
 *  `model.default` — letters, digits and . _ : / - only. */
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,119}$/
const PROVIDER_RE = /^[a-z0-9][a-z0-9._-]{1,39}$/
const availability = new Map<string, boolean>()

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  const ip = getClientIpFromHeaders(req.headers)
  return isTrustedIp(ip === 'unknown' ? '127.0.0.1' : ip, trustedRangesFromEnv())
}

async function checkAvailable(command: string): Promise<boolean> {
  if (availability.has(command)) return availability.get(command)!
  try {
    await execFileAsync(command, ['--version'], { timeout: 15_000 })
    availability.set(command, true)
  } catch {
    availability.set(command, false)
  }
  return availability.get(command)!
}

export async function GET(req?: NextRequest) {
  const session = req ? new URL(req.url).searchParams.get('session') : null
  if (session) {
    if (!req || !isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const profile = new URL(req.url).searchParams.get('profile') || 'default'
    const store = continuityStore()
    try { return NextResponse.json({ continuity: store.get(profile, session) ?? null }, { headers: { 'Cache-Control': 'no-store' } }) }
    finally { store.close() }
  }
  const agents = await Promise.all(configuredAgents().map(async a => ({
    id: a.id, enabled: a.enabled, available: a.enabled && await checkAvailable(a.command),
    continuity: adapters[a.id].continuity, busy: isAgentBusy(a.id),
  })))
  const hermes = configuredAgents()[0]
  return NextResponse.json(
    { available: agents[0].available, command: hermes.command || '(not configured)', busy: isAgentBusy('hermes'), agents },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest) {
  const _origin = assertSameOrigin(req)
  if (!_origin.ok) return NextResponse.json(_origin.body, { status: _origin.status })
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateBucket, ip, Date.now(), 20, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { message?: unknown; session?: unknown; agent?: unknown; profile?: unknown; createSession?: unknown; model?: unknown; provider?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  const agent = selectAgent(body.agent)
  if (!agent) return NextResponse.json({ error: 'unknown agent' }, { status: 400 })
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })
  if (message.length > MAX_MESSAGE_LEN) return NextResponse.json({ error: `message too long (max ${MAX_MESSAGE_LEN})` }, { status: 400 })
  const session = typeof body.session === 'string' && SESSION_RE.test(body.session) ? body.session : agent === 'hermes' ? 'friday-dashboard' : randomUUID()
  if (agent === 'pi' && body.session !== undefined &&
      (typeof body.session !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.session))) {
    return NextResponse.json({ error: 'invalid Pi session id' }, { status: 400 })
  }
  if (agent === 'codex' && body.session !== undefined) {
    return NextResponse.json({ error: 'session continuity unsupported' }, { status: 400 })
  }
  const profile = typeof body.profile === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(body.profile) ? body.profile : undefined
  /* Per-turn model override. Only Hermes accepts `-m/--provider`, so a model on
     the other agents is a client bug worth surfacing rather than ignoring. */
  const model = typeof body.model === 'string' ? body.model.trim() : ''
  if (model && !MODEL_RE.test(model)) return NextResponse.json({ error: 'model id has an unexpected character (letters, digits, and . _ : / - only)' }, { status: 400 })
  const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : ''
  if (provider && !PROVIDER_RE.test(provider)) return NextResponse.json({ error: 'provider id has an unexpected character' }, { status: 400 })
  if ((model || provider) && agent !== 'hermes') {
    return NextResponse.json({ error: 'model override is not supported for this agent' }, { status: 400 })
  }
  const config = configuredAgents().find(a => a.id === agent)
  const command = config?.command || ''
  if (!config?.enabled || !command || !(await checkAvailable(command))) {
    return NextResponse.json({ error: `agent CLI "${command || '(unset)'}" is not available on this machine` }, { status: 503 })
  }

  // An omitted session keeps the historical friday-dashboard fallback. For an
  // explicit Hermes session, distinguish a missing continuation from a CLI
  // failure before spawning the agent. Creation is name-based; continuation
  // with createSession:false is the native Hermes id-based lane.
  if (agent === 'hermes' && typeof body.session === 'string') {
    const local = listDevices().find(d => d.isLocal)?.name
    const sessions = listConversations({ profile: profile || 'default' }).filter(c =>
      c.agent !== 'pi' && c.device === local,
    )
    const selector = body.createSession === false ? 'id' : 'name'
    const existing = sessions.find(c => selector === 'id' ? c.id === session : c.title === session)
    if (!existing && body.createSession !== true) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 })
    }
    if (existing && body.createSession === true && existing.messageCount === 0) {
      return NextResponse.json({ error: 'session already exists' }, { status: 409 })
    }
  }

  let continuity = agent === 'hermes' ? chatContinuity(profile || 'default', session, body.createSession === false ? 'id' : 'name') : undefined
  if (continuity?.herdrPane) return NextResponse.json({ error: 'Session lives in Herdr. Use Continue in herdr to send to its pane.', continuity }, { status: 409 })
  const started = Date.now()
  try {
    const result = await withAgentFlight(agent, () => sendAgent(agent, command, { message, session: continuity?.sessionName || session, profile, createSession: body.createSession === true, resumeById: continuity?.selector === 'id', model: model || undefined, provider: provider || undefined }, RUN_TIMEOUT_MS))
    if (result.status === 409) return NextResponse.json({ error: result.error }, { status: 409 })
    invalidateConversationCache()
    if (continuity) {
      const local = listDevices().find(d => d.isLocal)?.name
      const actual = listConversations({ profile: continuity.profile }).find(c => c.agent !== 'pi' && c.device === local &&
        (continuity!.selector === 'id' ? c.id === session : c.title === session))
      if (actual) {
        const store = continuityStore()
        try {
          continuity = store.save({ ...continuity, hermesSession: actual.id, sessionName: continuity.selector === 'name' ? session : undefined })
          store.alias(continuity.profile, session, continuity)
        } finally { store.close() }
      }
    }
    return NextResponse.json({ reply: result.value, continuity, elapsedMs: Date.now() - started, session: agent === 'codex' ? undefined : session, agent })
  } catch (err) {
    const failure = err as { killed?: boolean; stderr?: unknown; stdout?: unknown; message?: unknown }
    const timedOut = failure.killed
    const stderrTail = sanitizeCliFailure(failure.stderr, failure.stdout, failure.message)
    const error = timedOut
      ? `agent run exceeded ${RUN_TIMEOUT_MS / 1000}s and was stopped${stderrTail ? ` — ${stderrTail}` : ''}`
      : `agent run failed — ${stderrTail || 'no CLI stderr was captured'}`
    // Do not hand the logger a raw child-process Error: its message can carry
    // a provider URL, local path, or another value from the child environment.
    logger.error('chat/run', timedOut ? 'agent run timed out' : 'agent run failed', stderrTail ? { stderr: stderrTail } : undefined)
    return NextResponse.json(
      { error: sanitizeServerError(error, 380), ...(stderrTail ? { detail: sanitizeServerError(stderrTail) } : {}) },
      { status: 502 },
    )
  }
}
