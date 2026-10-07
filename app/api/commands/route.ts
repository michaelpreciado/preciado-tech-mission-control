import { NextRequest, NextResponse } from 'next/server'
import { isReadAuthorized } from '@/lib/pt/read-auth'
import { commandsEnvelope, deniedCommandsEnvelope, unavailableCommandsEnvelope } from '@/lib/pt/commands'
import { collectPipelineRadar } from '@/lib/pt/pipeline'
import { collectCrew } from '@/lib/pt/crew-read'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!await isReadAuthorized(req)) return NextResponse.json(deniedCommandsEnvelope(), { status: 401, headers })
  try {
    const [pipeline, crew] = await Promise.all([collectPipelineRadar(), Promise.resolve().then(() => collectCrew())])
    return NextResponse.json(commandsEnvelope({ pipeline, crew }), { headers })
  } catch {
    return NextResponse.json(unavailableCommandsEnvelope(), { status: 503, headers })
  }
}
