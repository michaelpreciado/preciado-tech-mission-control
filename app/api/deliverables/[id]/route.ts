import { NextRequest, NextResponse } from 'next/server'
import { isReadAuthorized } from '@/lib/pt/read-auth'
import { readDeliverable, unavailableDeliverables } from '@/lib/pt/deliverables'
import { ArtifactError } from '@/lib/pt/artifact-files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" }
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await isReadAuthorized(req)) return NextResponse.json(unavailableDeliverables('access_denied'), { status: 401, headers })
  const query = req.nextUrl.searchParams
  if ([...query.keys()].some(k => !['revision', 'evidenceRevision'].includes(k)) || query.getAll('revision').length > 1 || query.getAll('evidenceRevision').length > 1) return NextResponse.json(unavailableDeliverables('unsupported_query'), { status: 400, headers })
  try {
    return NextResponse.json(await readDeliverable((await context.params).id, query.get('revision'), query.get('evidenceRevision')), { headers })
  } catch (error) {
    const status = error instanceof ArtifactError ? error.status : 503
    return NextResponse.json(unavailableDeliverables(error instanceof ArtifactError ? error.message : 'read_failed'), { status, headers })
  }
}
