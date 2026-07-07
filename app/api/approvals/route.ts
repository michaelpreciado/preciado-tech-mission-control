import { NextRequest, NextResponse } from 'next/server'
import { collectApprovals } from '@/lib/approvals-data'
import { upsertLead } from '@/lib/pipeline-data'
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

export async function GET(req: NextRequest) {
  const data = await collectApprovals()
  if (req.nextUrl.searchParams.get('count') === '1') {
    return NextResponse.json({ pending: data.counts.pending }, { headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Decide an approval from the dashboard. Body: { id, decision: 'approve'|'reject', note? }
 * Writes the same pipeline-store fields a Telegram reply sets — both channels
 * stay in sync, and the web-dev-pipeline skill reads one source of truth.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { id?: string; decision?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { id, decision } = body
  if (!id || typeof id !== 'string' || (decision !== 'approve' && decision !== 'reject')) {
    return NextResponse.json({ error: 'expected { id, decision: approve|reject }' }, { status: 400 })
  }
  const note = typeof body.note === 'string' ? body.note.slice(0, 300) : undefined
  const now = new Date().toISOString()
  const sessionId = 'mission-control-dashboard'

  try {
    if (id.startsWith('pipeline:')) {
      const leadId = id.slice('pipeline:'.length)
      const approve = decision === 'approve'
      const result = await upsertLead({
        leadId,
        // Approval moves the card to in_development automatically (per the
        // pipeline spec); rejection keeps it in awaiting_approval, flagged.
        stage: approve ? 'in_development' : undefined,
        fields: { approval: { status: approve ? 'approved' : 'rejected', decided_at: now, decided_via: 'dashboard' } },
        detail: note ?? `${approve ? 'Approved' : 'Rejected'} from mission control dashboard`,
        sessionId,
        forceEvent: true,
      })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ ok: true, decision, lead: result.lead, action: result.action })
    }

    if (id.startsWith('email:')) {
      const leadId = id.slice('email:'.length)
      const approve = decision === 'approve'
      const result = await upsertLead({
        leadId,
        fields: {
          completed: {
            // approved = the skill may send; rejected goes back to draft for rework.
            email_status: approve ? 'approved' : 'draft',
            signoff_decided_at: now,
            signoff_decided_via: 'dashboard',
          },
        },
        detail: note ?? `Email ${approve ? 'sign-off APPROVED' : 'rejected back to draft'} from mission control dashboard`,
        sessionId,
        forceEvent: true,
      })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ ok: true, decision, lead: result.lead })
    }

    return NextResponse.json({ error: 'this approval kind is informational only' }, { status: 400 })
  } catch (err) {
    logger.error('approvals/post', err)
    return NextResponse.json({ error: 'failed to record decision' }, { status: 500 })
  }
}
