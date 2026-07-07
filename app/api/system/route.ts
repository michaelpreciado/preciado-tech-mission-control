import { NextResponse } from 'next/server'
import { collectSystemHealth } from '@/lib/system-health'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await collectSystemHealth(), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
