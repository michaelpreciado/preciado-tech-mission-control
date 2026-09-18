'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PipelineData } from '@/lib/types'
import { Button, Card, CardHead, Chip, Row, Segmented, Sheet, Stat, fmtDate } from './ui'
import { ClientDocsLink } from './VaultDocuments'
import { apiFetch, apiUrl } from '@/lib/api-base'
import { stageStartedAt } from '@/lib/revenue-pipeline'
import { attention, ClientSummary, nextAction, previewUrl, RevenuePipeline, STAGES } from './RevenuePipeline'
import styles from './Pipeline.module.css'

const POLL_MS = 12_000

export function PipelineBoard() {
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showEvents, setShowEvents] = useState(false)
  const closeDetail = useCallback(() => setSelectedId(null), [])
  const [data, setData] = useState<PipelineData | null>(null)
  const [error, setError] = useState<string | null>(null)
  // task_id → last live event note from the hermes-eventbus firehose
  const [liveNotes, setLiveNotes] = useState<Record<string, string>>({})
  const dataRef = useRef<PipelineData | null>(null)
  dataRef.current = data
  // Rate gate for bus-triggered refetches — same 3s pattern as KanbanBoard so
  // a busy task.progress stream can't hammer /api/pipeline on a phone.
  const lastEventRef = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/pipeline?view=revenue', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  // Subscribe to the hermes-eventbus SSE firehose. Any event whose task_id
  // matches a lead's development.task_id refreshes the board immediately and
  // surfaces the event on the card (live build progress).
  useEffect(() => {
    const es = new EventSource(apiUrl('/api/events'))
    const onAny = (ev: MessageEvent) => {
      try {
        const evt = JSON.parse(ev.data) as { task_id?: string; raw_kind?: string; title?: string }
        if (!evt.task_id) return
        const watched = (dataRef.current?.leads ?? []).some(l => l.development?.taskId === evt.task_id)
        if (!watched) return
        setLiveNotes(prev => ({ ...prev, [evt.task_id as string]: `${evt.raw_kind ?? 'event'} · ${evt.title ?? evt.task_id}` }))
        const now = Date.now()
        if (now - lastEventRef.current > 3000) {
          lastEventRef.current = now
          void refresh()
        }
      } catch { /* non-JSON keepalive */ }
    }
    // The bus emits named SSE events (task.created, task.progress, ...) — listen broadly.
    const names = ['task.created', 'task.assigned', 'task.progress', 'task.done', 'task.failed', 'agent.status', 'message']
    for (const n of names) es.addEventListener(n, onAny as EventListener)
    es.onerror = () => { /* EventSource auto-reconnects */ }
    return () => es.close()
  }, [refresh])

  if (!data && !error) return <Card><CardHead title="Client pipeline" /><p className={styles.note} role="status" aria-live="polite">Loading pipeline…</p></Card>

  const now = data ? Date.parse(data.generatedAt) : Date.now()
  const leads = [...(data?.leads ?? [])].sort((a, b) => Number(Boolean(attention(b, now))) - Number(Boolean(attention(a, now))) || (stageStartedAt(a) ?? '').localeCompare(stageStartedAt(b) ?? ''))
  const stalled = leads.filter(lead => attention(lead, now))
  const selected = leads.find(lead => lead.id === selectedId)
  const summary = data?.sentSummary
  const clientRow = (lead: typeof leads[number]) => <Row key={lead.id} title={lead.businessName} sub={<ClientSummary lead={lead} now={now} />} onClick={() => setSelectedId(lead.id)} aria-label={`Open ${lead.businessName} details`} aria-haspopup="dialog" />

  return <div className={styles.workspace}>
    <div className={styles.boardMain}>
      {error && <p className={styles.error} role="alert">Pipeline unavailable · {error}{data ? ' · showing last snapshot' : ''}</p>}
      <div className={styles.toolbar}><span role="status">{data ? `${data.leadsTotal} clients · updated ${fmtDate(data.generatedAt)}` : 'No snapshot'}{error ? ' · Stale' : ''}</span><Button onClick={() => void refresh()}>Refresh</Button></div>
      <Card as="section" aria-label="Needs attention">
        <CardHead title="Needs attention" sub="Overdue actions or 7+ days in an unfinished stage. Oldest first among clients shown." right={<Chip tone={stalled.length ? 'warn' : 'neutral'}>{stalled.length}</Chip>} />
        {data?.followups && data.followups.overdue > 0 && <p role="status" className={styles.note}>{data.followups.overdue} overdue follow-ups across the full pipeline.</p>}
        <div className={styles.attentionList}>{stalled.slice(0, 3).map(clientRow)}</div>
        {stalled.length > 3 && <p className={styles.note}>{stalled.length - 3} more flagged in the stages below.</p>}
        {!stalled.length && <p className={styles.note}>{data ? 'No stalled work in the current snapshot.' : 'Waiting for pipeline data.'}</p>}
      </Card>
      <Card as="section" aria-label="Pipeline send summary">
        <CardHead title="Delivery activity" sub="Actual sends · Los Angeles time" />
        <div className={styles.metrics}>
          <Stat label="Websites sent out" value={summary?.sentTotal ?? '—'} />
          <Stat label="In queue" value={summary?.queuedTotal ?? '—'} />
          <div role="img" aria-label={`Daily sends this week; ${(summary?.byDayThisWeek ?? []).map(item => `${item.date}: ${item.count} sent`).join('; ') || 'no send activity yet'}`}><Stat label="Sent this week" value={summary?.sentThisWeek ?? '—'} sub={`Week of ${summary?.weekStart ?? '—'}`} series={summary?.byDayThisWeek?.map(item => item.count)} /></div>
          <div role="img" aria-label={`Daily sends this month; ${(summary?.byDayThisMonth ?? []).map(item => `${item.date}: ${item.count} sent`).join('; ') || 'no send activity yet'}`}><Stat label="Sent this month" value={summary?.sentThisMonth ?? '—'} sub={summary?.monthLabel} series={summary?.byDayThisMonth?.map(item => item.count)} /></div>
        </div>
      </Card>
      <div className={styles.mobileFilter}>
        <p id="pipeline-filter-label" className={styles.note}>Filter by stage</p>
        <Segmented className={styles.stageFilter} value={filter} onChange={setFilter} options={[{ value: 'all', label: `All · ${data?.leadsTotal ?? 0}` }, ...STAGES.map(item => ({ value: item.stage, label: `${item.label} · ${data?.counts[item.stage] ?? 0}` }))]} />
      </div>
      <div className={styles.stages}>
        {STAGES.map(col => {
          const items = leads.filter(lead => lead.stage === col.stage)
          const total = data?.counts[col.stage] ?? items.length
          return <Card as="section" key={col.stage} className={`${styles.stage} ${filter !== 'all' && filter !== col.stage ? styles.filteredOut : ''}`}>
            <CardHead title={col.label} sub={col.next} right={<Chip tone={col.tone}>{total}</Chip>} />
            {items.length < total && <p className={styles.note}>Showing {items.length} of {total} clients</p>}
            {items.map(clientRow)}
            {!items.length && <p className={styles.note}>No clients at this stage.</p>}
          </Card>
        })}
      </div>
      {(data?.events.length ?? 0) > 0 && <Card>
        <CardHead title="Recent activity" right={<Button aria-expanded={showEvents} aria-controls="pipeline-events" onClick={() => setShowEvents(value => !value)}>{showEvents ? 'Hide' : 'Show'}</Button>} />
        {showEvents && <div id="pipeline-events">{data!.events.slice(0, 12).map((event, index) => <Row key={index} title={event.businessName ?? event.leadId} sub={`${fmtDate(event.ts)} · ${event.detail ?? event.action ?? event.stage.replaceAll('_', ' ')}`} />)}</div>}
      </Card>}
    </div>
    <aside className={styles.revenueDock} aria-label="Revenue"><RevenuePipeline docked /></aside>
    <Sheet open={Boolean(selected)} onClose={closeDetail} title={selected?.businessName ?? 'Client details'}>
      {selected && <div className={styles.detail}>
        <Card><CardHead title="Next action" sub={nextAction(selected)} /><Row title={selected.businessName} sub={<ClientSummary lead={selected} now={now} />} /></Card>
        <div className={styles.actions}>
          {previewUrl(selected) && <Button variant="primary" href={previewUrl(selected)}>View preview</Button>}
          {selected.website && /^https?:\/\//i.test(selected.website) && <Button href={selected.website}>Website</Button>}
          {selected.phone && <Button href={`tel:${selected.phone.replace(/[^+\d]/g, '')}`}>Call client</Button>}
          <ClientDocsLink leadId={selected.id} />
        </div>
        <Card><CardHead title="Delivery details" />
          {typeof selected.score === 'number' && <Row title="Qualification" trailing={<Stat label="Score" value={selected.score} />} />}
          {selected.vertical && <Row title="Business type" sub={selected.vertical} />}
          {selected.outreach?.status && <Row title="Outreach" sub={selected.outreach.status} />}
          {selected.outreach?.followup_due && <Row title="Follow-up due" sub={fmtDate(selected.outreach.followup_due)} />}
          {selected.location && <Row title="Location" sub={selected.location} />}
          {selected.concept?.designDirection && <Row title="Design direction" sub={selected.concept.designDirection} />}
          {selected.concept?.estimatedScope && <Row title="Scope" sub={selected.concept.estimatedScope} />}
          {selected.approval && <Row title="Approval" sub={selected.approval.status ?? 'Pending'} />}
          {selected.development && <>
            <Row title="Build progress" sub={selected.development.status} trailing={<Stat label="Complete" value={typeof selected.development.progressPct === 'number' ? `${Math.max(0, Math.min(100, selected.development.progressPct))}%` : '—'} />} />
            {selected.development.milestones?.map((milestone, index) => <Row key={index} title={milestone.label} trailing={<Chip>{milestone.done ? 'Done' : 'Pending'}</Chip>} />)}
            {selected.development.taskId && liveNotes[selected.development.taskId] && <p className={styles.note} role="status">{liveNotes[selected.development.taskId]}</p>}
          </>}
          {selected.outreach?.reply && <Row title="Client reply" sub={selected.outreach.reply} />}
          {selected.completed && <Row title="Delivery email" sub={selected.completed.emailStatus?.replaceAll('_', ' ') ?? 'Draft'} />}
          {selected.completed?.emailDraft && <Row title="Email draft" sub={selected.completed.emailDraft} />}
          {Object.entries(selected.socials ?? {}).filter(([, url]) => url && /^https?:\/\//i.test(url)).map(([label, url]) => <Row key={label} title={label} href={url} />)}
        </Card>
        {Boolean(selected.history?.length) && <Card><CardHead title="Stage history" />{selected.history!.map((entry, index) => <Row key={index} title={STAGES.find(item => item.stage === entry.stage)?.label ?? entry.stage} sub={`${fmtDate(entry.ts)}${entry.note ? ` · ${entry.note}` : ''}`} />)}</Card>}
      </div>}
    </Sheet>
  </div>
}
