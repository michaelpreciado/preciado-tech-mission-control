import { NextRequest, NextResponse } from 'next/server'
import { sessionMessages } from '@/lib/chats'
import { checkRateLimit, getClientIpFromHeaders } from '@/lib/mission-api'

export const dynamic = 'force-dynamic'
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

/**
 * GET /api/chats/[session]?profile=<name> — one session's full message thread
 * from the local profile store. Read-only; used by the live pane's
 * click-through detail view.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ session: string }> }) {
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateLimitMap, ip, Date.now(), 60, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }
  const { session } = await params
  const profile = req.nextUrl.searchParams.get('profile') ?? 'default'
  const messages = sessionMessages(profile, session)
  return NextResponse.json({ session, profile, messages }, { headers: { 'Cache-Control': 'no-store' } })
}