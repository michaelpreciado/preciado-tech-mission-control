import { NextRequest, NextResponse } from 'next/server'
import { isReadAuthorized } from '@/lib/pt/read-auth'
import { collectCrew, deniedCrewEnvelope } from '@/lib/pt/crew-read'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!await isReadAuthorized(req)) return NextResponse.json(deniedCrewEnvelope(), { status: 401, headers })
  return NextResponse.json(collectCrew(), { headers })
}
