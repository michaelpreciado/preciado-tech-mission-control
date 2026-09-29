'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useLiveData } from './LiveDataProvider'
import type { HermesTask, SystemHealthData } from '@/lib/types'
import type { BusEvent } from '@/lib/telemetry-types'
import { apiFetch } from '@/lib/api-base'

const POLL_MS = 15_000
const ALERT_MAX_AGE_MS = 48 * 60 * 60 * 1000
const DISMISS_MAX_AGE_MS = 72 * 60 * 60 * 1000
const DISMISS_STORAGE_KEY = 'mc-dismissed-alerts-v1'
type Dismissal = { id: string; at: number }

function sweepDismissals(value: unknown, now: number): Dismissal[] {
  if (!Array.isArray(value)) return []
  const entries = new Map<string, Dismissal>()
  for (const entry of value) {
    if (entry && typeof entry.id === 'string' && typeof entry.at === 'number'
      && Number.isFinite(entry.at) && entry.at > 0 && entry.at <= now
      && now - entry.at < DISMISS_MAX_AGE_MS) {
      const previous = entries.get(entry.id)
      if (!previous || entry.at > previous.at) entries.set(entry.id, { id: entry.id, at: entry.at })
    }
  }
  return [...entries.values()].sort((a, b) => a.at - b.at).slice(-200)
}

function persistDismissals(entries: Dismissal[]) {
  try { window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(entries)) } catch {
    // Dismissal still works in memory when storage is unavailable.
  }
}

export type FeedRow = {
  id: string
  tone: 'urgent' | 'warn' | 'note'
  glyph: string
  text: string
  href: string
  eventTs?: number
}

