'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  HermesKanbanSnapshot,
  HermesTask,
  HermesTaskDetail,
  KanbanSourceStatus,
} from '@/lib/types'
import { TFrame, Button, SkeletonPanel, fmtDate } from './ui'
import { RelativeTime } from './RelativeTime'
import { TaskOverview } from './TaskOverview'

const POLL_MS = 15_000
const SHOW_DONE_LS_KEY = 'mc-kanban:showDone'
const PIN_LS_KEY = 'mc-kanban:pins'

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

/** Statuses that count as "active work" for the filter chip. */
const ACTIVE_STATUSES = new Set(['todo', 'ready', 'running', 'in_progress'])

/** Statuses that count as "needs attention" for the filter chip. */
const ATTENTION_STATUSES = new Set(['blocked', 'failed'])

/** "Mine" = tasks addressed to the local crew (no viewer concept yet). */
const MINE_ASSIGNEES = new Set(['jarvis', 'friday'])

type FilterId = 'all' | 'mine' | 'active' | 'attention'

const FILTER_CHIPS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'all' },
  { id: 'mine', label: 'mine' },
  { id: 'active', label: 'active' },
  { id: 'attention', label: 'needs attention' },
]

/** Any status not explicitly defined falls into a catch-all column. */
function columnFor(status: string) {
  return COLUMNS.find(c => c.status === status)
}

/** Pending statuses that may be handed to a Claude Code worker (mirror of the
 *  server-side DISPATCHABLE_STATUSES guard in lib/kanban-dispatch.ts). */
const DISPATCH_STATUSES = new Set(['todo', 'ready', 'blocked', 'failed', 'review'])

/* ── Drag-and-drop (desktop only) ─────────────────────────────────
 * Drop zones persist through POST /api/kanban/[id], mapping each legal
 * column→column move to the action the hermes kanban CLI can actually express:
 *   • any live card onto DONE                    → complete
 *   • blocked / failed card onto TODO or READY   → unblock
 *   • todo → ready                               → set-status (promote)
 *   • todo | ready | running → blocked           → set-status (block)
 *   • ready | running → review                   → set-status (request-review --force)
 *   • review → ready | todo                      → set-status (reopen-review)
 * Any other target is not a drop zone. */
type DragInfo = { id: string; from: string }

type DropAction = 'complete' | 'unblock' | 'set-status'

function supportedTransition(from: string, to: string): DropAction | null {
  if (!from || !to || from === to) return null
  // Any live card onto DONE completes it (archived is terminal).
  if (to === 'done') return from === 'archived' ? null : 'complete'
  // blocked/failed → todo|ready: the dedicated unblock verb also covers `failed`,
  // which set-status cannot express.
  if ((from === 'blocked' || from === 'failed') && (to === 'todo' || to === 'ready')) return 'unblock'
  // Column↔column moves the hermes kanban CLI expresses via set-status.
  if (from === 'todo' && to === 'ready') return 'set-status' // promote
  if ((from === 'todo' || from === 'ready' || from === 'running') && to === 'blocked') return 'set-status' // block
  if ((from === 'running' || from === 'ready') && to === 'review') return 'set-status' // request-review --force
  if (from === 'review' && (to === 'ready' || to === 'todo')) return 'set-status' // reopen-review
  return null
}

/** Legal "move to…" targets for the drawer control (touch has no DnD, and the
 *  desktop drag affordance is invisible to non-draggers). Every target here is
 *  expressible via the `set-status` action — mirror of supportedTransition's
 *  set-status arm. blocked/failed → todo|ready is intentionally omitted: the
 *  dedicated unblock button already covers it and also handles `failed`, which
 *  set-status cannot. */
const MOVE_TARGETS: Record<string, string[]> = {
  todo: ['ready', 'blocked'],
  ready: ['review', 'blocked'],
  running: ['review', 'blocked'],
  review: ['ready', 'todo'],
}

