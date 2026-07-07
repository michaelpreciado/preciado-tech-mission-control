import { NextRequest } from 'next/server'
import fs from 'node:fs/promises'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// Same-origin passthrough of the event-bus SSE firehose (a read-only sidecar
// tailing the kanban DB task_events). Browser EventSource can't set
// Authorization headers, so the bearer token is attached server-side.
import { getConfig } from '@/lib/config'

async function resolveToken(): Promise<string> {
  if (process.env.EVENTBUS_TOKEN) return process.env.EVENTBUS_TOKEN
  const envFile = getConfig().paths.eventbusEnvFile
  if (!envFile) return ''
  try {
    const text = await fs.readFile(envFile, 'utf8')
    return text.match(/^\s*(?:export\s+)?EVENTBUS_TOKEN\s*=\s*"?([^"\n]+)"?/m)?.[1]?.trim() ?? ''
  } catch {
    return ''
  }
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const

/**
 * When the bus is absent/unauthorized (a normal state for a fresh install),
 * hold a quiet SSE stream open instead of erroring. EventSource treats any
 * non-200 as a connection failure and reconnects every few seconds forever —
 * an idle stream avoids that churn and the matching server-side log spam.
 */
function idleStream(request: NextRequest, reason: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`: event bus unavailable (${reason}) — idle stream\n\n`))
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')) } catch { clearInterval(keepalive) }
      }, 30_000)
      request.signal.addEventListener('abort', () => {
        clearInterval(keepalive)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })
  return new Response(stream, { status: 200, headers: SSE_HEADERS })
}

export async function GET(request: NextRequest) {
  const token = await resolveToken()
  const eventbusUrl = getConfig().services.eventbusUrl
  const since = request.nextUrl.searchParams.get('since')
  const url = since && /^\d+$/.test(since) ? `${eventbusUrl}?since=${since}` : eventbusUrl

  let upstream: Response
  try {
    upstream = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
      // Tie the upstream connection to the client: when the browser closes the
      // EventSource, the proxy connection to the bus is torn down too.
      signal: request.signal,
    })
  } catch {
    // Bus absent is a normal state for a fresh install — see idleStream note.
    return idleStream(request, 'unreachable')
  }

  if (!upstream.ok || !upstream.body) {
    logger.error('events/proxy', new Error(`upstream ${upstream.status}`))
    return idleStream(request, `upstream ${upstream.status}`)
  }

  return new Response(upstream.body, { status: 200, headers: SSE_HEADERS })
}
