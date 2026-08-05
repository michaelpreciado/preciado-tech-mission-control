import { NextRequest, NextResponse } from 'next/server'
import { listConversations, listDevices, localProfiles } from '@/lib/conversations'
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
  const conversations = listConversations({
    q: sp.get('q') ?? undefined,
    profile: sp.get('profile') ?? undefined,
    device: sp.get('device') ?? undefined,
  })
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    conversations,
    devices: listDevices(),
    profiles: localProfiles(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
