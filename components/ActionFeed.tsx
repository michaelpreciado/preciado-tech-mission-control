'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useLiveData } from './LiveDataProvider'
import type { SystemHealthData } from '@/lib/types'

const POLL_MS = 15_000

type FeedRow = {
  id: string
  tone: 'urgent' | 'warn' | 'note'
  glyph: string
  text: string
  href: string
}

/**
 * Needs-my-action strip — the first thing on the Deck (and on mobile, the
 * first thing on screen): down services, agents/tasks in trouble, data
 * warnings. Everything taps through to its tab.
 */
export function ActionFeed() {
  const { data } = useLiveData()
  const [health, setHealth] = useState<SystemHealthData | null>(null)

  const refresh = useCallback(async () => {
    const [h] = await Promise.allSettled([
      fetch('/api/system', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
    ])
    if (h.status === 'fulfilled' && h.value) setHealth(h.value)
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const rows: FeedRow[] = []

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
      rows.push({ id: `crew:${member.id}`, tone: 'warn', glyph: '⌬', text: `${member.name} needs attention — ${member.signal}`, href: '/team' })
    }
  }
  for (const task of (data?.tasks ?? []).filter(t => t.status === 'attention').slice(0, 3)) {
    rows.push({ id: `task:${task.id}`, tone: 'warn', glyph: '≡', text: `${task.title} (${task.ownerName})`, href: '/tasks' })
  }
  for (const [i, warning] of (data?.warnings ?? []).entries()) {
    rows.push({ id: `warn:${i}`, tone: 'note', glyph: '◇', text: warning, href: '/' })
  }

  const shown = rows.slice(0, 8)
  const extra = rows.length - shown.length
  const urgentCount = rows.filter(r => r.tone === 'urgent').length

  return (
    <div className={`mc-feed ${urgentCount ? 'has-urgent' : ''}`}>
      <div className="mc-feed-head">
        <span className="mc-feed-title">▸ NEEDS YOU</span>
        <span className={`mc-feed-count ${urgentCount ? 'hot' : ''}`}>
          {urgentCount ? `${urgentCount} URGENT` : 'ALL CLEAR'}
        </span>
      </div>
      {shown.length > 0 && (
        <div className="mc-feed-body" role="status" aria-live="polite">
          {shown.map(row => (
            <Link key={row.id} href={row.href} className={`mc-feed-row ${row.tone}`}
              aria-label={`${row.tone === 'urgent' ? 'Urgent — ' : row.tone === 'warn' ? 'Warning — ' : ''}${row.text}`}>
              <span className="mc-feed-glyph" aria-hidden="true">{row.glyph}</span>
              <span className="mc-feed-text" title={row.text}>{row.text}</span>
              <span className="mc-feed-arrow" aria-hidden="true">›</span>
            </Link>
          ))}
          {extra > 0 && (
            <div className="mc-feed-row note">
              <span className="mc-feed-glyph">＋</span>
              <span className="mc-feed-text">{extra} more…</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
