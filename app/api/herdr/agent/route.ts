import { NextRequest, NextResponse } from 'next/server'
import { herdr, HerdrError } from '@/lib/herdr-bridge'
import { herdrGate } from '@/lib/herdr-auth'
import { readHerdrRequest } from '@/lib/herdr-request'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function POST(req: NextRequest) {
  const denied = herdrGate(req, true)
  const headers = { 'Cache-Control': 'no-store' }
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status, headers })
  try {
    const input = await readHerdrRequest(req)
    return NextResponse.json(await herdr.operate(input), { headers })
  } catch (e) {
    if (e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers })
    return NextResponse.json({ error: e instanceof HerdrError ? e.message : 'Agent operation failed', target: e instanceof HerdrError ? e.target : undefined }, { status: e instanceof HerdrError ? e.status : 500, headers })
  }
}
