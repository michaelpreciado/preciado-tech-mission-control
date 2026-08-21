'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  HermesKanbanSnapshot,
  HermesTask,
  HermesTaskDetail,
  KanbanSourceStatus,
} from '@/lib/types'
import { Button, SkeletonPanel, fmtDate } from './ui'
import { RelativeTime } from './RelativeTime'

const POLL_MS = 15_000
const SHOW_DONE_LS_KEY = 'mc-kanban:showDone'

/** Column definition: canonical Hermes lifecycle order + tone for badges. */
const COLUMNS: { status: string; label: string; glyph: string; tone: string }[] = [
  { status: 'todo', label: 'TODO', glyph: '◻', tone: '' },
  { status: 'ready', label: 'READY', glyph: '▸', tone: '' },
  { status: 'running', label: 'RUNNING', glyph: '●', tone: 'run' },
  { status: 'in_progress', label: 'IN PROGRESS', glyph: '●', tone: 'run' },
  { status: 'blocked', label: 'BLOCKED', glyph: '⚠', tone: 'bad' },
  { status: 'failed', label: 'FAILED', glyph: '✕', tone: 'bad' },
  { status: 'done', label: 'DONE', glyph: '✓', tone: 'done' },
  { status: 'archived', label: 'ARCHIVED', glyph: '🗄', tone: '' },
]

/** Columns hidden behind the "show done" toggle by default (live work first). */
const UI_HIDDEN_STATUSES = new Set(['done', 'archived'])

/** Any status not explicitly defined falls into a catch-all column. */
function columnFor(status: string) {
  return COLUMNS.find(c => c.status === status)
}

/* ── Detail drawer (reuse the proven Hermes task detail layout) ───── */
const STATUS_TONE: Record<string, string> = {
  running: 'run', in_progress: 'run',
  done: 'done', completed: 'done',
  blocked: 'bad', failed: 'bad', crashed: 'bad', timed_out: 'bad',
}

function DetailDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<HermesTaskDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [actErr, setActErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/kanban/${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDetail(await res.json())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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

  const act = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(action)
    setActErr(null)
    try {
      const res = await fetch(`/api/kanban/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setMsg('')
      await load()
      onChanged()
    } catch (err) {
      setActErr((err as Error).message)
    } finally {
      setBusy(null)
    }
  }, [id, load, onChanged])

  return (
    <div className="mc-drawer-overlay" onClick={onClose}>
      <div className="mc-drawer" role="dialog" aria-modal="true" aria-label={detail?.title ?? 'Task detail'} onClick={e => e.stopPropagation()}>
        <div className="mc-drawer-head">
          <span className="mc-drawer-title">
            {detail ? (
              <>
                {detail.title}
                {detail.origin && <em className="mc-kb-origin">{detail.origin}</em>}
              </>
            ) : id}
          </span>
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

            {/* Actions */}
            <div className="mc-drawer-section">
              <div className="lbl">ACTIONS</div>
              <div className="mc-kb-actions">
                {(detail.status === 'blocked' || detail.status === 'failed') && (
                  <Button variant="confirm" loading={busy === 'unblock'} disabled={!!busy}
                    onClick={() => void act('unblock', { reason: 'unblocked from Mission Control' })}
                    aria-label={`Unblock ${detail.title}`}>
                    {busy === 'unblock' ? 'unblocking…' : '⊘ unblock'}
                  </Button>
                )}
                {detail.status !== 'done' && detail.status !== 'archived' && (
                  <Button variant="primary" loading={busy === 'complete'} disabled={!!busy}
                    onClick={() => void act('complete', { result: 'completed from Mission Control' })}
                    aria-label={`Mark ${detail.title} complete`}>
                    {busy === 'complete' ? 'completing…' : '✓ complete'}
                  </Button>
                )}
              </div>
              {actErr && <div className="mc-kb-acterr" role="alert">⚠ {actErr}</div>}
            </div>

            {/* Comment composer */}
            <div className="mc-drawer-section">
              <div className="lbl">ADD COMMENT</div>
              <div className="mc-kb-compose">
                <textarea
                  value={msg}
                  onChange={e => setMsg(e.target.value)}
                  placeholder="Write a comment…"
                  aria-label="Write a comment"
                  rows={2}
                  maxLength={4000}
                />
                <Button variant="primary" loading={busy === 'comment'} disabled={!!busy || !msg.trim()}
                  onClick={() => void act('comment', { body: msg })}
                  aria-label={`Post comment on ${detail.title}`}>
                  {busy === 'comment' ? 'posting…' : 'send ▸'}
                </Button>
              </div>
            </div>

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

/* ── Card + Column ─────────────────────────────────────────────── */

function KanbanCard({ task, onClick }: { task: HermesTask; onClick: () => void }) {
  return (
    <button className="mc-kb-card" onClick={onClick} aria-label={`Open ${task.title}`}>
      <div className="mc-kb-card-top">
        <span className={`mc-hk-status ${STATUS_TONE[task.status] ?? ''}`}>{task.status}</span>
        {task.consecutiveFailures > 0 && <span className="mc-hk-status bad" title="consecutive failures">⚠ {task.consecutiveFailures}</span>}
      </div>
      <div className="mc-kb-card-title">{task.title}</div>
      <div className="mc-kb-card-meta">
        {task.assignee && <span className="who">{task.assignee}</span>}
        {task.createdAt && (
          <span className="time">
            <RelativeTime ts={new Date(task.createdAt).getTime()} frame="ago" />
          </span>
        )}
      </div>
    </button>
  )
}

function Column({ def, tasks, onOpen }: {
  def: { status: string; label: string; glyph: string; tone: string }
  tasks: HermesTask[]
  onOpen: (id: string) => void
}) {
  return (
    <div className="mc-kb-col">
      <div className={`mc-kb-col-head ${def.tone}`}>
        <span className="mc-kb-col-glyph">{def.glyph}</span>
        <span>{def.label}</span>
        <span className="mc-kb-col-count">{tasks.length}</span>
      </div>
      <div className="mc-kb-col-body">
        {tasks.length === 0
          ? <div className="mc-kb-col-empty">— none —</div>
          : tasks.map(t => <KanbanCard key={t.id} task={t} onClick={() => onOpen(t.id)} />)}
      </div>
    </div>
  )
}

/* ── Main board ────────────────────────────────────────────────── */

export function KanbanBoard() {
  const [snap, setSnap] = useState<HermesKanbanSnapshot | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ title: '', body: '', assignee: '', origin: '' })
  const [createBusy, setCreateBusy] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)
  // Show (default off) or hide the done/archived columns. Hydrated from
  // localStorage so "live work by default" survives reloads.
  const [showDone, setShowDone] = useState(false)
  const lastEventRef = useRef(0)

  useEffect(() => {
    try {
      setShowDone(window.localStorage.getItem(SHOW_DONE_LS_KEY) === '1')
    } catch { /* private mode */ }
  }, [])

  const toggleShowDone = useCallback(() => {
    setShowDone(prev => {
      const next = !prev
      try { window.localStorage.setItem(SHOW_DONE_LS_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/kanban', { cache: 'no-store' })
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

  const submitCreate = useCallback(async () => {
    if (!createForm.title.trim()) return
    setCreateBusy(true)
    setCreateErr(null)
    try {
      const res = await fetch('/api/kanban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title,
          body: createForm.body || undefined,
          assignee: createForm.assignee || undefined,
          origin: createForm.origin || undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setCreateForm({ title: '', body: '', assignee: '', origin: '' })
      setShowCreate(false)
      await refresh()
      if (j.id) setOpenId(j.id)
    } catch (err) {
      setCreateErr((err as Error).message)
    } finally {
      setCreateBusy(false)
    }
  }, [createForm, refresh])

  if (!snap) return <SkeletonPanel label="reading kanban boards" />

  const tasks = snap.tasks
  const sources = (snap as unknown as { sources?: KanbanSourceStatus[] }).sources ?? []
  const byStatus = new Map<string, HermesTask[]>()
  for (const t of tasks) {
    const arr = byStatus.get(t.status) ?? []
    arr.push(t)
    byStatus.set(t.status, arr)
  }
  // Determine which columns are non-empty so we don't render empty canonical columns that add no info.
  const presentStatuses = new Set(tasks.map(t => t.status))
  const cols = COLUMNS
    .filter(c => presentStatuses.has(c.status))
    .filter(c => showDone || !UI_HIDDEN_STATUSES.has(c.status))
  const leftoverStatuses = [...presentStatuses].filter(s => !columnFor(s) && !UI_HIDDEN_STATUSES.has(s))
  const doneCount = byStatus.get('done')?.length ?? 0
  const archivedCount = byStatus.get('archived')?.length ?? 0
  const hasDoneWork = doneCount + archivedCount > 0

  return (
    <>
      <div className="mc-window mc-kb">
        {/* Single meta line: availability + toolbar (headers merged — one title only). */}
        <div className="mc-kb-meta">
          <div className="mc-kb-sources" aria-label="Board sources">
            {sources.length === 0 && <span className="dim">no sources</span>}
            {sources.map(s => (
              <span key={s.name} className={`mc-kb-src ${s.available ? 'ok' : 'down'}`}>
                {s.available ? '●' : '○'} {s.name}
                <span className="dim"> {s.available ? Object.entries(s.counts).map(([k, v]) => `${v} ${k}`).join(' · ') : 'offline'}</span>
              </span>
            ))}
          </div>
          <div className="mc-kb-toolbar">
            {hasDoneWork && (
              <Button variant="ghost" active={showDone} onClick={toggleShowDone}>
                {showDone ? 'hide done' : `show ${doneCount} done · ${archivedCount} archived`}
              </Button>
            )}
            <Button variant="ghost" active={showCreate} onClick={() => setShowCreate(v => !v)}>
              {showCreate ? '✕ close' : '+ new task'}
            </Button>
          </div>
        </div>

        {showCreate && (
          <div className="mc-kb-create">
            <input
              className="mc-kb-input"
              placeholder="Task title…"
              aria-label="Task title"
              value={createForm.title}
              onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
              maxLength={200}
            />
            <textarea
              className="mc-kb-input"
              placeholder="Brief (optional)…"
              aria-label="Task brief (optional)"
              value={createForm.body}
              onChange={e => setCreateForm(f => ({ ...f, body: e.target.value }))}
              rows={2}
              maxLength={4000}
            />
            <div className="mc-kb-create-row">
              <input
                className="mc-kb-input"
                placeholder="assignee (profile)…"
                aria-label="Assignee (profile)"
                value={createForm.assignee}
                onChange={e => setCreateForm(f => ({ ...f, assignee: e.target.value }))}
                maxLength={80}
              />
              <select
                className="mc-kb-input"
                aria-label="Origin"
                value={createForm.origin}
                onChange={e => setCreateForm(f => ({ ...f, origin: e.target.value }))}
              >
                <option value="">origin: (default)</option>
                {sources.filter(s => s.available).map(s => (
                  <option key={s.origin} value={s.origin}>{s.origin}</option>
                ))}
              </select>
              <Button variant="primary" loading={createBusy} disabled={createBusy || !createForm.title.trim()} onClick={() => void submitCreate()}
                aria-label="Create task">
                {createBusy ? 'creating…' : 'create ▸'}
              </Button>
            </div>
            {createErr && <div className="mc-kb-acterr" role="alert">⚠ {createErr}</div>}
          </div>
        )}

        <div className="mc-kb-viewport">
          <div className="mc-kb-board">
            {cols.length === 0 && leftoverStatuses.length === 0 && (
              <div className="mc-pipe-empty">— no tasks on any board yet —</div>
            )}
            {cols.map(c => (
              <Column key={c.status} def={c} tasks={byStatus.get(c.status) ?? []} onOpen={setOpenId} />
            ))}
            {leftoverStatuses.map(s => (
              <Column key={s} def={{ status: s, label: s.toUpperCase(), glyph: '▪', tone: '' }} tasks={byStatus.get(s) ?? []} onOpen={setOpenId} />
            ))}
          </div>
        </div>
      </div>
      {openId && <DetailDrawer id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </>
  )
}
