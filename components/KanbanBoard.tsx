'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type {
  HermesKanbanSnapshot,
  HermesTask,
  HermesTaskDetail,
  KanbanSourceStatus,
} from '@/lib/types'
import { Button, Card, Chip, Field, Input, Select, Segmented, Sheet, SkeletonPanel, TextArea, fmtDate } from './ui'
import styles from './Kanban.module.css'
import { RelativeTime } from './RelativeTime'
import { apiFetch, apiUrl } from '@/lib/api-base'

const POLL_MS = 15_000
const SHOW_DONE_LS_KEY = 'mc-kanban:showDone'
const PIN_LS_KEY = 'mc-kanban:pins'

const COLUMNS = [
  { status: 'todo', label: 'To do' },
  { status: 'ready', label: 'Ready' },
  { status: 'running', label: 'Running' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'failed', label: 'Failed' },
  { status: 'review', label: 'Review' },
  { status: 'done', label: 'Done' },
  { status: 'archived', label: 'Archived' },
]

function statusLabel(status: string) {
  return columnFor(status)?.label ?? status.replaceAll('_', ' ')
}

/** Columns hidden behind the "show done" toggle by default (live work first). */
const UI_HIDDEN_STATUSES = new Set(['done', 'archived'])

/** Statuses that count as "active work" for the filter. */
const ACTIVE_STATUSES = new Set(['todo', 'ready', 'running', 'in_progress'])

/** Statuses that count as "needs attention" for the filter. */
const ATTENTION_STATUSES = new Set(['blocked', 'failed'])

/** "Mine" = tasks addressed to the local crew (no viewer concept yet). */
const MINE_ASSIGNEES = new Set(['jarvis', 'friday'])

type FilterId = 'all' | 'mine' | 'active' | 'attention'

const FILTER_OPTIONS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'active', label: 'Active' },
  { id: 'attention', label: 'Attention' },
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

