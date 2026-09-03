import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'

export const dynamic = 'force-dynamic'

/**
 * Cloud-relay passthrough (portable mode).
 *
 * The full collectors (kanban DB, session logs, cron, SSH remotes, …) live on
 * the home/Tailscale box and CANNOT be lifted to a thin cloud/UI instance. So a
 * cloud instance of the SAME codebase serves only the UI and proxies every
 * /api/upstream/* call to the home instance, authenticated with the service
 * bearer (API_RELAY_TOKEN > INTERNAL_API_SECRET).
 *
 * Client wiring: the cloud profile sets MC_API_BASE=/api/upstream (runtime) or
 * NEXT_PUBLIC_API_BASE=/api/upstream (build), so the UI fetches same-origin
 * /api/upstream/api/<path> and this route forwards to <home>/api/<path>.
 *
 * When API_RELAY_BASE is unset (the normal local/Tailscale case) this route
 * answers 404 — it never shadows the real local routes (Next prefers static
 * route files over this catch-all).
 */

const FORWARD_BLOCKLIST = new Set([
  'host',
  'origin',
  'authorization',
  'cookie',
  'connection',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'accept-encoding',
])

const RESPONSE_COPY = ['content-type', 'cache-control', 'retry-after', 'last-modified', 'etag', 'x-accel-buffering', 'location']

interface RelayCtx {
  segments: string[]
  request: NextRequest
}

async function relay(ctx: RelayCtx) {
  const base = process.env.API_RELAY_BASE || getConfig().services.apiRelayBase
  if (!base) {
    return NextResponse.json(
      { error: 'relay not configured', hint: 'set API_RELAY_BASE on this instance' },
      { status: 404 },
    )
  }
  const token = process.env.API_RELAY_TOKEN || process.env.INTERNAL_API_SECRET
  if (!token) {
    return NextResponse.json(
      { error: 'relay not configured', hint: 'set API_RELAY_TOKEN or INTERNAL_API_SECRET for upstream auth' },
      { status: 503 },
    )
  }

  const { request, segments } = ctx
  const target = `${base.replace(/\/+$/, '')}/${segments.join('/')}${request.nextUrl.search}`

  const headers = new Headers()
  for (const [k, v] of request.headers) {
    if (!FORWARD_BLOCKLIST.has(k.toLowerCase())) headers.set(k, v)
  }
  // Authenticate with the service bearer (the home/middleware accepts it at any IP).
  headers.set('authorization', `Bearer ${token}`)
  // Preserve the original client chain so the home instance can rate-limit per-user
  // and apply its own trusted-IP logic. Never let an absent chain collapse to
  // 'unknown' (which home treats as loopback).
  const xff = request.headers.get('x-forwarded-for')
  headers.set('x-forwarded-for', xff || request.headers.get('x-real-ip') || 'unknown')

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
    signal: request.signal,
  }
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    ;(init as unknown as { duplex: string }).duplex = 'half'
    init.body = request.body
  }

  let upstream: Response
  try {
    upstream = await fetch(target, init)
  } catch (err) {
    return NextResponse.json(
      { error: 'relay upstream unreachable', detail: err instanceof Error ? err.message : 'fetch failed' },
      { status: 502 },
    )
  }

  const outHeaders = new Headers()
  for (const k of RESPONSE_COPY) {
    const v = upstream.headers.get(k)
    if (v) outHeaders.set(k, v)
  }
  if (!outHeaders.has('content-type') && upstream.headers.get('content-type')) {
    outHeaders.set('content-type', upstream.headers.get('content-type')!)
  }
  if (typeof upstream.body === 'undefined' || upstream.body === null) {
    return new Response(null, { status: upstream.status, headers: outHeaders })
  }
  return new Response(upstream.body as ReadableStream, { status: upstream.status, headers: outHeaders })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path = [] } = await params
  return relay({ request, segments: path })
}
export async function POST(request: NextRequest, ctxPar: { params: Promise<{ path: string[] }> }) {
  const { path = [] } = await ctxPar.params
  return relay({ request, segments: path })
}
export async function PUT(request: NextRequest, ctxPar: { params: Promise<{ path: string[] }> }) {
  const { path = [] } = await ctxPar.params
  return relay({ request, segments: path })
}
export async function PATCH(request: NextRequest, ctxPar: { params: Promise<{ path: string[] }> }) {
  const { path = [] } = await ctxPar.params
  return relay({ request, segments: path })
}
export async function DELETE(request: NextRequest, ctxPar: { params: Promise<{ path: string[] }> }) {
  const { path = [] } = await ctxPar.params
  return relay({ request, segments: path })
}
export async function OPTIONS(request: NextRequest, ctxPar: { params: Promise<{ path: string[] }> }) {
  const { path = [] } = await ctxPar.params
  return relay({ request, segments: path })
}