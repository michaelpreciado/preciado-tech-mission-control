'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RadarRecord } from '@/lib/pt/pipeline'
import { Button, Card, CardHead, Chip, Row, Segmented, Sheet, Stat, fmtDate } from './ui'
import { ClientDocsLink } from './VaultDocuments'
import { apiUrl } from '@/lib/api-base'
import { ClientSummary, previewUrl, RevenuePipeline, STAGES } from './RevenuePipeline'
import { usePipelineRadar } from './usePipelineRadar'
import styles from './Pipeline.module.css'

export function PipelineBoard() {
  const radar = usePipelineRadar()
  const { envelope, error, refresh, presentation } = radar
  const data = envelope?.data
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const closeDetail = useCallback(() => setSelectedId(null), [])
  const lastEvent = useRef(0)
  const lastEventId = useRef('')
  // SSE only invalidates the authoritative projection. No local status changes.
  useEffect(() => {
    const events = new EventSource(apiUrl('/api/events'))
    const invalidate = (event: MessageEvent) => {
      if (event.lastEventId && event.lastEventId === lastEventId.current) return
      lastEventId.current = event.lastEventId
      if (Date.now() - lastEvent.current < 3000) return
      lastEvent.current = Date.now()
      void refresh()
    }
    for (const name of ['task.created', 'task.progress', 'task.done', 'task.failed', 'pipeline_update']) events.addEventListener(name, invalidate as EventListener)
    return () => events.close()
  }, [refresh])
  if (!data && !error) return <Card><CardHead title="Pipeline radar" /><p className={styles.note} role="status">Loading pipeline…</p></Card>
  const records = data?.records ?? []
  const selected = records.find(record => record.id === selectedId)
  const visible = new Set(data?.display.recordIds ?? [])
  const clientRow = (record: RadarRecord) => <Row key={record.id} title={record.businessName} sub={<ClientSummary record={record} />} onClick={() => setSelectedId(record.id)} aria-label={`Open ${record.businessName} details`} aria-haspopup="dialog" />
  return <div className={styles.workspace}>
    <div className={styles.boardMain}>
      {error && <p className={styles.error} role="alert">{error}{data ? ' · showing last snapshot' : ''}</p>}
      <div className={styles.toolbar}>
        <span role="status">{data ? `${data.recordCount} records · observed ${fmtDate(envelope!.generatedAt)}` : 'No snapshot'} <span className={styles.freshness} data-freshness={presentation.freshness}>{presentation.label}</span></span>
        <Button onClick={() => void refresh()}>Refresh</Button>
      </div>
      <Card as="section" aria-label="Needs attention">
        <CardHead title="Needs attention" sub="Full-store attention. Unfinished work unchanged for 7+ days is stale; only explicit gates request your decision." right={<Chip tone="info">{data?.attentionCount ?? '—'}</Chip>} />
        <div className={styles.metrics}>
          <Stat label="Pending decisions" value={data?.pendingDecisionCount ?? '—'} />
          <Stat label="Blocked active records" value={data?.blockedCount ?? '—'} />
          <Stat label="Active records" value={data?.activeCount ?? '—'} />
          <Stat label="Ready for send review" value={data?.sendReadyCount ?? '—'} />
        </div>
        <div className={styles.attentionList}>{(data?.attentionIds ?? []).slice(0, 3).map(id => records.find(r => r.id === id)!).filter(Boolean).map(clientRow)}</div>
        {!!data?.attentionCount && data.attentionCount > 3 && <p className={styles.note}>{data.attentionCount - 3} more attention records across the full store.</p>}
        {data?.attentionCount === 0 && <p className={styles.note}>No attention recorded in this snapshot.</p>}
      </Card>
      <Card as="section" aria-label="Pipeline evidence summary">
        <CardHead title="Build and outreach evidence" sub="Independent facts across the full store, including dated history." />
        <div className={styles.metrics}>
          <Stat label="Build complete" value={data ? data.evidenceCounts.build.complete ?? 0 : '—'} />
          <Stat label="Review approved" value={data ? data.evidenceCounts.review.approved ?? 0 : '—'} />
          <Stat label="Provider accepted" value={data ? data.evidenceCounts.providerAcceptance.accepted ?? 0 : '—'} />
          <Stat label="Delivered" value={data ? data.evidenceCounts.delivery.delivered ?? 0 : '—'} />
          <Stat label="Reply received" value={data ? data.evidenceCounts.reply.received ?? 0 : '—'} />
          <Stat label="Payment recorded paid" value={data ? data.evidenceCounts.payment.paid ?? 0 : '—'} />
        </div>
        {data && <p className={styles.note}>{data.rawRecordCount} source rows = {data.recordCount} canonical records + {data.duplicateRecordCount} duplicate rows + {data.invalidRecordCount} invalid rows. {data.archivedCount} archived · {data.disqualifiedCount} disqualified. Estimates and approvals do not establish payment.</p>}
      </Card>
      <div className={styles.mobileFilter}>
        <p className={styles.note}>Filter by stage</p>
        <Segmented className={styles.stageFilter} value={filter} onChange={setFilter} options={[{ value: 'all', label: `All · ${data?.recordCount ?? 0}` }, ...STAGES.map(item => ({ value: item.stage, label: `${item.label} · ${data?.counts[item.stage] ?? 0}` }))]} />
      </div>
      <div className={styles.stages}>
        {STAGES.map(col => {
          const items = records.filter(record => record.stage === col.stage && visible.has(record.id))
          const total = data?.counts[col.stage]
          return <Card as="section" key={col.stage} className={`${styles.stage} ${filter !== 'all' && filter !== col.stage ? styles.filteredOut : ''}`}>
            <CardHead title={col.label} sub={`${data?.activeCounts[col.stage] ?? '—'} active`} right={<Chip tone="info">{total ?? '—'}</Chip>} />
            {total !== undefined && items.length < total && <p className={styles.note}>Showing {items.length} of {total} records</p>}
            {items.map(clientRow)}
            {total === 0 && <p className={styles.note}>No records at this stage.</p>}
          </Card>
        })}
      </div>
    </div>
    <aside className={styles.revenueDock} aria-label="Revenue"><RevenuePipeline docked radar={radar} /></aside>
    <Sheet open={Boolean(selected)} onClose={closeDetail} title={selected?.businessName ?? 'Record details'}>
      {selected && <div className={styles.detail}>
        <Card><CardHead title="Next action" sub={selected.nextAction} /><Row title={selected.businessName} sub={<ClientSummary record={selected} />} /></Card>
        <div className={styles.actions}>
          {previewUrl(selected.lead) && <Button variant="primary" href={previewUrl(selected.lead)}>View preview</Button>}
          {selected.lead.website && /^https?:\/\//i.test(selected.lead.website) && <Button href={selected.lead.website}>Website</Button>}
          {selected.lead.phone && <Button href={`tel:${selected.lead.phone.replace(/[^+\d]/g, '')}`}>Call client</Button>}
          <ClientDocsLink leadId={selected.id} />
        </div>
        <Card><CardHead title="Independent evidence" sub="Unknown means evidence is absent. Dates belong to the recorded fact." />
          {Object.entries(selected.facts).map(([key, fact]) => <Row key={key} title={key.replace(/([A-Z])/g, ' $1')} sub={`${fact.state.replaceAll('_', ' ')} · ${fact.sourceAt ? fmtDate(fact.sourceAt) : 'date unknown'}${fact.blocked ? ' · blocked' : ''}`} />)}
          <Row title="Source rows" sub={selected.sourceIndices.join(', ')} />
          {selected.blockedReasons.length > 0 && <Row title="Blocking evidence" sub={selected.blockedReasons.join(', ')} />}
        </Card>
        <Card><CardHead title="Client details" />
          {typeof selected.lead.score === 'number' && <Row title="Qualification score" sub={String(selected.lead.score)} />}
          {selected.lead.vertical && <Row title="Business type" sub={selected.lead.vertical} />}
          {selected.lead.location && <Row title="Location" sub={selected.lead.location} />}
          {selected.lead.concept?.designDirection && <Row title="Design direction" sub={selected.lead.concept.designDirection} />}
          {selected.lead.concept?.estimatedScope && <Row title="Scope" sub={selected.lead.concept.estimatedScope} />}
          {selected.lead.outreach?.followup_due && <Row title="Recorded follow-up due" sub={selected.lead.outreach.followup_due} />}
          {selected.lead.outreach?.reply && <Row title="Recorded reply" sub={selected.lead.outreach.reply} />}
          {selected.lead.completed?.emailDraft && <Row title="Email draft" sub={selected.lead.completed.emailDraft} />}
          {Object.entries(selected.lead.socials ?? {}).filter(([, url]) => url && /^https?:\/\//i.test(url)).map(([label, url]) => <Row key={label} title={label} href={url} />)}
        </Card>
        {Boolean(selected.lead.history?.length) && <Card><CardHead title="Stage history" />{selected.lead.history!.map((entry, index) => <Row key={index} title={entry.stage} sub={`${fmtDate(entry.ts)}${entry.note ? ` · ${entry.note}` : ''}`} />)}</Card>}
      </div>}
    </Sheet>
  </div>
}