/** Legal "move to…" targets for the sheet controls (touch has no DnD, and the
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

/* ── Task detail sheet ───────────────────────────────────────────── */
function DetailDrawer({ id, onClose, onChanged, pinned, onTogglePin, byId, onOpen, token = '' }: { id: string; onClose: () => void; onChanged: () => void; pinned: boolean; onTogglePin: () => void; byId: Map<string, HermesTask>; onOpen: (id: string) => void; token?: string }) {
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
      const res = await apiFetch(`/api/kanban/${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDetail(await res.json())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const es = new EventSource(apiUrl('/api/events'))
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
      const res = await apiFetch(`/api/kanban/${encodeURIComponent(id)}`, {
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
      const res = await apiFetch(`/api/kanban/${encodeURIComponent(id)}`, {
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
    <Sheet open onClose={onClose} title={detail?.title ?? 'Task detail'} size="tall">
      <div className={styles.sheetContent}>
        {error && <Card pad="sm" role="alert"><p>Unable to load task: {error}</p><Button onClick={() => void load()}>Retry</Button></Card>}
        {!detail && !error && <SkeletonPanel label="Loading task" />}
        {detail && <>
          <div className={styles.meta}>
            <Chip>{statusLabel(detail.status)}</Chip>
            <span>{detail.assignee || 'Unassigned'}</span>
            {detail.createdAt && <span>Created {fmtDate(detail.createdAt)}</span>}
          </div>
          <div className={styles.actions} aria-label="Task actions">
            {(detail.status === 'blocked' || detail.status === 'failed') && (
              <Button variant="primary" loading={busy === 'unblock'} disabled={!!busy}
                onClick={() => void act('unblock', { reason: 'unblocked from Mission Control' })}
                aria-label={`Unblock ${detail.title}`}>Unblock</Button>
            )}
            {detail.status !== 'done' && detail.status !== 'archived' && (
              <Button variant="primary" loading={busy === 'complete'} disabled={!!busy}
                onClick={() => void act('complete', { result: 'completed from Mission Control' })}
                aria-label={`Mark ${detail.title} complete`}>Complete</Button>
            )}
            <Button active={pinned} onClick={onTogglePin} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${detail.title}`}>
              {pinned ? 'Unpin task' : 'Pin task'}
            </Button>
          </div>
          {moveTargets.length > 0 && <section className={styles.section} id="task-move-actions">
            <h3>Move to</h3>
            <div className={styles.actions}>{moveTargets.map(target => (
              <Button key={target} loading={busy === 'set-status'} disabled={!!busy}
                onClick={() => void act('set-status', { status: target })}
                aria-label={`Move ${detail.title} to ${target}`}>{statusLabel(target)}</Button>
            ))}</div>
          </section>}
          {actErr && <p role="alert">{actErr}</p>}
          {dispatchInfo && <p role="status">{dispatchInfo}</p>}
          {detail.consecutiveFailures > 0 && <p role="status">{detail.consecutiveFailures} consecutive failures{detail.lastFailureError ? ` · ${detail.lastFailureError}` : ''}</p>}
          {detail.body && <section className={styles.section}><h3>Brief</h3><p className={styles.prose}>{detail.body}</p></section>}
          {!!detail.parentIds?.length && <section className={styles.section}><h3>Depends on</h3><div className={styles.actions}>
            {detail.parentIds.map(parentId => <Button key={parentId} onClick={() => onOpen(parentId)}>{byId.get(parentId)?.title ?? parentId}</Button>)}
          </div></section>}
          <section className={styles.section}>
            <Field label="Add comment"><TextArea value={msg} onChange={e => setMsg(e.target.value)} placeholder="Write a comment…" aria-label="Write a comment" rows={2} maxLength={4000} /></Field>
            <Button variant="primary" loading={busy === 'comment'} disabled={!!busy || !msg.trim()} onClick={() => void act('comment', { body: msg })} aria-label={`Post comment on ${detail.title}`}>Send</Button>
          </section>
          {DISPATCH_STATUSES.has(detail.status) && <section className={styles.section}>
            <h3>Run task</h3>
            <div className={styles.formGrid}>
              <Field label="Agent"><Select value={agentKind} onChange={e => { setAgentKind(e.target.value); setAgentModel('') }} disabled={!!busy}>
                <option value="codex">Codex</option><option value="claude">Claude</option><option value="opencode">OpenCode</option>
              </Select></Field>
              <Field label="Model (optional)"><Input value={agentModel} onChange={e => setAgentModel(e.target.value)} placeholder="Agent default" disabled={!!busy} maxLength={160} /></Field>
            </div>
            <div className={styles.actions}>
              <Button disabled={!!busy || !detail.workspacePath} loading={busy === 'dispatch-agent'} onClick={() => void act('dispatch-agent', { kind: agentKind, model: agentModel || undefined })}>Run in Herdr</Button>
              <Button loading={busy === 'dispatch'} disabled={!!busy} onClick={e => void dispatchClaude(e)} aria-label={`Dispatch a Claude Code worker on ${detail.title}`}>Dispatch Claude</Button>
            </div>
            {!detail.workspacePath && <p className={styles.muted}>Assign a task workspace before starting a Herdr agent.</p>}
          </section>}
          <section className={styles.section}><h3>Task information</h3>
            <dl className={styles.facts}>
              <dt>Origin</dt><dd>{detail.origin || '—'}</dd>
              <dt>Priority</dt><dd>{detail.priority}</dd>
              <dt>Created by</dt><dd>{detail.createdBy || '—'}</dd>
              {detail.lastHeartbeatAt && <><dt>Last heartbeat</dt><dd>{fmtDate(detail.lastHeartbeatAt)}</dd></>}
            </dl>
          </section>
          <section className={styles.section}><h3>Runs ({detail.runs.length})</h3>
            {detail.runs.length === 0 && <p className={styles.muted}>No runs yet.</p>}
            {detail.runs.map(run => <Card key={run.id} pad="sm">
              <div className={styles.meta}><Chip>{statusLabel(run.outcome ?? run.status)}</Chip><span>{run.profile}</span><span>{fmtDate(run.startedAt)}</span></div>
              {run.summary && <p className={styles.prose}>{run.summary}</p>}
              {run.error && <p>{run.error}</p>}
            </Card>)}
          </section>
          <section className={styles.section}><h3>Comments ({detail.comments.length})</h3>
            {detail.comments.length === 0 && <p className={styles.muted}>No comments yet.</p>}
            {detail.comments.map(comment => <Card key={comment.id} pad="sm">
              <div className={styles.meta}><strong>{comment.author}</strong><span>{fmtDate(comment.createdAt)}</span></div><p className={styles.prose}>{comment.body}</p>
            </Card>)}
          </section>
          <section className={styles.section}><h3>Events ({detail.events.length})</h3>
            {detail.events.length === 0 && <p className={styles.muted}>No events yet.</p>}
            {detail.events.map(event => <Card key={event.id} pad="sm"><div className={styles.meta}><span>{event.kind}</span><span>{fmtDate(event.createdAt)}</span></div>{event.payload && <p className={styles.prose}>{event.payload}</p>}</Card>)}
          </section>
        </>}
      </div>
    </Sheet>
  )
}