/* ── Detail drawer (reuse the proven Hermes task detail layout) ───── */
const STATUS_TONE: Record<string, string> = {
  running: 'run', in_progress: 'run',
  done: 'done', completed: 'done',
  blocked: 'bad', failed: 'bad', crashed: 'bad', timed_out: 'bad',
}

/** Whole-card surface tone, mirroring the mc-hk-status vocabulary so the
 *  card reads at a glance: tone-run = live work, tone-done = shipped,
 *  tone-bad = stuck. Empty string keeps todo/ready/archived neutral. */
function cardTone(status: string): string {
  const t = STATUS_TONE[status]
  if (t === 'run') return 'tone-run'
  if (t === 'done') return 'tone-done'
  if (t === 'bad') return 'tone-bad'
  return ''
}

function DetailDrawer({ id, onClose, onChanged, token = '' }: { id: string; onClose: () => void; onChanged: () => void; token?: string }) {
  const [detail, setDetail] = useState<HermesTaskDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [actErr, setActErr] = useState<string | null>(null)
  const [dispatchInfo, setDispatchInfo] = useState<string | null>(null)
  const [agentKind, setAgentKind] = useState('codex')
  const [agentModel, setAgentModel] = useState('')

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
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action, ...payload }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      if (action === 'dispatch-agent') {
        setDispatchInfo(`Herdr ${agentKind} · pane ${j.target}${j.warning ? ` · ${j.warning}` : ''}`)
        window.dispatchEvent(new Event('mc-herdr-refresh'))
      }
      setMsg('')
      await load()
      onChanged()
    } catch (err) {
      setActErr((err as Error).message)
    } finally {
      setBusy(null)
    }
  }, [id, load, onChanged, token, agentKind])

  const moveTargets = detail ? (MOVE_TARGETS[detail.status] ?? []) : []

  const dispatchClaude = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    setBusy('dispatch')
    setActErr(null)
    try {
      const res = await fetch(`/api/kanban/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'dispatch-claude' }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      // Show pid + log basename only — never the full absolute workspace path.
      const logBase = typeof j.logPath === 'string' ? j.logPath.split('/').pop() : ''
      setDispatchInfo(`Claude dispatched · PID ${j.pid}${logBase ? ` · log ${logBase}` : ''}`)
      await load()
      onChanged()
    } catch (err) {
      setActErr((err as Error).message)
    } finally {
      setBusy(null)
    }
  }, [id, load, onChanged, token])

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
            {moveTargets.length > 0 && <a className="mc-btn w2l-move-jump" href="#task-move-actions">MOVE TO… ↓</a>}
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
                {DISPATCH_STATUSES.has(detail.status) && (
                  <Button variant="confirm" loading={busy === 'dispatch'} disabled={!!busy}
                    onClick={e => void dispatchClaude(e)}
                    aria-label={`Dispatch a Claude Code worker on ${detail.title}`}>
                    {busy === 'dispatch' ? 'dispatching…' : '✦ dispatch Claude'}
                  </Button>
                )}
              </div>
              {dispatchInfo && <div className="mc-hk-run-summary" role="status">✦ {dispatchInfo}</div>}
              {DISPATCH_STATUSES.has(detail.status) && <div className="mc-herdr-dispatch">
                <label>Run in<select value={agentKind} onChange={e => { setAgentKind(e.target.value); setAgentModel('') }} disabled={!!busy}>
                  <option value="codex">Codex</option><option value="claude">Claude</option><option value="opencode">OpenCode</option>
                </select></label>
                <label>Model (optional)<input value={agentModel} onChange={e => setAgentModel(e.target.value)} placeholder={agentKind === 'codex' ? 'gpt-6-astra' : 'Agent default'} disabled={!!busy} maxLength={160} /></label>
                <Button variant="primary" disabled={!!busy || !detail.workspacePath} loading={busy === 'dispatch-agent'} onClick={() => void act('dispatch-agent', { kind: agentKind, model: agentModel || undefined })}>Run task in Herdr</Button>
                {!detail.workspacePath && <span>Assign a task workspace before starting an agent.</span>}
              </div>}
              {actErr && <div className="mc-kb-acterr" role="alert">⚠ {actErr}</div>}
            </div>

            {/* Move to… — column transitions (same API as desktop drag-and-drop) */}
            {moveTargets.length > 0 && (
              <div className="mc-drawer-section w2l-move-actions" id="task-move-actions">
                <div className="lbl">MOVE TO…</div>
                <div className="mc-kb-actions">
                  {moveTargets.map(target => (
                    <Button key={target} variant="ghost" loading={busy === 'set-status'} disabled={!!busy}
                      onClick={() => void act('set-status', { status: target })}
                      aria-label={`Move ${detail.title} to ${target}`}>
                      {busy === 'set-status' ? 'moving…' : `▸ ${target}`}
                    </Button>
                  ))}
                </div>
              </div>
            )}

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

/* ── Filter bar ────────────────────────────────────────────────── */

function FilterBar({ filter, onFilter, query, onQuery, searchRef, onFocusSearch }: {
  filter: FilterId
  onFilter: (f: FilterId) => void
  query: string
  onQuery: (q: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  onFocusSearch: () => void
}) {
  return (
    <div className="mc-kb-filter-bar" role="toolbar" aria-label="Filter kanban">
      <div className="mc-kb-filter-chips">
        {FILTER_CHIPS.map(chip => (
          <button
            key={chip.id}
            type="button"
            className={`mc-kb-filter-chip${filter === chip.id ? ' is-on' : ''}`}
            aria-pressed={filter === chip.id}
            onClick={() => onFilter(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="mc-kb-search">
        <span className="mc-kb-search-glyph" aria-hidden="true">⌕</span>
        <input
          ref={searchRef}
          className="mc-kb-input mc-kb-search-input"
          type="search"
          placeholder="search title…  ( / )"
          aria-label="Search tasks by title"
          value={query}
          onChange={e => onQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              onQuery('')
              e.currentTarget.blur()
            }
          }}
          onFocus={onFocusSearch}
        />
      </div>
    </div>
  )
}

/* ── Create modal (drawer-style dialog) ────────────────────────── */

const ASSIGNEE_OPTIONS = ['jarvis', 'friday']
const PRIORITY_OPTIONS = [
  { value: '0', label: '0 · normal' },
  { value: '10', label: '10 · high' },
  { value: '20', label: '20 · urgent' },
]

function CreateModal({ sources, onClose, onCreated, token = '' }: {
  sources: KanSource[]
  onClose: () => void
  onCreated: (id?: string) => void | Promise<void>
  token?: string
}) {
  const [form, setForm] = useState({ title: '', body: '', assignee: '', assigneeOther: '', origin: '', priority: '0' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // Minimal focus trap: focus the first field on open; Escape closes.
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = useCallback(async () => {
    if (!form.title.trim()) return
    setBusy(true)
    setErr(null)
    const assignee = form.assignee === 'other' ? form.assigneeOther.trim() : form.assignee
    try {
      const res = await fetch('/api/kanban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          title: form.title.trim(),
          body: form.body.trim() || undefined,
          assignee: assignee || undefined,
          origin: form.origin || undefined,
          priority: form.priority !== '0' ? form.priority : undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      await onCreated(j.id as string | undefined)
      onClose()
    } catch (cause) {
      setErr((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }, [form, onClose, onCreated, token])

  return (
    <div className="mc-kb-modal-overlay" onClick={onClose}>
      <div
        className="mc-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Create kanban task"
        onClick={e => e.stopPropagation()}
      >
        <div className="mc-drawer-head">
          <span className="mc-drawer-title">NEW TASK</span>
          <button className="mc-drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mc-drawer-body">
          <div className="mc-kb-modal-form">
            <label className="mc-kb-modal-field" htmlFor="kc-title">TITLE <em className="req">*</em></label>
            <input
              id="kc-title"
              ref={titleRef}
              className="mc-kb-input"
              placeholder="Task title…"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              maxLength={200}
            />

            <label className="mc-kb-modal-field" htmlFor="kc-body">BRIEF</label>
            <textarea
              id="kc-body"
              className="mc-kb-input"
              placeholder="Brief (optional)…"
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              rows={3}
              maxLength={4000}
            />

            <label className="mc-kb-modal-field" htmlFor="kc-assignee">ASSIGNEE</label>
            <select
              id="kc-assignee"
              className="mc-kb-input"
              value={form.assignee}
              onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
            >
              <option value="">unassigned</option>
              {ASSIGNEE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              <option value="other">other…</option>
            </select>
            {form.assignee === 'other' && (
              <input
                className="mc-kb-input"
                placeholder="assignee (profile)…"
                aria-label="Other assignee profile"
                value={form.assigneeOther}
                onChange={e => setForm(f => ({ ...f, assigneeOther: e.target.value }))}
                maxLength={80}
              />
            )}

            <label className="mc-kb-modal-field" htmlFor="kc-origin">ORIGIN</label>
            <select
              id="kc-origin"
              className="mc-kb-input"
              value={form.origin}
              onChange={e => setForm(f => ({ ...f, origin: e.target.value }))}
            >
              <option value="">origin: (default)</option>
              {sources.map(s => <option key={s.origin} value={s.origin}>{s.origin}</option>)}
            </select>

            <label className="mc-kb-modal-field" htmlFor="kc-priority">PRIORITY</label>
            <select
              id="kc-priority"
              className="mc-kb-input"
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
            >
              {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {err && <div className="mc-kb-acterr" role="alert">⚠ {err}</div>}
          <div className="mc-kb-actions">
            <Button variant="ghost" onClick={onClose}>cancel</Button>
            <Button variant="primary" loading={busy} disabled={busy || !form.title.trim()} onClick={() => void submit()}
              aria-label="Create task">
              {busy ? 'creating…' : 'create ▸'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

type KanSource = KanbanSourceStatus

/* ── Sorting────────────────────────────────────────────────────── */

/**
 * Card sort within a column: pinned first, then blocked/failed first,
 * then consecutive failures desc, then oldest created first.
 */
function taskSort(a: HermesTask, b: HermesTask, pinned: Set<string>): number {
  const aPin = pinned.has(a.id) ? 0 : 1
  const bPin = pinned.has(b.id) ? 0 : 1
  if (aPin !== bPin) return aPin - bPin
  const aBad = a.status === 'blocked' || a.status === 'failed' ? 0 : 1
  const bBad = b.status === 'blocked' || b.status === 'failed' ? 0 : 1
  if (aBad !== bBad) return aBad - bBad
  const af = a.consecutiveFailures ?? 0
  const bf = b.consecutiveFailures ?? 0
  if (af !== bf) return bf - af
  const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
  const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
  return at - bt
}

function KanbanCard({ task, pinned, pendingParents, onOpen, onTogglePin, draggable, dragging, onDragStart, onDragEnd }: {
  task: HermesTask
  pinned: boolean
  pendingParents: { id: string; title: string }[]
  onOpen: () => void
  onTogglePin: () => void
  draggable?: boolean
  dragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  return (
    <div
      className={['mc-kb-card', pinned ? 'is-pinned' : '', cardTone(task.status), dragging ? 'kbn-dnd-dragging' : ''].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      aria-label={`Open ${task.title}`}
      draggable={draggable}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', task.id)
        onDragStart?.()
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      }}
    >
      <div className="mc-kb-card-top">
        <span className={`mc-hk-status ${STATUS_TONE[task.status] ?? ''}`}>{task.status}</span>
        {task.consecutiveFailures > 0 && <span className="mc-hk-status bad" title="consecutive failures">⚠ {task.consecutiveFailures}</span>}
        <button
          type="button"
          className={`mc-kb-pin${pinned ? ' is-on' : ''}`}
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${task.title}` : `Pin ${task.title}`}
          title={pinned ? 'unpin' : 'pin'}
          onClick={e => { e.stopPropagation(); onTogglePin() }}
        >
          {pinned ? '📌' : '·'}
        </button>
      </div>
      <div className="mc-kb-card-title" title={task.title}>{task.title}</div>
      {pendingParents.length > 0 && (
        <span
          className="mc-kb-dep"
          title={`blocked by ${pendingParents.map(p => p.title).join(', ')}`}
        >
          ⊘ blocked by {pendingParents.length}
        </span>
      )}
      <div className="mc-kb-card-meta">
        {task.assignee && <span className="who" title={`assignee · ${task.assignee}`}>{task.assignee}</span>}
        {task.origin && <span className="mc-kb-card-origin" title={`board · ${task.origin}`}>⊙ {task.origin}</span>}
        {task.createdAt && (
          <span className="time" title={new Date(task.createdAt).toLocaleString()}>
            <RelativeTime ts={new Date(task.createdAt).getTime()} frame="ago" />
          </span>
        )}
      </div>
    </div>
  )
}

