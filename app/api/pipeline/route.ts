import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import { collectPipeline, pipelineStore, upsertLead } from '@/lib/pipeline-data'
import type { PipelineStage } from '@/lib/types'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const SECRET = process.env.INTERNAL_API_SECRET

function isAuthorized(req: NextRequest): boolean {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || '127.0.0.1'
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true
  if (!SECRET) return true
  return req.headers.get('authorization') === `Bearer ${SECRET}`
}

export async function GET() {
  const data = await collectPipeline()
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Upsert a lead / record a stage transition. Producers: the web-dev-pipeline
 * skill, Hermes, the Telegram approval bridge, and the dashboard approvals
 * inbox (via lib/pipeline-data upsertLead — single write path).
 *
 * Body: { lead_id, business_name?, stage?, fields?: {...}, detail? }
 * `fields` is merged into the stored lead record verbatim (snake_case keys
 * as documented in web-dev-pipeline/README.md).
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  try {
    const result = await upsertLead({
      leadId: typeof body.lead_id === 'string' ? body.lead_id : '',
      businessName: typeof body.business_name === 'string' ? body.business_name : undefined,
      stage: body.stage as PipelineStage | undefined,
      fields: body.fields && typeof body.fields === 'object' ? body.fields as Record<string, unknown> : undefined,
      detail: typeof body.detail === 'string' ? body.detail : undefined,
      sessionId: typeof body.session_id === 'string' ? body.session_id : undefined,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true, lead: result.lead, action: result.action })
  } catch (err) {
    logger.error('pipeline/post', err)
    return NextResponse.json({ error: 'failed to update pipeline store' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const leadId = req.nextUrl.searchParams.get('lead_id')
  if (!leadId) return NextResponse.json({ error: 'missing lead_id' }, { status: 400 })
  try {
    const parsed = JSON.parse(await fs.readFile(pipelineStore(), 'utf8'))
    if (!parsed || !Array.isArray(parsed.leads)) return NextResponse.json({ ok: true, removed: 0 })
    const before = parsed.leads.length
    parsed.leads = parsed.leads.filter((l: { id?: string }) => l.id !== leadId)
    parsed.updated_at = new Date().toISOString()
    await fs.writeFile(pipelineStore(), JSON.stringify(parsed, null, 2))
    return NextResponse.json({ ok: true, removed: before - parsed.leads.length })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return NextResponse.json({ ok: true, removed: 0 })
    logger.error('pipeline/delete', err)
    return NextResponse.json({ error: 'failed to update pipeline store' }, { status: 500 })
  }
}
