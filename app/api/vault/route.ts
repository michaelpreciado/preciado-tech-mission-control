import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'
import { collectVaultClientDocs, scanVaultDocs } from '@/lib/vault-docs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const SECRET = process.env.INTERNAL_API_SECRET

// Same authorization policy as /api/pipeline and /api/pipeline/review.
function isAuthorized(req: NextRequest): boolean {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || '127.0.0.1'
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true
  if (!SECRET) return true
  return req.headers.get('authorization') === `Bearer ${SECRET}`
}

export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers })
  // Read-only GET; assertSameOrigin is used for mutations in the pipeline API.
  const docs = await scanVaultDocs()
  const clientDocs = await collectVaultClientDocs(docs)
  const groups = [...new Set(docs.map(doc => doc.group))].sort((a, b) =>
    a === 'Root' ? -1 : b === 'Root' ? 1 : a.localeCompare(b))
  return NextResponse.json({ vaultDir: getConfig().paths.vaultDir, docs, groups, clientDocs }, { headers })
}
