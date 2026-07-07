'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PipelineData, PipelineLead, PipelineStage } from '@/lib/types'
import { SkeletonPanel, fmtDate } from './ui'

const POLL_MS = 12_000

const COLUMNS: { stage: PipelineStage; label: string; glyph: string; hint: string }[] = [
  { stage: 'leads_found', label: 'LEADS FOUND', glyph: '◎', hint: 'play store scan' },
  { stage: 'social_scraped', label: 'SOCIAL SCRAPED', glyph: '⌁', hint: 'ig · fb · linkedin' },
  { stage: 'concept_ready', label: 'CONCEPT READY', glyph: '◇', hint: 'x api inspiration' },
  { stage: 'awaiting_approval', label: 'AWAITING APPROVAL', glyph: '⏳', hint: 'telegram gate' },
  { stage: 'in_development', label: 'IN DEVELOPMENT', glyph: '▶', hint: 'claude code build' },
  { stage: 'completed', label: 'COMPLETED', glyph: '✓', hint: 'email sign-off gate' },
]

function ScoreChip({ score }: { score?: number }) {
  if (typeof score !== 'number') return null
  const tone = score >= 70 ? 'hi' : score >= 40 ? 'mid' : 'lo'
  return <span className={`mc-pipe-score ${tone}`}>SCORE {score}</span>
}

function SocialLinks({ lead }: { lead: PipelineLead }) {
  const entries = Object.entries(lead.socials ?? {}).filter(([, v]) => v)
  if (!entries.length) return null
  return (
    <div className="mc-pipe-socials">
      {entries.map(([k, v]) => (
        <a key={k} href={v} target="_blank" rel="noreferrer" className="mc-pipe-social">
          {k === 'instagram' ? 'IG' : k === 'facebook' ? 'FB' : k === 'linkedin' ? 'LI' : k.toUpperCase()}
        </a>
      ))}
    </div>
  )
}

function ApprovalState({ lead }: { lead: PipelineLead }) {
  const a = lead.approval
  if (!a) return <div className="mc-pipe-row dim">telegram notify pending…</div>
  return (
    <>
      {a.telegramSentAt && <div className="mc-pipe-row">TG sent · {fmtDate(a.telegramSentAt)}</div>}
      <div className={`mc-pipe-approval ${a.status ?? 'pending'}`}>
        {a.status === 'approved' ? '✓ APPROVED' : a.status === 'rejected' ? '✗ REJECTED' : '⏳ AWAITING TELEGRAM REPLY'}
      </div>
    </>
  )
}

function DevProgress({ lead, liveNote }: { lead: PipelineLead; liveNote?: string }) {
  const d = lead.development
  if (!d) return <div className="mc-pipe-row dim">awaiting handoff…</div>
  const pct = Math.max(0, Math.min(100, d.progressPct ?? 0))
  return (
    <>
      {d.status && <div className="mc-pipe-row">{d.status}</div>}
      <div className="mc-pipe-bar"><span style={{ width: `${pct}%` }} /></div>
      <div className="mc-pipe-row dim">{pct}%{d.taskId ? ` · task ${d.taskId.slice(0, 8)}` : ''}</div>
      {(d.milestones ?? []).map((m, i) => (
        <div key={i} className={`mc-pipe-milestone ${m.done ? 'done' : ''}`}>
          <span>{m.done ? '✓' : '·'}</span> {m.label}
        </div>
      ))}
      {liveNote && <div className="mc-pipe-live-note">⚡ {liveNote}</div>}
    </>
  )
}

function CompletedState({ lead }: { lead: PipelineLead }) {
  const c = lead.completed
  if (!c) return <div className="mc-pipe-row dim">finalizing…</div>
  const emailLabel = c.emailStatus === 'sent' ? '✓ EMAIL SENT'
    : c.emailStatus === 'approved' ? '✓ APPROVED — SENDING'
    : c.emailStatus === 'awaiting_signoff' ? '⏳ AWAITING TELEGRAM SIGN-OFF'
    : 'EMAIL DRAFT'
  return (
    <>
      {c.previewUrl && (
        <a className="mc-pipe-preview" href={c.previewUrl} target="_blank" rel="noreferrer">
          ▶ VIEW PREVIEW
        </a>
      )}
      <div className={`mc-pipe-approval ${c.emailStatus === 'sent' || c.emailStatus === 'approved' ? 'approved' : 'pending'}`}>
        {emailLabel}
      </div>
      {c.emailDraft && <div className="mc-pipe-draft">{c.emailDraft}</div>}
    </>
  )
}

