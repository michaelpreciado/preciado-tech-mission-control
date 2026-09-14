import { NextRequest, NextResponse } from 'next/server'
import { continuityStore } from '@/lib/chat-continuity'
import { continueInHerdr } from '@/lib/chat-herdr'
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
    if (input.op === 'continue-chat') {
      if (typeof input.session !== 'string' || typeof input.profile !== 'string' || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000) throw new HerdrError('Invalid chat continuation', 400)
      const store = continuityStore()
      let record
      try { record = store.get(input.profile, input.session) } finally { store.close() }
      if (!record) throw new HerdrError('Send a local MC Hermes message first to register this session.', 404)
      return NextResponse.json(await continueInHerdr(record, input.text.trim()), { headers })
    }
    return NextResponse.json(await herdr.operate(input), { headers })
  } catch (e) {
    if (e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers })
    return NextResponse.json({ error: e instanceof HerdrError ? e.message : 'Agent operation failed', target: e instanceof HerdrError ? e.target : undefined }, { status: e instanceof HerdrError ? e.status : 500, headers })
  }
}
