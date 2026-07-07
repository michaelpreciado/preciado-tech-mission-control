import { NextRequest, NextResponse } from 'next/server'
import { getKanbanSnapshot } from '@/lib/hermes-kanban'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? undefined
  const limitRaw = Number(req.nextUrl.searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100
  return NextResponse.json(getKanbanSnapshot(status, limit), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