function LeadCard({ lead, liveNote }: { lead: PipelineLead; liveNote?: string }) {
  return (
    <div className="mc-pipe-card" data-stage={lead.stage}>
      <div className="mc-pipe-card-head">
        <span className="mc-pipe-name">{lead.businessName}</span>
        <ScoreChip score={lead.score} />
      </div>
      <div className="mc-pipe-meta">
        {lead.location && <span>{lead.location}</span>}
        {lead.vertical && <span>· {lead.vertical}</span>}
        {typeof lead.rating === 'number' && <span>· ★ {lead.rating}{typeof lead.reviewCount === 'number' ? ` (${lead.reviewCount})` : ''}</span>}
      </div>
      {(lead.phone || lead.website || lead.playStoreUrl) && (
        <div className="mc-pipe-meta">
          {lead.phone && <a className="mc-pipe-link" href={`tel:${lead.phone.replace(/[^+\d]/g, '')}`}>{lead.phone}</a>}
          {lead.website && <a className="mc-pipe-link" href={lead.website} target="_blank" rel="noreferrer">site ↗</a>}
          {lead.playStoreUrl && <a className="mc-pipe-link" href={lead.playStoreUrl} target="_blank" rel="noreferrer">play store ↗</a>}
        </div>
      )}

      {lead.stage === 'social_scraped' && <SocialLinks lead={lead} />}
      {lead.stage === 'concept_ready' && lead.concept && (
        <>
          {lead.concept.designDirection && <div className="mc-pipe-row">{lead.concept.designDirection}</div>}
          {(lead.concept.inspirationSources ?? []).slice(0, 3).map((s, i) => (
            <div key={i} className="mc-pipe-row dim">◇ {s}</div>
          ))}
          {lead.concept.estimatedScope && <div className="mc-pipe-row">scope · {lead.concept.estimatedScope}</div>}
        </>
      )}
      {lead.stage === 'awaiting_approval' && <ApprovalState lead={lead} />}
      {lead.stage === 'in_development' && <DevProgress lead={lead} liveNote={liveNote} />}
      {lead.stage === 'completed' && <CompletedState lead={lead} />}

      {Object.entries(lead.extraData ?? {}).slice(0, 3).map(([k, v]) => (
        <div key={k} className="mc-pipe-row dim">{k.replace(/_/g, ' ')}: {v}</div>
      ))}
      <div className="mc-pipe-when">{lead.updatedAt ? fmtDate(lead.updatedAt) : ''}</div>
    </div>
  )
}

export function PipelineBoard() {
  const [data, setData] = useState<PipelineData | null>(null)
  const [error, setError] = useState<string | null>(null)
  // task_id → last live event note from the hermes-eventbus firehose
  const [liveNotes, setLiveNotes] = useState<Record<string, string>>({})
  const dataRef = useRef<PipelineData | null>(null)
  dataRef.current = data

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline', { cache: 'no-store' })
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
    const es = new EventSource('/api/events')
    const onAny = (ev: MessageEvent) => {
      try {
        const evt = JSON.parse(ev.data) as { task_id?: string; raw_kind?: string; title?: string }
        if (!evt.task_id) return
        const watched = (dataRef.current?.leads ?? []).some(l => l.development?.taskId === evt.task_id)
        if (!watched) return
        setLiveNotes(prev => ({ ...prev, [evt.task_id as string]: `${evt.raw_kind ?? 'event'} · ${evt.title ?? evt.task_id}` }))
        void refresh()
      } catch { /* non-JSON keepalive */ }
    }
    // The bus emits named SSE events (task.created, task.progress, ...) — listen broadly.
    const names = ['task.created', 'task.assigned', 'task.progress', 'task.done', 'task.failed', 'agent.status', 'message']
    for (const n of names) es.addEventListener(n, onAny as EventListener)
    es.onerror = () => { /* EventSource auto-reconnects */ }
    return () => es.close()
  }, [refresh])

  if (!data && !error) return <SkeletonPanel label="loading pipeline" />

  const leads = data?.leads ?? []
  const events = data?.events ?? []

  return (
    <>
      {error && <div className="mc-pipe-error">⚠ pipeline store unreachable — {error}</div>}
      <div className="mc-pipeline">
        {COLUMNS.map(col => {
          const items = leads.filter(l => l.stage === col.stage)
          const total = data?.counts?.[col.stage] ?? items.length
          const capped = total > items.length
          return (
            <div key={col.stage} className="mc-window mc-pipe-col">
              <div className={`mc-tcol-head ${col.stage === 'awaiting_approval' ? 'alert' : ''}`}>
                <span className="mc-tcol-glyph">{col.glyph}</span>
                <span>{col.label}</span>
                <span className="mc-tcol-count">{total}</span>
              </div>
              <div className="mc-pipe-hint">
                {capped ? `top ${items.length} of ${total} · ${col.hint}` : col.hint}
              </div>
              <div className="mc-pipe-col-body">
                {items.length === 0 && <div className="mc-pipe-empty">— empty —</div>}
                {items.map(lead => (
                  <LeadCard key={lead.id} lead={lead}
                    liveNote={lead.development?.taskId ? liveNotes[lead.development.taskId] : undefined} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {events.length > 0 && (
        <div className="mc-window mc-pipe-log">
          <div className="mc-tcol-head"><span className="mc-tcol-glyph">≋</span><span>PIPELINE EVENTS</span></div>
          <div className="mc-pipe-log-body">
            {events.slice(0, 12).map((e, i) => (
              <div key={i} className="mc-pipe-log-row">
                <span className="when">{fmtDate(e.ts)}</span>
                <span className="who">{e.businessName ?? e.leadId}</span>
                <span className="stage">{e.stage.replace(/_/g, ' ')}</span>
                {e.action && <span className="act">→ {e.action}</span>}
                {e.detail && <span className="det">{e.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