function Column({ def, tasks, pinned, byId, onOpen, onTogglePin, dnd, drag, onCardDragStart, onCardDragEnd, onDropToStatus }: {
  def: { status: string; label: string; glyph: string; tone: string }
  tasks: HermesTask[]
  pinned: Set<string>
  byId: Map<string, HermesTask>
  onOpen: (id: string) => void
  onTogglePin: (id: string) => void
  dnd: boolean
  drag: DragInfo | null
  onCardDragStart: (info: DragInfo) => void
  onCardDragEnd: () => void
  onDropToStatus: (to: string) => void
}) {
  const sorted = [...tasks].sort((a, b) => taskSort(a, b, pinned))
  const active = def.tone === 'run'
  const [over, setOver] = useState(false)
  const dropOk = dnd && !!drag && supportedTransition(drag.from, def.status) !== null
  return (
    <TFrame><div className={`mc-kb-col${active ? ' is-active' : ''}`}>
      <div className={`mc-kb-col-head ${def.tone}`} title={`${def.label} · ${tasks.length}`}>
        <span className="mc-kb-col-glyph">{def.glyph}</span>
        <span>{def.label}</span>
        {active && <span className="mc-kb-col-live" aria-hidden="true" />}
        <span className="mc-kb-col-count">{tasks.length}</span>
      </div>
      <div
        className={`mc-kb-col-body${dropOk ? ' kbn-dnd-drop-ok' : ''}${dropOk && over ? ' kbn-dnd-over' : ''}`}
        onDragOver={dropOk ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true) } : undefined}
        onDragLeave={dropOk ? () => setOver(false) : undefined}
        onDrop={dropOk ? e => { e.preventDefault(); setOver(false); onDropToStatus(def.status) } : undefined}
      >
        {sorted.length === 0
          ? <div className="mc-kb-col-empty">{dropOk && over ? '▸ drop here' : '— none —'}</div>
          : sorted.map(t => {
              const pendingParents = (t.parentIds ?? [])
                .map(id => byId.get(id))
                .filter((p): p is HermesTask => !!p && p.status !== 'done' && p.status !== 'archived')
                .map(p => ({ id: p.id, title: p.title }))
              return <KanbanCard key={t.id} task={t} pinned={pinned.has(t.id)} pendingParents={pendingParents}
                onOpen={() => onOpen(t.id)} onTogglePin={() => onTogglePin(t.id)}
                draggable={dnd} dragging={drag?.id === t.id}
                onDragStart={() => onCardDragStart({ id: t.id, from: t.status })}
                onDragEnd={onCardDragEnd} />
            })}
      </div>
    </div></TFrame>
  )
}