function eventTime(ts: number): string {
  const millis = ts < 10_000_000_000 ? ts * 1000 : ts
  const age = Math.max(0, Date.now() - millis)
  if (age < 60_000) return 'now'
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m`
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h`
  return new Date(millis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function eventTone(event: BusEvent): FeedRow['tone'] {
  const signal = `${event.type} ${event.raw_kind} ${event.status ?? ''}`.toLowerCase()
  if (/failed|blocked|error|crash|gave_up|timed_out/.test(signal)) return 'urgent'
  if (/assign|attention|warn/.test(signal)) return 'warn'
  return 'note'
}

function eventRow(event: BusEvent): FeedRow {
  const kind = event.raw_kind || event.type
  const agent = event.to_agent || event.from_agent || 'EVENT BUS'
  const task = event.title || event.task_id || 'mission event'
  const tone = eventTone(event)
  return {
    id: `event:${event.id}`,
    tone,
    glyph: tone === 'urgent' ? '✕' : tone === 'warn' ? '⚠' : '·',
    text: `${eventTime(event.ts)} · ${agent.toUpperCase()} · ${kind} · ${task}`,
    href: event.type === 'agent.status' ? '/crew' : '/kanban',
    eventTs: typeof event.ts === 'number'
      ? (event.ts < 10_000_000_000 ? event.ts * 1000 : event.ts)
      : NaN,
  }
}

/** Persisted alert dismissals (localStorage, swept after 72h). `now` advances on each poll so aged-out alerts drop. */
export function useAlertDismissals(enabled = true) {
  const [dismissed, setDismissed] = useState<Dismissal[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    const loadedAt = Date.now()
    let entries: Dismissal[] = []
    try {
      entries = sweepDismissals(JSON.parse(window.localStorage.getItem(DISMISS_STORAGE_KEY) || '[]'), loadedAt)
    } catch { /* Ignore malformed or unavailable storage. */ }
    setDismissed(entries)
    setNow(loadedAt)
    persistDismissals(entries)
    const timer = window.setInterval(() => setNow(Date.now()), POLL_MS)
    return () => window.clearInterval(timer)
  }, [enabled])

  function dismiss(id: string) {
    const at = Date.now()
    const entries = sweepDismissals([...dismissed, { id, at }], at)
    setDismissed(entries)
    setNow(at)
    persistDismissals(entries)
  }

  const dismissedIds = new Set(sweepDismissals(dismissed, now).map(entry => entry.id))
  return { dismissedIds, dismiss, now }
}

/** True when an alert row is fresh enough to show: untimestamped live-state rows always are; events must be recent and not in the future. */
export function isFreshAlert(row: FeedRow, now: number): boolean {
  return (row.tone === 'urgent' || row.tone === 'warn')
    && (row.eventTs === undefined || (Number.isFinite(row.eventTs) && row.eventTs > 0
      && row.eventTs <= now && now - row.eventTs <= ALERT_MAX_AGE_MS))
}

/** Every derived feed row: bus events, service health, crew, tasks, warnings, collector errors. */
export function useFeedRows() {
  const { data, events, eventStream } = useLiveData()
  const [health, setHealth] = useState<SystemHealthData | null>(null)
  const [blockedTasks, setBlockedTasks] = useState<HermesTask[]>([])

  const refresh = useCallback(async () => {
    const [h, b] = await Promise.allSettled([
      apiFetch('/api/system', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
      apiFetch('/api/blocked-tasks', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
    ])
    if (h.status === 'fulfilled' && h.value) setHealth(h.value)
    if (b.status === 'fulfilled' && b.value?.tasks) setBlockedTasks(b.value.tasks)
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const rows: FeedRow[] = events.map(eventRow)
  for (const svc of health?.services ?? []) {
    // Store-freshness probes (pipeline store, cron jobs.json) are telemetry, not
    // actions — a 16h-old store shouldn't read as "needs you". Only surface real
    // service state (gateways, Ollama, event bus, kanban DB).
    const TELEMETRY_ONLY = new Set(['pipeline-store', 'cron-jobs'])
    if (TELEMETRY_ONLY.has(svc.id)) continue
    if (svc.status === 'down') rows.push({ id: `svc:${svc.id}`, tone: 'urgent', glyph: '✕', text: `${svc.name} — ${svc.detail}`, href: '/' })
    else if (svc.status === 'warn') rows.push({ id: `svc:${svc.id}`, tone: 'warn', glyph: '⚠', text: `${svc.name} — ${svc.detail}`, href: '/' })
  }
  for (const member of data?.crew ?? []) {
    if (member.status === 'attention') {
      rows.push({ id: `crew:${member.id}`, tone: 'warn', glyph: '⌬', text: `${member.name} needs attention — ${member.signal}`, href: '/crew' })
    }
  }
  for (const task of (data?.tasks ?? []).filter(t => t.status === 'attention').slice(0, 3)) {
    rows.push({ id: `task:${task.id}`, tone: 'warn', glyph: '≡', text: `${task.title} (${task.ownerName})`, href: '/kanban' })
  }
  for (const [i, warning] of (data?.warnings ?? []).entries()) {
    rows.push({ id: `warn:${i}`, tone: 'note', glyph: '◇', text: warning, href: '/' })
  }
  for (const [collector, error] of Object.entries(data?.collectorErrors ?? {})) {
    rows.push({ id: `collector:${collector}`, tone: 'urgent', glyph: '✕', text: `Collector ${collector} — ${error}`, href: '/' })
  }
  for (const task of blockedTasks.slice(0, 3)) {
    rows.push({ id: `hermes:${task.id}`, tone: 'warn', glyph: '⚠', text: `Hermes task ${task.status} — ${task.title}`, href: '/kanban' })
  }
  return { rows, health, data, events, eventStream }
}

/**
 * Needs-my-action strip — the first thing on the Deck (and on mobile, the
 * first thing on screen): down services, agents/tasks in trouble (both the
 * markdown-sourced attention tasks and live Hermes kanban.db blocked/failing
 * tasks), data warnings. Everything taps through to its tab.
 */
export function ActionFeed({ compact = false }: { compact?: boolean }) {
  const { rows, health, data, events, eventStream } = useFeedRows()
  const { dismissedIds, dismiss: dismissAlert, now } = useAlertDismissals(compact)

  if (compact) {
    const alerts = rows.filter(row => !dismissedIds.has(row.id) && isFreshAlert(row, now))
      .sort((a, b) => Number(b.tone === 'urgent') - Number(a.tone === 'urgent'))
    return <details className="mc-urgent-strip">
      <summary><span className="mc-urgent-dot" data-alert={alerts.length > 0} aria-hidden="true" /><span className="mc-urgent-label"><span className="mc-urgent-eyebrow">NEEDS ATTENTION</span><strong>{alerts.length ? `${alerts.length} need attention` : !health ? 'Checking notifications…' : 'No urgent notifications'}</strong></span><span className="mc-urgent-preview">{alerts[0]?.text || (events[0] ? eventRow(events[0]).text : health ? 'No urgent notifications' : 'Checking notifications…')}</span><span className="mc-urgent-toggle" aria-hidden="true">⌄</span></summary>
      <div className="mc-urgent-details">
        {alerts.length ? alerts.map(row => <div key={row.id} className="mc-urgent-row">
          <Link href={row.href === '/' ? '#home-system-telemetry' : row.href}>{row.text}<span aria-hidden="true">↗</span></Link>
          <button type="button" className="mc-urgent-dismiss" aria-label={`Dismiss alert: ${row.text}`} onClick={() => dismissAlert(row.id)}>×</button>
        </div>) : <p>No services or tasks currently need your attention.</p>}
      </div>
    </details>
  }

  const shown = rows.slice(0, 8)
  const extra = rows.length - shown.length
  const urgentCount = rows.filter(r => r.tone === 'urgent').length

  return (
    <div className={`mc-feed ${urgentCount ? 'has-urgent' : ''}`}>
      <div className="mc-feed-head">
        <span className="mc-feed-title">{compact ? '> NEEDS YOU' : '> MISSION FEED'}</span>
        <span className={`mc-feed-count ${urgentCount ? 'hot' : ''}`}>
          {compact ? (urgentCount ? `${urgentCount} URGENT` : 'ALL CLEAR') : eventStream.toUpperCase()}
        </span>
      </div>
      {(shown.length > 0 || data || events.length > 0) && (
        <div className="mc-feed-body" role="status" aria-live="polite">
          {shown.map(row => (
            <Link key={row.id} href={row.href} className={`mc-feed-row ${row.tone}`}
              aria-label={`${row.tone === 'urgent' ? 'Urgent — ' : row.tone === 'warn' ? 'Warning — ' : ''}${row.text}`}>
              <span className="mc-feed-glyph" aria-hidden="true">{row.glyph}</span>
              <span className="mc-feed-text" title={row.text}>{row.text}</span>
              <span className="mc-feed-arrow" aria-hidden="true">&gt;</span>
            </Link>
          ))}
          {extra > 0 && (
            <div className="mc-feed-row note is-static">
              <span className="mc-feed-glyph">&gt;</span>
              <span className="mc-feed-text">{extra} more…</span>
            </div>
          )}
          {shown.length === 0 && <div className="mc-feed-row note is-static"><span className="mc-feed-glyph">&gt;</span><span className="mc-feed-text">{events.length ? 'No mission alerts.' : data ? 'No live mission events received.' : 'Connecting to mission event bus…'}</span></div>}
        </div>
      )}
    </div>
  )
}
