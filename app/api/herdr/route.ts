import { NextRequest, NextResponse } from 'next/server'
import { herdr } from '@/lib/herdr-bridge'
import { herdrGate } from '@/lib/herdr-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function GET(req: NextRequest) {
  const denied = herdrGate(req)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status, headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json(await herdr.snapshot(), { headers: { 'Cache-Control': 'no-store' } })
}
