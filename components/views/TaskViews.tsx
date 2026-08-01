'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveData } from '../LiveDataProvider'
import { EmptyTerminal, SkeletonPanel } from '../ui'
import { statusLabel } from './shared'
import type { MissionTask } from '@/lib/types'

/* ── Task Card + Column ───────────────────────────────── */

function buildAttentionPrompt(task: MissionTask): string {
  return [
    `Take care of this task — it's flagged as needing attention on the dashboard:`,
    ``,
    `Title: ${task.title}`,
    task.detail ? `Detail: ${task.detail}` : '',
    `Owner: ${task.ownerName}`,
    `Priority: ${task.priority}`,
    `Source: ${task.source}${task.line ? `:${task.line}` : ''}`,
    ``,
    `Investigate and resolve it, then report back what you did.`,
  ].filter(Boolean).join('\n')
}

/**
 * Per-task agent session. Must satisfy SESSION_RE in app/api/chat/route.ts
 * (`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,48}$`). One session per task, so a follow-up
 * answer lands in the same conversation and two tasks never cross-talk.
 */
function taskSessionId(taskId: string): string {
  return `attn${taskId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`
}

type DispatchMsg = { role: 'you' | 'agent' | 'error'; text: string }

function TaskDispatchAction({ task }: { task: MissionTask }) {
  const { refresh } = useLiveData()
  const [thread, setThread] = useState<DispatchMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [reply, setReply] = useState('')
  const [doneState, setDoneState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [doneErr, setDoneErr] = useState<string | null>(null)
  const started = thread.length > 0 || busy
  const agentReplied = thread.some(m => m.role === 'agent')

  const markDone = useCallback(async () => {
    setDoneState('saving')
    setDoneErr(null)
    try {
      const res = await fetch('/api/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: task.source, line: task.line, title: task.title }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setDoneState('done')
      refresh()
    } catch (err) {
      setDoneErr((err as Error).message)
      setDoneState('error')
    }
  }, [task.source, task.line, task.title, refresh])

  useEffect(() => {
    if (!busy) return
    const t0 = Date.now()
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => { clearInterval(t); setElapsed(0) }
  }, [busy])

  const send = useCallback(async (message: string, echo: boolean) => {
    if (busy || !message.trim()) return
    if (echo) setThread(t => [...t, { role: 'you', text: message }])
    setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, session: taskSessionId(task.id) }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setThread(t => [...t, { role: 'agent', text: j.reply }])
    } catch (err) {
      setThread(t => [...t, { role: 'error', text: (err as Error).message }])
    } finally {
      setBusy(false)
    }
  }, [busy, task.id])

  if (!started) {
    return (
      <button className="mc-task-dispatch" onClick={() => void send(buildAttentionPrompt(task), false)}>
        ▸ HANDLE IT
      </button>
    )
  }

  return (
    <div className="mc-task-thread">
      {thread.map((m, i) => (
        <div key={i} className={`mc-task-msg is-${m.role}`}>
          <span className="mc-task-msg-tag">{m.role === 'you' ? '▸ you' : m.role === 'agent' ? '◂ agent' : '⚠ error'}</span>
          <div className="mc-task-msg-body">{m.text}</div>
        </div>
      ))}

      {busy && <div className="mc-task-msg is-agent"><span className="mc-task-msg-tag">◂ agent</span>
        <div className="mc-task-msg-body mc-task-msg-wait" aria-live="polite">thinking… {elapsed}s</div></div>}

      {/* Offered rather than automatic: the agent's first reply is often a
          question, so auto-ticking on any response would clear live work. */}
      {agentReplied && !busy && task.line != null && (
        <div className="mc-task-donebar">
          {doneState === 'done' ? (
            <span className="mc-task-donetag">✓ ticked in {task.source.split('/').pop()}</span>
          ) : (
            <button className="mc-task-donebtn" onClick={() => void markDone()} disabled={doneState === 'saving'}>
              {doneState === 'saving' ? 'saving…' : '✓ mark done'}
            </button>
          )}
          {doneErr && <span className="mc-task-doneerr">⚠ {doneErr}</span>}
        </div>
      )}

      <form
        className="mc-task-replybar"
        onSubmit={e => { e.preventDefault(); const v = reply; setReply(''); void send(v, true) }}
      >
        <textarea
          value={reply}
          onChange={e => setReply(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              const v = reply
              setReply('')
              void send(v, true)
            }
          }}
          placeholder={busy ? 'agent is working…' : 'Reply to the agent… (Enter to send)'}
          disabled={busy}
          rows={1}
          maxLength={4000}
        />
        <button type="submit" disabled={busy || !reply.trim()}>send ▸</button>
      </form>
    </div>
  )
}

