import { NextResponse } from 'next/server'
import { collectMemoryGraph } from '@/lib/collectors/memory'
import { logger } from '@/lib/logger'

// Read-only, local vault scan — not part of the main /api/mission-control
// 30s-poll payload (unlike collectMemory's flat list) since it walks the
// whole vault (hundreds of notes) rather than two capped subfolders. The
// Memory page fetches this route directly, same pattern as /api/pipeline
// and /api/hermes/tasks.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await collectMemoryGraph()
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    logger.error('memory/graph', error)
    return NextResponse.json({ nodes: [], edges: [], totalNotes: 0, connectedNotes: 0 }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
