import { NextRequest, NextResponse } from 'next/server'
import os from 'node:os'
import { configuredAgents, withAgentFlight } from '@/lib/agent-adapters'
import { getMessages, listConversations } from '@/lib/conversations'
import { readPiSessions } from '@/lib/pi-sessions'
import { buildHandoffBrief, runCodexHandoff } from '@/lib/handoff'
import { assertSameOrigin, getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv, checkRateLimit } from '@/lib/mission-api'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const bucket = new Map<string, { count: number; resetAt: number }>()
export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req)
  if (!origin.ok) return NextResponse.json(origin.body, { status: origin.status })
  const ip = getClientIpFromHeaders(req.headers)
  const secret = process.env.INTERNAL_API_SECRET
  if (secret ? req.headers.get('authorization') !== `Bearer ${secret}` :
    !isTrustedIp(ip, trustedRangesFromEnv())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!checkRateLimit(bucket, ip, Date.now(), 20, 60_000).allowed) return NextResponse.json({ error: 'rate limited' }, { status: 429 })
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  if (!body || Array.isArray(body) || body.agent !== 'codex' || typeof body.sessionId !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(body.sessionId) ||
      typeof body.task !== 'string' || !body.task.trim() || body.task.length > 4000) {
    return NextResponse.json({ error: 'sessionId, agent: codex and task (1–4000 characters) required' }, { status: 400 })
  }
  // No caller-controlled directories or CLI arguments. Reject, never silently ignore.
  if (Object.keys(body).some(key => !['sessionId', 'agent', 'task', 'sourceAgent', 'profile', 'device'].includes(key))) {
    return NextResponse.json({ error: 'unsupported field; cwd is fixed to the server repository' }, { status: 400 })
  }
  try {
    const flight = await withAgentFlight('codex', async () => {
      const sessions = body.sourceAgent === 'pi' ? readPiSessions().map(s => s.conversation) : listConversations({ limit: 5000 })
      const matches = sessions.filter(c => c.id === body.sessionId && c.device === os.hostname() &&
        (body.sourceAgent === undefined || body.sourceAgent === (c.agent || 'hermes')) &&
        (body.profile === undefined || body.profile === c.profile) && (body.device === undefined || body.device === c.device))
      if (matches.length !== 1) return NextResponse.json({ error: 'local session missing or ambiguous' }, { status: 404 })
      const config = configuredAgents().find(a => a.id === 'codex')
      if (!config?.enabled) return NextResponse.json({ error: 'Codex is not enabled in chat.agents' }, { status: 503 })
      const session = matches[0]
      const messages = getMessages({ ...session, sessionId: session.id })
      const brief = buildHandoffBrief(session, messages, body.task.trim(), process.cwd())
      const report = await runCodexHandoff(config.command, brief)
      return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } })
    })
    return flight.status === 409 ? NextResponse.json({ error: flight.error }, { status: 409 }) : flight.value
  } catch {
    return NextResponse.json({ error: 'handoff setup failed' }, { status: 500 })
  }
}
