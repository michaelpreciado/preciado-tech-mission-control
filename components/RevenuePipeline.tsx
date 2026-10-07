'use client'

import { useState, type CSSProperties } from 'react'
import STAGE_LABELS from '@/lib/pt/stage-labels.json'
import { THEME_CSS_VARIABLES } from '@/lib/pt/theme'
import type { RadarRecord, RadarStage } from '@/lib/pt/pipeline'
import { Button, Card, CardHead, Chip, Row, Stat } from './ui'
import { apiFetch } from '@/lib/api-base'
import { usePipelineRadar } from './usePipelineRadar'
import styles from './Pipeline.module.css'

export const STAGES = Object.entries(STAGE_LABELS).map(([stage, label]) => ({ stage: stage as RadarStage, label }))
export function ClientSummary({ record }: { record: RadarRecord }) {
  return <span className={styles.clientSummary}>
    <span className={styles.chips}><Chip tone="info">{STAGES.find(s => s.stage === record.stage)?.label}</Chip>
      <span className={styles.freshness} data-freshness={record.freshness}>{record.freshness}{record.blocked ? ' · blocked' : ''}</span>
      {record.archived && <Chip>Archived</Chip>}{record.disqualified && <Chip>Disqualified</Chip>}
      {record.requiresBoss && <Chip tone="info">Decision requested</Chip>}
    </span>
    <span className={styles.next}>Next · {record.nextAction}</span>
    {record.attention.map(reason => <span key={reason}>{reason}</span>)}
    <span>Evidence · {record.sourceAt ? new Date(record.sourceAt).toLocaleDateString() : 'date unknown'}</span>
  </span>
}
export function previewUrl(lead: RadarRecord['lead']) {
  const value = lead.previewUrl ?? lead.extraData?.preview_url ?? lead.extraData?.previewUrl ?? lead.completed?.previewUrl
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : undefined
}

export function RevenuePipeline({ docked = false, radar: supplied }: { docked?: boolean; radar?: ReturnType<typeof usePipelineRadar> }) {
  const own = usePipelineRadar(!supplied)
  const { envelope, error, refresh, presentation } = supplied ?? own
  const data = envelope?.data
  const [pending, setPending] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState('')
  async function review(id: string, decision: 'approved' | 'held') {
    if (pending) return
    setPending(id); setReviewError('')
    try {
      const response = await apiFetch('/api/pipeline/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: id, review: decision }) })
      if (!response.ok) throw new Error(`Review failed (HTTP ${response.status}).`)
      await refresh()
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Review failed.') }
    finally { setPending(null) }
  }
  const shown = (data?.revenue.recordIds ?? []).map(id => data!.records.find(record => record.id === id)!).filter(Boolean)
  return <Card as="section" id="home-revenue" aria-labelledby="home-revenue-title" className={styles.revenue} style={THEME_CSS_VARIABLES as CSSProperties}>
    <CardHead title={<span id="home-revenue-title">Revenue pipeline</span>} sub={`Offers and approvals · ${presentation.label}`} />
    {(error || reviewError) && <p role="alert" className={styles.error}>{reviewError || error}</p>}
    {!data && !error && <p role="status" className={styles.note}>Loading revenue…</p>}
    {data && <>
      <div className={styles.metrics}>
        <Stat label="Active offer estimates" value={data.revenue.pricedCount ? `$${data.revenue.offerEstimate.toLocaleString('en-US')}` : '—'} sub={`${data.revenue.pricedCount} of ${data.revenue.activeCount} active offers priced · not collected revenue`} />
        <Stat label="Pending decisions" value={data.pendingDecisionCount} />
      </div>
      {!shown.length && <p className={styles.note}>No active offers in this snapshot.</p>}
      {shown.map(record => <div key={record.id} className={styles.revenueClient}>
        <Row title={record.businessName} sub={<ClientSummary record={record} />} />
        <div className={styles.actions}>
          {previewUrl(record.lead) && <Button href={previewUrl(record.lead)}>View preview</Button>}
          <Chip>Review · {record.facts.review.state}</Chip>
          {record.requiresBoss && record.gate === 'approval_required' && <>
            <Button variant="primary" disabled={pending !== null || presentation.freshness !== 'fresh'} loading={pending === record.id} aria-label={`Approve ${record.businessName} for send`} onClick={() => void review(record.id, 'approved')}>Approve for send</Button>
            <Button disabled={pending !== null || presentation.freshness !== 'fresh'} aria-label={`Hold ${record.businessName}`} onClick={() => void review(record.id, 'held')}>Hold</Button>
          </>}
        </div>
      </div>)}
      {!docked && <div className={styles.actions}><Button href="/pipeline">Open pipeline · {data.recordCount} records</Button></div>}
    </>}
  </Card>
}
