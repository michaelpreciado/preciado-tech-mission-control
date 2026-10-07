import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'
import { collectVaultClientDocs, scanVaultDocs } from '@/lib/vault-docs'
import { isReadAuthorized } from '@/lib/pt/read-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!await isReadAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers })
  // Read-only GET; assertSameOrigin is used for mutations in the pipeline API.
  const docs = await scanVaultDocs()
  const clientDocs = await collectVaultClientDocs(docs)
  const groups = [...new Set(docs.map(doc => doc.group))].sort((a, b) =>
    a === 'Root' ? -1 : b === 'Root' ? 1 : a.localeCompare(b))
  return NextResponse.json({ vaultDir: getConfig().paths.vaultDir, docs, groups, clientDocs }, { headers })
}
