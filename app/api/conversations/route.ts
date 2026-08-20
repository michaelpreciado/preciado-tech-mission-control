import { NextRequest, NextResponse } from 'next/server'
import { listConversations, listDevices, localProfiles, conversationStats } from '@/lib/conversations'
import { checkRateLimit, getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv } from '@/lib/mission-api'

export const dynamic = 'force-dynamic'
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  const ip = getClientIpFromHeaders(req.headers)
  return isTrustedIp(ip === 'unknown' ? '127.0.0.1' : ip, trustedRangesFromEnv())
}

/** GET /api/conversations — list every conversation across agents & devices. */
export async function GET(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateLimitMap, ip, Date.now(), 30, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }
  const sp = req.nextUrl.searchParams
  const limitRaw = Number(sp.get('limit'))
  const conversations = listConversations({
    q: sp.get('q') ?? undefined,
    profile: sp.get('profile') ?? undefined,
    device: sp.get('device') ?? undefined,
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
  })
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    conversations,
    devices: listDevices(),
    profiles: localProfiles(),
    // Deliberately unfiltered: the intel panel describes the whole archive, so
    // it must not shrink while the user is typing in the search box.
    stats: conversationStats(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
