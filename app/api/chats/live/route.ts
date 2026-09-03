import { NextRequest, NextResponse } from 'next/server'
import { recentChats } from '@/lib/chats'
import { checkRateLimit, getClientIpFromHeaders } from '@/lib/mission-api'

export const dynamic = 'force-dynamic'
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

/**
 * GET /api/chats/live?since=<ms> — every recent session across local profiles
 * with messages newer than the cursor. The Chat tab's live pane polls this at
 * ~3s; `since` is the client's last seen timestamp (pass 0 / omit for a full
 * 5-minute lookback). Read-only.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateLimitMap, ip, Date.now(), 120, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }
  const raw = Number(req.nextUrl.searchParams.get('since'))
  const since = Number.isFinite(raw) && raw > 0 ? raw : 0
  const { sessions, generatedAt } = recentChats(since)
  return NextResponse.json({ generatedAt, since, sessions }, { headers: { 'Cache-Control': 'no-store' } })
}