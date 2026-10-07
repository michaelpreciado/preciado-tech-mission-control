import { NextRequest, NextResponse } from 'next/server'
import { isReadAuthorized } from '@/lib/pt/read-auth'
import { collectDeliverables, unavailableDeliverables } from '@/lib/pt/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" }
export async function GET(req: NextRequest) {
  if (!await isReadAuthorized(req)) return NextResponse.json(unavailableDeliverables('access_denied'), { status: 401, headers })
  if (req.nextUrl.search) return NextResponse.json(unavailableDeliverables('unsupported_query'), { status: 400, headers })
  try { return NextResponse.json(await collectDeliverables(), { headers }) }
  catch { return NextResponse.json(unavailableDeliverables('read_failed'), { status: 503, headers }) }
}
