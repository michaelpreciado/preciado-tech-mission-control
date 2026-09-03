import { NextRequest, NextResponse } from 'next/server'
import { collectMemoryGraph } from '@/lib/collectors/memory'
import { checkRateLimit, getClientIpFromHeaders } from '@/lib/mission-api'
import { logger } from '@/lib/logger'

// Read-only, local vault scan — not part of the main /api/mission-control
// 30s-poll payload (unlike collectMemory's flat list) since it walks the
// whole vault (hundreds of notes) rather than two capped subfolders. The
// Memory page fetches this route directly, same pattern as /api/pipeline
// and /api/hermes/tasks.
export const dynamic = 'force-dynamic'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export async function GET(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateLimitMap, ip, Date.now(), 30, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }
  try {
    const data = await collectMemoryGraph()
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    logger.error('memory/graph', error)
    return NextResponse.json({ nodes: [], edges: [], totalNotes: 0, connectedNotes: 0 }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