/* ── Create task sheet ───────────────────────────────────────────── */

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
  const submit = useCallback(async () => {
    if (!form.title.trim()) return
    setBusy(true)
    setErr(null)
    const assignee = form.assignee === 'other' ? form.assigneeOther.trim() : form.assignee
    try {
      const res = await apiFetch('/api/kanban', {
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
    <Sheet open onClose={onClose} title="Create kanban task" size="tall">
      <form className={styles.sheetContent} onSubmit={e => { e.preventDefault(); if (!busy) void submit() }}>
        <Field label="Title"><Input required placeholder="Task title…" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={200} /></Field>
        <Field label="Brief"><TextArea placeholder="Brief (optional)…" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={3} maxLength={4000} /></Field>
        <Field label="Assignee"><Select value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}>
          <option value="">Unassigned</option>{ASSIGNEE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}<option value="other">Other…</option>
        </Select></Field>
        {form.assignee === 'other' && <Field label="Other assignee profile"><Input placeholder="Assignee profile…" value={form.assigneeOther} onChange={e => setForm(f => ({ ...f, assigneeOther: e.target.value }))} maxLength={80} /></Field>}
        <div className={styles.formGrid}>
          <Field label="Origin"><Select value={form.origin} onChange={e => setForm(f => ({ ...f, origin: e.target.value }))}>
            <option value="">Default</option>{sources.map(source => <option key={source.origin} value={source.origin}>{source.origin}</option>)}
          </Select></Field>
          <Field label="Priority"><Select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            {PRIORITY_OPTIONS.map(priority => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
          </Select></Field>
        </div>
        {err && <p role="alert">{err}</p>}
        <div className={styles.actions}><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={!form.title.trim()} aria-label="Create task">Create task</Button></div>
      </form>
    </Sheet>
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

function KanbanCard({ task, onOpen, draggable, dragging, onDragStart, onDragEnd }: {
  task: HermesTask
  onOpen: () => void
  draggable: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
}) {
  return <Card as="article" className={`${styles.taskCard} ${dragging ? styles.dragging : ''}`}>
    <Button className={styles.taskButton} aria-label={`Open ${task.title}`} onClick={onOpen}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); onDragStart() }}
      onDragEnd={onDragEnd}>
      <strong className={styles.taskTitle}>{task.title}</strong>
      <Chip>{statusLabel(task.status)}</Chip>
      <span className={styles.taskMeta}>{task.assignee || 'Unassigned'}{task.createdAt && <> · <RelativeTime ts={new Date(task.createdAt).getTime()} frame="ago" /></>}</span>
    </Button>
  </Card>
}

function Column({ def, tasks, pinned, onOpen, expanded, onToggle, desktop, drag, onCardDragStart, onCardDragEnd, onDropToStatus }: {
  def: { status: string; label: string }
  tasks: HermesTask[]
  pinned: Set<string>
  onOpen: (id: string) => void
  expanded: boolean
  onToggle: () => void
  desktop: boolean
  drag: DragInfo | null
  onCardDragStart: (info: DragInfo) => void
  onCardDragEnd: () => void
  onDropToStatus: (to: string) => void
}) {
  const [over, setOver] = useState(false)
  const dropOk = desktop && !!drag && supportedTransition(drag.from, def.status) !== null
  const bodyId = `kanban-lane-${def.status}`
  return <section className={styles.lane} aria-label={`${def.label} lane`}>
    <h2 className={styles.laneHeader}>
      {desktop ? <span className={styles.laneTitle}>{def.label}<Chip>{tasks.length}</Chip></span> : (
        <Button className={styles.laneToggle} aria-expanded={expanded} aria-controls={bodyId} onClick={onToggle}>
          <span>{def.label}</span><Chip>{tasks.length}</Chip><span className={styles.chevron} aria-hidden="true">{expanded ? '−' : '+'}</span>
        </Button>
      )}
    </h2>
    <div id={bodyId} hidden={!desktop && !expanded} className={`${styles.laneBody} ${dropOk ? styles.dropReady : ''} ${dropOk && over ? styles.dropOver : ''}`}
      onDragOver={dropOk ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true) } : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={dropOk ? e => { e.preventDefault(); setOver(false); onDropToStatus(def.status) } : undefined}>
      {tasks.length === 0 ? <p className={styles.empty}>{dropOk ? 'Drop here' : 'No tasks'}</p> : [...tasks].sort((a, b) => taskSort(a, b, pinned)).map(task => (
        <KanbanCard key={task.id} task={task} onOpen={() => onOpen(task.id)} draggable={desktop} dragging={drag?.id === task.id}
          onDragStart={() => onCardDragStart({ id: task.id, from: task.status })} onDragEnd={onCardDragEnd} />
      ))}
    </div>
  </section>
}

/* ── Main board ────────────────────────────────────────────────── */

export function KanbanBoard({ token = '' }: { token?: string }) {
  const searchParams = useSearchParams()
  const [snap, setSnap] = useState<HermesKanbanSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const refreshInFlight = useRef(false)
  const [expanded, setExpanded] = useState<Record<string, boolean> | null>(null)
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
  // Mobile and fold inner displays use sheets for task moves.
  const [isDesktop, setIsDesktop] = useState(false)
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
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
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setRefreshing(true)
    try {
      const res = await apiFetch('/api/kanban', { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const next = await res.json() as HermesKanbanSnapshot
      if (!Array.isArray(next.tasks)) throw new Error('Invalid board response')
      setSnap(next)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Connection failed')
    } finally {
      refreshInFlight.current = false
      setRefreshing(false)
    }
  }, [])

  const closeDetail = useCallback(() => setOpenId(null), [])
  const closeCreate = useCallback(() => setShowCreate(false), [])

  // Consume links from Home even if the board fetch fails; detail has its own request.
  useEffect(() => {
    const readTaskLink = () => {
      const url = new URL(window.location.href)
      const id = url.searchParams.get('task')
      if (!id) return
      setShowCreate(false)
      setOpenId(id)
      url.searchParams.delete('task')
      // Let Next's history wrapper keep its router state in sync with the URL.
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }
    readTaskLink()
    window.addEventListener('popstate', readTaskLink)
    return () => window.removeEventListener('popstate', readTaskLink)
  }, [searchParams])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    const es = new EventSource(apiUrl('/api/events'))
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

  // Sheet owns keyboard handling while a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (openId || showCreate) return
      if (e.key === '/') {
        const el = e.target as HTMLElement | null
        const tag = el?.tagName ?? ''
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape') {
        if (document.activeElement === searchRef.current) {
          setQuery('')
          searchRef.current?.blur()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, showCreate])

  const onCreated = useCallback(async () => {
    await refresh()
  }, [refresh])

  // Optimistically move a card, persist via the supported action, and
  // reconcile against server truth (revert on failure).
  const moveTask = useCallback(async (to: string) => {
    const info = drag
    setMoveError(null)
    setDrag(null)
    if (!info) return
    const action = supportedTransition(info.from, to)
    if (!action) return
    const previous = snap
    setSnap(prev => prev
      ? { ...prev, tasks: prev.tasks.map(t => (t.id === info.id ? { ...t, status: to } : t)) }
      : prev)
    try {
      const body = action === 'complete'
        ? { action: 'complete', result: 'moved to done from Mission Control' }
        : action === 'unblock'
          ? { action: 'unblock', reason: 'unblocked from Mission Control' }
          : { action: 'set-status', status: to }
      const res = await apiFetch(`/api/kanban/${encodeURIComponent(info.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (cause) {
      setSnap(previous)
      setMoveError(cause instanceof Error ? cause.message : 'Unable to move task')
    } finally {
      await refresh()
    }
  }, [drag, refresh, token, snap])

  const tasks = snap?.tasks ?? []
  const sources = (snap as (HermesKanbanSnapshot & { sources?: KanSource[] }) | null)?.sources ?? []
  const byId = new Map(tasks.map(task => [task.id, task]))
  let visible = tasks
  if (filter === 'mine') visible = visible.filter(task => task.assignee && MINE_ASSIGNEES.has(task.assignee))
  else if (filter === 'active') visible = visible.filter(task => ACTIVE_STATUSES.has(task.status))
  else if (filter === 'attention') visible = visible.filter(task => ATTENTION_STATUSES.has(task.status))
  const q = query.trim().toLowerCase()
  if (q) visible = visible.filter(task => `${task.title} ${task.assignee ?? ''} ${(task.parentIds ?? []).map(id => byId.get(id)?.title ?? '').join(' ')}`.toLowerCase().includes(q))
  const byStatus = new Map<string, HermesTask[]>()
  for (const task of visible) byStatus.set(task.status, [...(byStatus.get(task.status) ?? []), task])
  const completedCount = visible.filter(task => UI_HIDDEN_STATUSES.has(task.status)).length
  const statuses = [...COLUMNS, ...[...byStatus.keys()].filter(status => !columnFor(status)).map(status => ({ status, label: statusLabel(status) }))]
  const cols = statuses.filter(column => (showDone || !UI_HIDDEN_STATUSES.has(column.status)) && (byStatus.has(column.status) || (isDesktop && !q && filter === 'all' && column.status !== 'archived')))
  // Highest urgency first, then the largest queue in that urgency tier.
  const urgency = (status: string) => ATTENTION_STATUSES.has(status) ? 4 : status === 'review' ? 3 : ['running', 'in_progress'].includes(status) ? 2 : ACTIVE_STATUSES.has(status) ? 1 : 0
  const defaultLane = [...cols].filter(column => byStatus.has(column.status)).sort((a, b) => urgency(b.status) - urgency(a.status) || (byStatus.get(b.status)?.length ?? 0) - (byStatus.get(a.status)?.length ?? 0))[0]?.status
  const changeFilter = (value: string) => { setFilter(value as FilterId); setExpanded(null) }

  return <>
    <section className={styles.board} aria-label="Kanban board">
      <div className={styles.toolbar}><h1>Kanban</h1><Button variant="primary" onClick={() => setShowCreate(true)}>New task</Button></div>
      <div role="toolbar" aria-label="Task filters">
        <Segmented className={styles.filters} options={FILTER_OPTIONS.map(item => ({ value: item.id, label: item.label }))} value={filter} onChange={changeFilter} />
      </div>
      <div className={styles.searchRow} role="toolbar" aria-label="Filter kanban">
        <Input ref={searchRef} type="search" placeholder="Search tasks…" aria-label="Search tasks by title" value={query}
          onChange={e => { setQuery(e.target.value); setExpanded(null) }} />
        {(completedCount > 0 || showDone) && <Button active={showDone} onClick={toggleShowDone}>{showDone ? 'Hide done' : `Done (${completedCount})`}</Button>}
      </div>
      {error && <Card pad="md" role="alert" className={styles.errorPanel}>
        <strong>{snap ? 'Board could not refresh' : 'Unable to load the board'}</strong>
        <p>{snap ? 'Showing the last loaded tasks. ' : ''}{error}</p>
        <Button loading={refreshing} onClick={() => void refresh()}>Retry</Button>
      </Card>}
      {moveError && <p role="alert">Task was not moved: {moveError}</p>}
      {!snap && !error && <SkeletonPanel label="Loading tasks" />}
      {snap && <div className={styles.lanes}>
        {cols.length === 0 && <Card pad="md"><p className={styles.empty}>{completedCount > 0 ? 'No open tasks match. Show done to view completed work.' : 'No tasks match the current filters.'}</p></Card>}
        {(isDesktop ? cols : [...cols].sort((a, b) => urgency(b.status) - urgency(a.status) || (byStatus.get(b.status)?.length ?? 0) - (byStatus.get(a.status)?.length ?? 0))).map(column => <Column key={column.status} def={column} tasks={byStatus.get(column.status) ?? []} pinned={pinned} onOpen={setOpenId}
          expanded={expanded === null ? column.status === defaultLane : !!expanded[column.status]}
          onToggle={() => setExpanded(previous => {
            const current = previous ?? (defaultLane ? { [defaultLane]: true } : {})
            return { ...current, [column.status]: !current[column.status] }
          })}
          desktop={isDesktop} drag={drag} onCardDragStart={setDrag} onCardDragEnd={() => setDrag(null)} onDropToStatus={moveTask} />)}
      </div>}
      {sources.some(source => !source.available) && <p className={styles.muted} role="status">Unavailable sources: {sources.filter(source => !source.available).map(source => source.name).join(', ')}</p>}
    </section>
    {openId && <DetailDrawer key={openId} id={openId} token={token} pinned={pinned.has(openId)} onTogglePin={() => togglePin(openId)} byId={byId} onOpen={setOpenId} onClose={closeDetail} onChanged={refresh} />}
    {showCreate && <CreateModal sources={sources} token={token} onClose={closeCreate} onCreated={onCreated} />}
  </>
}
