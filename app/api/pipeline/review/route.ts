import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import { assertSameOrigin } from '@/lib/mission-api'
import { pipelineStore, upsertLead } from '@/lib/pipeline-data'
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

async function findLead(id: string) {
  try {
    const store = JSON.parse(await fs.readFile(pipelineStore(), 'utf8'))
    const leads: { id: string; [key: string]: unknown }[] = Array.isArray(store) ? store : store.leads
    return leads.find(lead => lead.id === id)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('lead_id')
  if (!id) return NextResponse.json({ error: 'missing lead_id' }, { status: 400 })
  try {
    const lead = await findLead(id)
    if (!lead) return NextResponse.json({ error: 'unknown lead_id' }, { status: 404 })
    return NextResponse.json(lead, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    logger.error('pipeline/review', err)
    return NextResponse.json({ error: 'failed to read pipeline store' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req)
  if (!origin.ok) return NextResponse.json(origin.body, { status: origin.status })
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const { lead_id: id, review } = (body ?? {}) as Record<string, unknown>
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || (review !== 'approved' && review !== 'held')) {
    return NextResponse.json({ error: 'lead_id and review (approved or held) are required' }, { status: 400 })
  }
  try {
    if (!await findLead(id)) return NextResponse.json({ error: 'unknown lead_id' }, { status: 404 })
    // Record the decision without changing stage or triggering downstream actions.
    const result = await upsertLead({
      leadId: id,
      fields: {
        extra_data: { reviewed_at: new Date().toISOString(), review },
        ...(review === 'approved' ? { approval: { status: 'approved' } } : {}),
      },
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true, lead: result.lead })
  } catch (err) {
    logger.error('pipeline/review', err)
    return NextResponse.json({ error: 'failed to update pipeline store' }, { status: 500 })
  }
}
