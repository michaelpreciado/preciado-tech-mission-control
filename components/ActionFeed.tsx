'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useLiveData } from './LiveDataProvider'
import type { ApprovalsData, SystemHealthData } from '@/lib/types'

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
 * first thing on screen): pending approvals, down services, agents/tasks in
 * trouble, data warnings. Everything taps through to its tab.
 */
export function ActionFeed() {
  const { data } = useLiveData()
  const [approvals, setApprovals] = useState<ApprovalsData | null>(null)
  const [health, setHealth] = useState<SystemHealthData | null>(null)

  const refresh = useCallback(async () => {
    const [a, h] = await Promise.allSettled([
      fetch('/api/approvals', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
      fetch('/api/system', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
    ])
    if (a.status === 'fulfilled' && a.value) setApprovals(a.value)
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

  for (const item of approvals?.pending ?? []) {
    rows.push({ id: item.id, tone: 'urgent', glyph: '⏳', text: item.title, href: '/approvals' })
  }
  for (const svc of health?.services ?? []) {
    if (svc.status === 'down') rows.push({ id: `svc:${svc.id}`, tone: 'urgent', glyph: '✕', text: `${svc.name} — ${svc.detail}`, href: '/ops' })
    else if (svc.status === 'warn') rows.push({ id: `svc:${svc.id}`, tone: 'warn', glyph: '⚠', text: `${svc.name} — ${svc.detail}`, href: '/ops' })
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
    rows.push({ id: `warn:${i}`, tone: 'note', glyph: '◇', text: warning, href: '/ops' })
  }
  for (const item of (approvals?.info ?? []).filter(it => it.kind === 'task_attention').slice(0, 3)) {
    rows.push({ id: item.id, tone: 'warn', glyph: '⚠', text: item.title, href: item.href ?? '/tasks' })
  }

  const shown = rows.slice(0, 8)
  const extra = rows.length - shown.length
  const pendingCount = approvals?.counts.pending ?? 0

  return (
    <div className={`mc-feed ${pendingCount ? 'has-urgent' : ''}`}>
      <div className="mc-feed-head">
        <span className="mc-feed-title">▸ NEEDS YOU</span>
        <span className={`mc-feed-count ${pendingCount ? 'hot' : ''}`}>
          {pendingCount ? `${pendingCount} AWAITING DECISION` : 'ALL CLEAR'}
        </span>
        <Link href="/approvals" className="mc-feed-open">approvals ↗</Link>
      </div>
      {shown.length > 0 && (
        <div className="mc-feed-body">
          {shown.map(row => (
            <Link key={row.id} href={row.href} className={`mc-feed-row ${row.tone}`}>
              <span className="mc-feed-glyph">{row.glyph}</span>
              <span className="mc-feed-text">{row.text}</span>
              <span className="mc-feed-arrow">›</span>
            </Link>
          ))}
          {extra > 0 && (
            <Link href="/approvals" className="mc-feed-row note">
              <span className="mc-feed-glyph">＋</span>
              <span className="mc-feed-text">{extra} more…</span>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