type ColumnDef = { status: string; label: string; glyph: string; tone: string }

/* ── Main board ────────────────────────────────────────────────── */

export function KanbanBoard({ token = '' }: { token?: string }) {
  const [view, setView] = useState<'overview' | 'board'>('overview')
  const [snap, setSnap] = useState<HermesKanbanSnapshot | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)
  // Show (default off) or hide the done/archived columns. Hydrated from
  // localStorage so "live work by default" survives reloads.
  const [showDone, setShowDone] = useState(false)
  const [pinned, setPinned] = useState<Set<string>>(() => new Set())
  const lastEventRef = useRef(0)
  // Drag-and-drop is desktop-only; ≤820px keeps the drawer buttons.
  const [isDesktop, setIsDesktop] = useState(false)
  const [drag, setDrag] = useState<DragInfo | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 821px)')
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    try {
      setShowDone(window.localStorage.getItem(SHOW_DONE_LS_KEY) === '1')
    } catch { /* private mode */ }
    try {
      const raw = window.localStorage.getItem(PIN_LS_KEY)
      if (raw) setPinned(new Set(JSON.parse(raw) as string[]))
    } catch { /* private mode */ }
  }, [])

  const persistPins = useCallback((next: Set<string>) => {
    setPinned(next)
    try { window.localStorage.setItem(PIN_LS_KEY, JSON.stringify([...next])) } catch { /* private mode */ }
  }, [])

  const togglePin = useCallback((id: string) => {
    const next = new Set(pinned)
    if (next.has(id)) next.delete(id); else next.add(id)
    persistPins(next)
  }, [pinned, persistPins])

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

  // '/' focuses search; Escape clears search focus / closes modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/') {
        const el = e.target as HTMLElement | null
        const tag = el?.tagName ?? ''
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape') {
        if (showCreate) {
          setShowCreate(false)
          return
        }
        if (document.activeElement === searchRef.current) {
          setQuery('')
          searchRef.current?.blur()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCreate])

  const onCreated = useCallback(async (_id?: string) => {
    await refresh()
  }, [refresh])

  // Optimistically move a card, persist via the supported action, and
  // reconcile against server truth (revert on failure).
  const moveTask = useCallback(async (to: string) => {
    const info = drag
    setDrag(null)
    if (!info) return
    const action = supportedTransition(info.from, to)
    if (!action) return
    setSnap(prev => prev
      ? { ...prev, tasks: prev.tasks.map(t => (t.id === info.id ? { ...t, status: to } : t)) }
      : prev)
    try {
      const body = action === 'complete'
        ? { action: 'complete', result: 'moved to done from Mission Control' }
        : action === 'unblock'
          ? { action: 'unblock', reason: 'unblocked from Mission Control' }
          : { action: 'set-status', status: to }
      const res = await fetch(`/api/kanban/${encodeURIComponent(info.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      /* fall through — refresh reconciles to server truth */
    } finally {
      await refresh()
    }
  }, [drag, refresh, token])

  if (!snap) return <SkeletonPanel label="reading kanban boards" />

  const tasks = snap.tasks
  const sources = (snap as unknown as { sources?: KanSource[] }).sources ?? []
  // Whole-board last-sync age. Board polls at 15s + SSE refresh, so anything
  // older than ~2 minutes is suspicious → amber `is-stale` + copy flip.
  const generatedAt = (snap as unknown as { generatedAt?: string }).generatedAt
  const syncStale = !!generatedAt && Date.now() - new Date(generatedAt).getTime() > 120_000
  const byId = new Map<string, HermesTask>()
  for (const t of tasks) byId.set(t.id, t)

  // Apply filter + search across all task statuses before column grouping.
  let visible = tasks
  if (filter === 'mine') visible = visible.filter(t => t.assignee && MINE_ASSIGNEES.has(t.assignee))
  else if (filter === 'active') visible = visible.filter(t => ACTIVE_STATUSES.has(t.status))
  else if (filter === 'attention') visible = visible.filter(t => ATTENTION_STATUSES.has(t.status))
  const q = query.trim().toLowerCase()
  if (q) {
    visible = visible.filter(t => {
      const parents = (t.parentIds ?? []).map(id => byId.get(id)?.title ?? '').join(' ')
      return `${t.title} ${t.assignee ?? ''} ${parents}`.toLowerCase().includes(q)
    })
  }

  const byStatus = new Map<string, HermesTask[]>()
  for (const t of visible) {
    const arr = byStatus.get(t.status) ?? []
    arr.push(t)
    byStatus.set(t.status, arr)
  }
  const presentStatuses = new Set(visible.map(t => t.status))
  const cols = COLUMNS
    .filter(c => presentStatuses.has(c.status))
    .filter(c => showDone || !UI_HIDDEN_STATUSES.has(c.status))
    .sort((a, b) => Number(ATTENTION_STATUSES.has(b.status)) - Number(ATTENTION_STATUSES.has(a.status)))
  const leftoverStatuses = [...presentStatuses].filter(s => !columnFor(s) && !UI_HIDDEN_STATUSES.has(s))
  const doneCount = byStatus.get('done')?.length ?? 0
  const archivedCount = byStatus.get('archived')?.length ?? 0
  const hasDoneWork = doneCount + archivedCount > 0

  return (
    <>
      <div className="mc-window mc-kb">
        {/* Single meta line: availability + toolbar (headers merged — one title only). */}
        <div className="mc-kb-meta">
          {generatedAt && (
            <span
              className={`mc-kb-sync${syncStale ? ' is-stale' : ''}`}
              style={syncStale ? { color: 'var(--pt-warn-ink)' } : undefined}
              title={`Board last synced ${new Date(generatedAt).toLocaleString()}`}
              aria-label={syncStale ? 'Board sync is stale' : 'Board last sync age'}
            >
              {syncStale ? 'SYNC STALE · ' : 'SYNC · '}
              <RelativeTime ts={new Date(generatedAt).getTime()} frame="ago" />
            </span>
          )}
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
            <Button variant="ghost" active={view === 'overview'} onClick={() => setView('overview')}>overview</Button>
            <Button variant="ghost" active={view === 'board'} onClick={() => setView('board')}>board</Button>
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

        <FilterBar
          filter={filter}
          onFilter={setFilter}
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          onFocusSearch={() => setFilter('all')}
        />

        {view === 'overview' ? <TaskOverview tasks={visible.filter(t => showDone || !UI_HIDDEN_STATUSES.has(t.status))} byId={byId} onOpen={setOpenId} /> : <div className="mc-kb-viewport">
          <div className="mc-kb-board v4-group">
            {cols.length === 0 && leftoverStatuses.length === 0 && (
              <div className="mc-pipe-empty">— no tasks match —</div>
            )}
            {cols.map(c => (
              <Column key={c.status} def={c} tasks={byStatus.get(c.status) ?? []} pinned={pinned} byId={byId} onOpen={setOpenId} onTogglePin={togglePin}
                dnd={isDesktop} drag={drag} onCardDragStart={setDrag} onCardDragEnd={() => setDrag(null)} onDropToStatus={moveTask} />
            ))}
            {leftoverStatuses.map(s => (
              <Column key={s} def={{ status: s, label: s.toUpperCase(), glyph: '▪', tone: '' }} tasks={byStatus.get(s) ?? []} pinned={pinned} byId={byId} onOpen={setOpenId} onTogglePin={togglePin}
                dnd={isDesktop} drag={drag} onCardDragStart={setDrag} onCardDragEnd={() => setDrag(null)} onDropToStatus={moveTask} />
            ))}
          </div>
        </div>}
      </div>
      <div className="w2l-task-bar"><Button variant="primary" onClick={() => setShowCreate(true)}>+ new task</Button><Button variant="ghost" active={filter === 'attention'} onClick={() => setFilter(filter === 'attention' ? 'all' : 'attention')}>needs attention</Button></div>
      {openId && <DetailDrawer key={openId} id={openId} token={token} onClose={() => setOpenId(null)} onChanged={refresh} />}
      {showCreate && <CreateModal sources={sources} token={token} onClose={() => setShowCreate(false)} onCreated={onCreated} />}
    </>
  )
}
