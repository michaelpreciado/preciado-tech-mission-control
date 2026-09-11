'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PipelineData } from '@/lib/types'
import { deadlineChip, formatTimeInStage, revenueLeads, stageStartedAt } from '@/lib/revenue-pipeline'
import { SkeletonPanel, SectionRule, fmtDate } from './ui'

const POLL_MS = 12_000
const chipStyle = { border: '1px solid currentColor', borderRadius: 'var(--pt-r-sm)', padding: '2px 5px', fontSize: 10 }

export function RevenuePipeline() {
  const [data, setData] = useState<PipelineData | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const reviewBusy = useRef(false)
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current
    const response = await fetch('/api/pipeline?view=revenue', { cache: 'no-store' })
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
      const response = await fetch('/api/pipeline/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: id, review: decision }),
      })
      if (!response.ok) throw new Error(`Review failed (HTTP ${response.status}).`)
      await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Review failed.') }
    finally { reviewBusy.current = false; setPending(null) }
  }

  const shown = revenueLeads(data?.leads ?? [])
  return <section id="home-revenue" aria-labelledby="home-revenue-title" style={{ minWidth: 0, fontFamily: 'var(--pt-font-mono)' }}>
    <SectionRule label="REVENUE PIPELINE" id="home-revenue-title" />
    {error && <p role="alert" style={{ color: 'var(--pt-error-ink)', fontSize: 12 }}>{error}</p>}
    {!data && !error && <SkeletonPanel label="loading pipeline" />}
    {data && !shown.length && <p style={{ color: 'var(--pt-text-dim)', fontSize: 12 }}>No active revenue — pipeline is quiet.</p>}
    <div style={{ overflowX: 'auto' }}>
      {shown.map(lead => {
        const deadline = deadlineChip(lead.extraData?.next_action)
        const preview = lead.previewUrl ?? lead.extraData?.preview_url ?? lead.extraData?.previewUrl ?? lead.completed?.previewUrl
        const safePreview = preview && /^https?:\/\//i.test(preview) ? preview : undefined
        const offer = lead.extraData?.offer_estimate
        const status = lead.approval?.status ?? 'pending'
        const since = stageStartedAt(lead)
        return <div key={lead.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', minWidth: 'max-content', whiteSpace: 'nowrap', borderBottom: '1px solid var(--pt-border-dim)', background: 'var(--pt-surface)', fontSize: 12 }}>
          <strong title={lead.businessName} style={{ width: 190, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--pt-text-high)' }}>▲ {lead.businessName}</strong>
          <span title={lead.stage.replaceAll('_', ' ')} aria-label={lead.stage.replaceAll('_', ' ')} style={{ color: 'var(--pt-neon)' }}>{lead.stage === 'awaiting_approval' ? '⏳' : lead.stage === 'in_development' ? '▶' : '✓'}</span>
          <strong style={{ color: 'var(--pt-text-high)' }}>{typeof offer === 'number' ? `$${offer.toLocaleString('en-US')}` : lead.extraData?.price_range ?? '—'}</strong>
          <span title={since ? `In stage since ${fmtDate(since)}` : 'Stage entry unknown'} style={{ color: 'var(--pt-text-dim)' }}>{formatTimeInStage(since)}</span>
          {deadline.kind !== 'none' && <span style={{ ...chipStyle, color: deadline.kind === 'overdue' ? 'var(--pt-error-ink)' : 'var(--pt-warn-ink)' }}>{deadline.label}</span>}
          {safePreview && <a href={safePreview} target="_blank" rel="noreferrer" style={{ color: 'var(--pt-neon)' }}>◉ preview</a>}
          <span aria-label={`Approval ${status}`} style={{ ...chipStyle, color: status === 'approved' ? 'var(--pt-ok-ink)' : status === 'rejected' ? 'var(--pt-error-ink)' : 'var(--pt-warn-ink)' }}>{status === 'approved' ? '✓' : status === 'rejected' ? '✗' : '⏳ AWAITING'}</span>
          {lead.stage === 'awaiting_approval' && <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button className="mc-btn" disabled={pending !== null} aria-label={`Approve ${lead.businessName} for send`} onClick={() => void review(lead.id, 'approved')}>Approve for send</button>
            <button className="mc-btn" disabled={pending !== null} aria-label={`Hold ${lead.businessName}`} onClick={() => void review(lead.id, 'held')}>Hold</button>
          </span>}
        </div>
      })}
    </div>
    {data && <a href="/pipeline" style={{ display: 'block', padding: '10px 12px', fontSize: 11, color: 'var(--pt-text-dim)' }}>+{Math.max(0, data.leadsTotal - shown.length)} more in the pipeline → /pipeline</a>}
  </section>
}