function TaskCard({ task }: { task: MissionTask }) {
  const tagKind = task.status === 'attention' ? 'alert' : task.status === 'done' ? 'done' : ''
  const tagLabel = statusLabel(task.status)
  return (
    <div className="mc-task">
      <div className="mc-task-head">
        <div className="mc-task-title">{task.title}</div>
        <span className={`mc-task-tag ${tagKind}`}>{tagLabel}</span>
      </div>
      <div className="mc-task-meta">
        <span className="agent">{task.ownerName}</span>
        <span>·</span>
        <span>{task.priority}</span>
      </div>
      <div className="mc-task-path">{task.source}</div>
      {task.status === 'attention' && <TaskDispatchAction task={task} />}
    </div>
  )
}

const TASK_PAGE_SIZE = 20

function TaskColumn({ headLabel, count, headGlyph = '▶', alert = false, items, tag = 'ACTIVE', tagKind = '' }: {
  headLabel: string; count: number; headGlyph?: string; alert?: boolean
  items: MissionTask[]; tag?: string; tagKind?: string
}) {
  const [visible, setVisible] = useState(TASK_PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasMore = visible < items.length

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const root = el.closest('.mc-main')
    const io = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) setVisible(v => Math.min(v + TASK_PAGE_SIZE, items.length))
    }, { root, rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, items.length])

  const shown = items.slice(0, visible)

  return (
    <div className="mc-window mc-tcol">
      <div className={`mc-tcol-head ${alert ? 'alert' : ''}`}>
        <span className="mc-tcol-glyph">{headGlyph}</span>
        <span>{headLabel}</span>
        <span className="mc-tcol-count">{count}</span>
      </div>
      <div className="mc-tcol-body">
        {shown.length === 0 ? (
          <div style={{ padding: '12px 0', color: 'var(--pt-text-mute)', fontSize: 10, letterSpacing: '0.18em' }}>
            — none —
          </div>
        ) : shown.map(t => <TaskCard key={t.id} task={t} />)}
        {hasMore && <div ref={sentinelRef} className="mc-tcol-sentinel">▾ loading more…</div>}
      </div>
    </div>
  )
}

export function TaskBoard({ limit }: { limit?: number } = {}) {
  const { data } = useLiveData()
  const tasks = data?.tasks ?? []

  const buckets = useMemo(() => {
    const needs = tasks.filter(t => t.status === 'attention')
    const active = tasks.filter(t => t.status === 'active')
    const scheduled = tasks.filter(t => t.status === 'scheduled')
    const backlog = tasks.filter(t => t.status === 'backlog')
    const done = tasks.filter(t => t.status === 'done')
    return { needs, active, scheduled, backlog, done }
  }, [tasks])

  if (!data) return <SkeletonPanel label="loading tasks" />

  // An empty Hermes board is a normal state, not a failure — say so plainly
  // rather than rendering five blank columns that read as broken.
  if (tasks.length === 0) {
    return <EmptyTerminal label="hermes board is empty — no tasks created yet (hermes kanban create …)" />
  }

  const sl = (arr: MissionTask[]) => limit ? arr.slice(0, limit) : arr

  return (
    <div className="mc-kanban">
      <TaskColumn headLabel="NEEDS ATTENTION" headGlyph="⚠" alert
        count={buckets.needs.length} items={sl(buckets.needs)} tag="ATTENTION" tagKind="alert" />
      <TaskColumn headLabel="ACTIVE" headGlyph="▶"
        count={buckets.active.length} items={sl(buckets.active)} tag="ACTIVE" />
      <TaskColumn headLabel="SCHEDULED" headGlyph="◷"
        count={buckets.scheduled.length} items={sl(buckets.scheduled)} tag="SCHEDULED" />
      <TaskColumn headLabel="BACKLOG" headGlyph="≡"
        count={buckets.backlog.length} items={sl(buckets.backlog)} tag="BACKLOG" />
      <TaskColumn headLabel="DONE" headGlyph="✓"
        count={buckets.done.length} items={sl(buckets.done)} tag="DONE" tagKind="done" />
    </div>
  )
}
