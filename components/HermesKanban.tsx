'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { HermesKanbanSnapshot, HermesTask, HermesTaskDetail } from '@/lib/types'
import { SkeletonPanel, fmtDate } from './ui'

const POLL_MS = 15_000

const STATUS_TONE: Record<string, string> = {
  running: 'run', in_progress: 'run',
  done: 'done', completed: 'done',
  blocked: 'bad', failed: 'bad', crashed: 'bad', timed_out: 'bad',
}

function TaskDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<HermesTaskDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hermes/tasks/${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDetail(await res.json())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  // Live-refresh the open drawer when this task streams an event on the bus.
  useEffect(() => {
    const es = new EventSource('/api/events')
    const onAny = (ev: MessageEvent) => {
      try {
        const evt = JSON.parse(ev.data) as { task_id?: string }
        if (evt.task_id === id) void load()
      } catch { /* keepalive */ }
    }
    for (const n of ['task.created', 'task.assigned', 'task.progress', 'task.done', 'task.failed', 'agent.status', 'message']) {
      es.addEventListener(n, onAny as EventListener)
    }
    return () => es.close()
  }, [id, load])

  return (
    <div className="mc-drawer-overlay" onClick={onClose}>
      <div className="mc-drawer" onClick={e => e.stopPropagation()}>
        <div className="mc-drawer-head">
          <span className="mc-drawer-title">{detail?.title ?? id}</span>
          <button className="mc-drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <div className="mc-pipe-error">⚠ {error}</div>}
        {!detail && !error && <SkeletonPanel label="loading task" />}
        {detail && (
          <div className="mc-drawer-body">
            <div className="mc-drawer-meta">
              <span className={`mc-hk-status ${STATUS_TONE[detail.status] ?? ''}`}>{detail.status}</span>
              {detail.assignee && <span>assignee · {detail.assignee}</span>}
              {detail.createdBy && <span>by · {detail.createdBy}</span>}
              {detail.createdAt && <span>created · {fmtDate(detail.createdAt)}</span>}
              {detail.lastHeartbeatAt && <span>♥ {fmtDate(detail.lastHeartbeatAt)}</span>}
            </div>
            {detail.consecutiveFailures > 0 && (
              <div className="mc-pipe-error">
                {detail.consecutiveFailures} consecutive failure(s)
                {detail.lastFailureError ? ` — ${detail.lastFailureError.slice(0, 300)}` : ''}
              </div>
            )}
            {detail.body && <div className="mc-drawer-section"><div className="lbl">BRIEF</div><div className="mc-pipe-draft">{detail.body.slice(0, 1200)}</div></div>}

            <div className="mc-drawer-section">
              <div className="lbl">RUNS ({detail.runs.length})</div>
              {detail.runs.length === 0 && <div className="mc-pipe-empty">— none —</div>}
              {detail.runs.map(run => (
                <div key={run.id} className="mc-hk-run">
                  <span className={`mc-hk-status ${STATUS_TONE[run.outcome ?? run.status] ?? ''}`}>{run.outcome ?? run.status}</span>
                  <span className="dim">{run.profile ?? ''}</span>
                  <span className="dim">{run.startedAt ? fmtDate(run.startedAt) : ''}</span>
                  {run.summary && <div className="mc-hk-run-summary">{run.summary.slice(0, 240)}</div>}
                  {run.error && <div className="mc-hk-run-error">{run.error.slice(0, 240)}</div>}
                </div>
              ))}
            </div>

            <div className="mc-drawer-section">
              <div className="lbl">COMMENTS ({detail.comments.length})</div>
              {detail.comments.length === 0 && <div className="mc-pipe-empty">— none —</div>}
              {detail.comments.map(c => (
                <div key={c.id} className="mc-hk-comment">
                  <span className="who">{c.author}</span>
                  <span className="dim">{c.createdAt ? fmtDate(c.createdAt) : ''}</span>
                  <div>{c.body.slice(0, 400)}</div>
                </div>
              ))}
            </div>

            <div className="mc-drawer-section">
              <div className="lbl">EVENTS ({detail.events.length})</div>
              {detail.events.length === 0 && <div className="mc-pipe-empty">— none —</div>}
              {detail.events.map(e => (
                <div key={e.id} className="mc-hk-event">
                  <span className="kind">{e.kind}</span>
                  <span className="dim">{e.createdAt ? fmtDate(e.createdAt) : ''}</span>
                  {e.payload && <span className="dim payload">{e.payload.slice(0, 120)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Live view of the Hermes multi-agent kanban (~/.hermes/kanban.db). */
export function HermesKanban() {
  const [snap, setSnap] = useState<HermesKanbanSnapshot | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const lastEventRef = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/tasks', { cache: 'no-store' })
      if (res.ok) setSnap(await res.json())
    } catch { /* offline */ }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  // Refresh the list when any task event streams on the bus (throttled).
  useEffect(() => {
    const es = new EventSource('/api/events')
    const onAny = () => {
      const now = Date.now()
      if (now - lastEventRef.current > 3000) {
        lastEventRef.current = now
        void refresh()
      }
    }
    for (const n of ['task.created', 'task.assigned', 'task.progress', 'task.done', 'task.failed', 'message']) {
      es.addEventListener(n, onAny as EventListener)
    }
    return () => es.close()
  }, [refresh])

  if (!snap) return <SkeletonPanel label="reading hermes kanban" />

  const tasks = snap.tasks
  const countParts = Object.entries(snap.counts).map(([k, v]) => `${v} ${k}`)

  return (
    <>
      <div className="mc-window mc-hk">
        <div className="mc-tcol-head">
          <span className="mc-tcol-glyph">⛁</span>
          <span>HERMES KANBAN · LIVE TASK STORE</span>
          <span className="mc-tcol-count">{tasks.length}</span>
        </div>
        <div className="mc-pipe-hint">
          {snap.available
            ? (countParts.length ? countParts.join(' · ') : 'no tasks yet — agents will populate this as they work')
            : 'kanban.db unavailable'}
        </div>
        <div className="mc-hk-body">
          {tasks.length === 0 && <div className="mc-pipe-empty">— no hermes tasks yet —</div>}
          {tasks.map((t: HermesTask) => (
            <button key={t.id} className="mc-hk-row" onClick={() => setOpenId(t.id)}>
              <span className={`mc-hk-status ${STATUS_TONE[t.status] ?? ''}`}>{t.status}</span>
              <span className="mc-hk-title">{t.title}</span>
              <span className="mc-hk-meta">
                {t.assignee && <span>{t.assignee}</span>}
                {t.consecutiveFailures > 0 && <span className="bad">⚠ {t.consecutiveFailures}</span>}
                {t.createdAt && <span className="dim">{fmtDate(t.createdAt)}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
      {openId && <TaskDrawer id={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}
