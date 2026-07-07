import { NextRequest, NextResponse } from 'next/server'
import { getTaskDetail } from '@/lib/hermes-kanban'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id || id.length > 128) {
    return NextResponse.json({ error: 'invalid task id' }, { status: 400 })
  }
  const detail = getTaskDetail(id)
  if (!detail) return NextResponse.json({ error: 'task not found' }, { status: 404 })
  return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } })
}
