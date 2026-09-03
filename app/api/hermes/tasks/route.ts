import { NextRequest, NextResponse } from 'next/server'
import { getKanbanSnapshot } from '@/lib/hermes-kanban'
import { checkRateLimit, getClientIpFromHeaders } from '@/lib/mission-api'

export const dynamic = 'force-dynamic'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export async function GET(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const rl = checkRateLimit(rateLimitMap, ip, Date.now(), 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }
  const status = req.nextUrl.searchParams.get('status') ?? undefined
  const limitRaw = Number(req.nextUrl.searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200
  return NextResponse.json(getKanbanSnapshot(status, limit), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
