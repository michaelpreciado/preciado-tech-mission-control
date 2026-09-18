'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PipelineData, PipelineLead, PipelineStage } from '@/lib/types'
import { deadlineChip, followupChip, formatTimeInStage, revenueLeads, stageStartedAt } from '@/lib/revenue-pipeline'
import { Button, Card, CardHead, Chip, Row, Stat, type ChipTone } from './ui'
import { apiFetch } from '@/lib/api-base'
import styles from './Pipeline.module.css'

const POLL_MS = 12_000
export const STAGES: { stage: PipelineStage; label: string; next: string; tone: ChipTone }[] = [
  { stage: 'leads_found', label: 'Leads found', next: 'Qualify lead', tone: 'neutral' },
  { stage: 'social_scraped', label: 'Social scraped', next: 'Prepare concept', tone: 'neutral' },
  { stage: 'concept_ready', label: 'Concept ready', next: 'Review preview', tone: 'info' },
  { stage: 'awaiting_approval', label: 'Awaiting approval', next: 'Review proposal', tone: 'info' },
  { stage: 'in_development', label: 'In development', next: 'Review build progress', tone: 'info' },
  { stage: 'completed', label: 'Completed', next: 'Review delivery sign-off', tone: 'neutral' },
]
export function StageChip({ stage }: { stage: PipelineStage }) {
  const item = STAGES.find(item => item.stage === stage)!
  return <span aria-label={stage.replaceAll('_', ' ')}><Chip tone={item.tone}>{item.label}</Chip></span>
}
export function nextAction(lead: PipelineLead) {
  return lead.extraData?.next_action || (lead.completed?.emailStatus === 'sent' ? 'Delivery sent' : STAGES.find(item => item.stage === lead.stage)!.next)
}
export function buildValue(lead: PipelineLead) {
  const offer = lead.extraData?.offer_estimate
  return typeof offer === 'number' && Number.isFinite(offer) ? `$${offer.toLocaleString('en-US')}` : lead.extraData?.price_range || 'Not recorded'
}
export function attention(lead: PipelineLead, now = Date.now()) {
  const followup = followupChip(lead, now)
  const due = deadlineChip(typeof lead.extraData?.next_action_due === 'string' ? lead.extraData.next_action_due : undefined, now)
  const since = stageStartedAt(lead)
  if (followup.kind === 'overdue') return 'Follow-up overdue'
  if (due.kind === 'overdue') return 'Next action overdue'
  // A visible operational heuristic, not a stored SLA. Completed work is exempt.
  if (lead.stage !== 'completed' && since && now - Date.parse(since) >= 7 * 86400000) return 'Stalled · 7+ days'
  return ''
}
export function ClientSummary({ lead, now = Date.now() }: { lead: PipelineLead; now?: number }) {
  const stalled = attention(lead, now)
  return <span className={styles.clientSummary}>
    <span className={styles.chips}><StageChip stage={lead.stage} />{stalled && <Chip tone="warn">{stalled}</Chip>}</span>
    <span className={styles.next}>Next · {nextAction(lead)}</span>
    <span>{formatTimeInStage(stageStartedAt(lead), now)} in stage</span>
    <span>Build · {buildValue(lead)}</span>
    <span>Deposit · {storedTerm(lead, 'deposit')} · Care · {storedTerm(lead, 'care_plan')}</span>
  </span>
}
function storedTerm(lead: PipelineLead, key: string) {
  const value = lead.extraData?.[key]
  return typeof value === 'string' && value.trim() ? value : 'Not recorded'
}
export function previewUrl(lead: PipelineLead) {
  const value = lead.previewUrl ?? lead.extraData?.preview_url ?? lead.extraData?.previewUrl ?? lead.completed?.previewUrl
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : undefined
}

export function RevenuePipeline({ docked = false }: { docked?: boolean }) {
  const [data, setData] = useState<PipelineData | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const reviewBusy = useRef(false)
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current
    const response = await apiFetch('/api/pipeline?view=revenue', { cache: 'no-store' })
    if (!response.ok) throw new Error(`Unable to load revenue (HTTP ${response.status}).`)
    const result: PipelineData = await response.json()
    if (version === requestVersion.current) { setData(result); setError('') }
  }, [])
  useEffect(() => {
    const poll = () => {
      if (!reviewBusy.current) void refresh().catch(err => setError(err.message))
    }
    poll()
    const timer = window.setInterval(() => { if (!document.hidden) poll() }, POLL_MS)
    return () => { clearInterval(timer); ++requestVersion.current }
  }, [refresh])

  async function review(id: string, decision: 'approved' | 'held') {
    if (reviewBusy.current) return
    reviewBusy.current = true
    ++requestVersion.current
    setPending(id)
    setError('')
    try {
      const response = await apiFetch('/api/pipeline/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: id, review: decision }),
      })
      if (!response.ok) throw new Error(`Review failed (HTTP ${response.status}).`)
      await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Review failed.') }
    finally { reviewBusy.current = false; setPending(null) }
  }

  const shown = revenueLeads(data?.leads ?? [])
  const active = (data?.leads ?? []).filter(lead => lead.stage === 'awaiting_approval' || lead.stage === 'in_development')
  const priced = active.filter(lead => typeof lead.extraData?.offer_estimate === 'number' && Number.isFinite(lead.extraData.offer_estimate))
  const estimated = priced.reduce((sum, lead) => sum + lead.extraData!.offer_estimate!, 0)
  return <Card as="section" id="home-revenue" aria-labelledby="home-revenue-title" className={styles.revenue}>
    <CardHead title={<span id="home-revenue-title">Revenue pipeline</span>} sub="Offers and approvals" />
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!data && !error && <p role="status" aria-live="polite" className={styles.note}>Loading revenue…</p>}
    {data && <>
      <div className={styles.metrics}>
        <Stat label="Active offer estimates" value={priced.length ? `$${estimated.toLocaleString('en-US')}` : '—'} sub={`${priced.length} of ${active.length} active clients priced · not collected revenue`} />
        <Stat label="Awaiting approval" value={data.counts.awaiting_approval} />
      </div>
      {!shown.length && <p className={styles.note}>No active revenue — pipeline is quiet.</p>}
      {shown.map(lead => <div key={lead.id} className={styles.revenueClient}>
        <Row title={lead.businessName} sub={<ClientSummary lead={lead} />} />
        <div className={styles.actions}>
          {previewUrl(lead) && <Button href={previewUrl(lead)}>View preview</Button>}
          <span aria-label={`Approval ${lead.approval?.status ?? 'pending'}`}><Chip tone="neutral">{lead.extraData?.review === 'held' ? 'Held' : `Approval ${lead.approval?.status ?? 'pending'}`}</Chip></span>
          {lead.stage === 'awaiting_approval' && <>
            <Button variant="primary" disabled={pending !== null} loading={pending === lead.id} aria-label={`Approve ${lead.businessName} for send`} onClick={() => void review(lead.id, 'approved')}>Approve for send</Button>
            <Button disabled={pending !== null} aria-label={`Hold ${lead.businessName}`} onClick={() => void review(lead.id, 'held')}>Hold</Button>
          </>}
        </div>
      </div>)}
      {!docked && <div className={styles.actions}><Button href="/pipeline">Open pipeline · {data.leadsTotal} clients</Button></div>}
    </>}
  </Card>
}
