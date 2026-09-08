import { NextRequest, NextResponse } from 'next/server'
import { herdr, HerdrError } from '@/lib/herdr-bridge'
import { herdrGate } from '@/lib/herdr-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = herdrGate(req)
  const headers = { 'Cache-Control': 'no-store' }
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status, headers })
  try {
    return NextResponse.json(await herdr.tail((await ctx.params).id, Number(req.nextUrl.searchParams.get('lines') ?? 80)), { headers })
  } catch (e) {
    return NextResponse.json({ error: e instanceof HerdrError ? e.message : 'Tail unavailable' }, { status: e instanceof HerdrError ? e.status : 503, headers })
  }
}
