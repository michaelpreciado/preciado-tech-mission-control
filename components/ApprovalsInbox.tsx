'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ApprovalItem, ApprovalsData } from '@/lib/types'
import { SkeletonPanel, fmtDate } from './ui'

const POLL_MS = 12_000

const KIND_GLYPH: Record<string, string> = {
  pipeline_approval: '⏳',
  email_signoff: '✉',
  task_attention: '⚠',
  exec_allowlist: '⌗',
}

function ApprovalCard({ item, onDecide, busy }: {
  item: ApprovalItem
  onDecide: (id: string, decision: 'approve' | 'reject') => void
  busy: boolean
}) {
  // Two-tap confirm so a pocket tap can't approve a build.
  const [confirming, setConfirming] = useState<'approve' | 'reject' | null>(null)
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(null), 4000)
    return () => clearTimeout(t)
  }, [confirming])

  const payload = item.payload ?? {}
  const emailDraft = typeof payload.emailDraft === 'string' ? payload.emailDraft : undefined
  const previewUrl = typeof payload.previewUrl === 'string' ? payload.previewUrl : undefined
  const concept = payload.concept as { designDirection?: string; inspirationSources?: string[]; estimatedScope?: string } | undefined

  const tap = (d: 'approve' | 'reject') => {
    if (confirming === d) { setConfirming(null); onDecide(item.id, d) }
    else setConfirming(d)
  }

  return (
    <div className={`mc-appr-card ${item.actionable ? '' : 'info'}`}>
      <div className="mc-appr-head">
        <span className="mc-appr-glyph">{KIND_GLYPH[item.kind] ?? '◇'}</span>
        <span className="mc-appr-title">{item.title}</span>
        {item.requestedAt && <span className="mc-appr-when">{fmtDate(item.requestedAt)}</span>}
      </div>
      {item.summary && <div className="mc-appr-summary">{item.summary}</div>}
      {concept?.designDirection && <div className="mc-appr-summary">design · {concept.designDirection}</div>}
      {concept?.estimatedScope && <div className="mc-appr-summary">scope · {concept.estimatedScope}</div>}
      {previewUrl && (
        <a className="mc-pipe-preview" href={previewUrl} target="_blank" rel="noreferrer">▶ VIEW PREVIEW</a>
      )}
      {emailDraft && <div className="mc-pipe-draft">{emailDraft}</div>}
      <div className="mc-appr-foot">
        <span className="mc-appr-src">{item.source}</span>
        {item.href && <a className="mc-pipe-link" href={item.href}>open ↗</a>}
        {item.actionable && (
          <span className="mc-appr-actions">
            <button className={`mc-appr-btn reject ${confirming === 'reject' ? 'confirm' : ''}`}
              disabled={busy} onClick={() => tap('reject')}>
              {confirming === 'reject' ? 'TAP TO CONFIRM ✗' : 'REJECT'}
            </button>
            <button className={`mc-appr-btn approve ${confirming === 'approve' ? 'confirm' : ''}`}
              disabled={busy} onClick={() => tap('approve')}>
              {confirming === 'approve' ? 'TAP TO CONFIRM ✓' : 'APPROVE'}
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

export function ApprovalsInbox() {
  const [data, setData] = useState<ApprovalsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals', { cache: 'no-store' })
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

  const decide = useCallback(async (id: string, decision: 'approve' | 'reject') => {
    setBusyId(id)
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`)
      setFlash(`${decision === 'approve' ? '✓ APPROVED' : '✗ REJECTED'} — ${id.split(':')[1] ?? id}`)
      setTimeout(() => setFlash(null), 4000)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }, [refresh])

  if (!data && !error) return <SkeletonPanel label="loading approvals" />

  const pending = data?.pending ?? []
  const info = data?.info ?? []

  return (
    <>
      {error && <div className="mc-pipe-error">⚠ approvals unreachable — {error}</div>}
      {flash && <div className="mc-appr-flash">{flash}</div>}

      <div className="mc-window mc-appr-col">
        <div className={`mc-tcol-head ${pending.length ? 'alert' : ''}`}>
          <span className="mc-tcol-glyph">⏳</span>
          <span>AWAITING YOUR DECISION</span>
          <span className="mc-tcol-count">{pending.length}</span>
        </div>
        <div className="mc-appr-body">
          {pending.length === 0 && <div className="mc-pipe-empty">— nothing waiting on you —</div>}
          {pending.map(item => (
            <ApprovalCard key={item.id} item={item} onDecide={decide} busy={busyId === item.id} />
          ))}
        </div>
      </div>

      <div className="mc-window mc-appr-col" style={{ marginTop: 14 }}>
        <div className="mc-tcol-head">
          <span className="mc-tcol-glyph">◇</span>
          <span>NEEDS ATTENTION / FYI</span>
          <span className="mc-tcol-count">{info.length}</span>
        </div>
        <div className="mc-appr-body">
          {info.length === 0 && <div className="mc-pipe-empty">— all nominal —</div>}
          {info.map(item => (
            <ApprovalCard key={item.id} item={item} onDecide={decide} busy={false} />
          ))}
        </div>
      </div>
    </>
  )
}
