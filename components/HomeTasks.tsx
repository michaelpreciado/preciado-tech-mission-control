'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { HermesKanbanSnapshot } from '@/lib/types'
import { TFrame, SectionRule } from './ui'
import styles from './HomeWorkspace.module.css'

const closed = new Set(['done', 'completed', 'cancelled', 'canceled', 'archived'])
const ago = (iso?: string | null) => { if (!iso) return ''; const d = Date.now() - new Date(iso).getTime(); if (!Number.isFinite(d) || d < 0) return ''; const m = Math.round(d / 60000); if (m < 1) return 'now'; if (m < 60) return m + 'm'; const h = Math.round(m / 60); if (h < 24) return h + 'h'; return Math.round(h / 24) + 'd' }
export function HomeTasks() {
  const [snapshot, setSnapshot] = useState<HermesKanbanSnapshot | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let controller: AbortController | undefined
    const poll = async () => {
      if (document.hidden) { timer = setTimeout(poll, 10000); return }
      controller = new AbortController()
      try {
        const response = await fetch('/api/kanban?limit=500', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Unable to load open tasks.')
        const result = await response.json()
        if (!stopped) { setSnapshot(result); setError('') }
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : 'Unable to load tasks.') }
      finally { if (!stopped) timer = setTimeout(poll, 10000) }
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer); controller?.abort() }
  }, [])
  const tasks = (snapshot?.tasks ?? []).filter(task => !closed.has(task.status))
  const rank = (status: string) => ['running', 'in_progress'].includes(status) ? 0 : ['blocked', 'failed'].includes(status) ? 1 : 2
  const shown = [...tasks].sort((a, b) => rank(a.status) - rank(b.status) || b.priority - a.priority).slice(0, 8)
  return <section className={styles.section} aria-labelledby="home-open-tasks">
    <SectionRule label="OPEN TASKS" index={2} id="home-open-tasks" post={<><span>{snapshot ? `${tasks.length} open` : 'Work queue'}</span><Link href="/kanban">View board ↗</Link></>} />
    {error && <p role="status" className={styles.error}>{error}{snapshot ? ' Showing the last loaded tasks.' : ''}</p>}
    {!snapshot && !error && <p className={styles.empty}>Loading your tasks…</p>}
    {snapshot && !snapshot.available && <p className={styles.empty}>Task board is currently unavailable.</p>}
    {snapshot?.available && !tasks.length && <p className={styles.empty}>All clear. No open tasks.</p>}
    <TFrame><div className={styles.tasks}>{shown.map(task => {
      const running = rank(task.status) === 0
      const attention = rank(task.status) === 1
      return <Link className={styles.task} key={task.id} href="/kanban" data-state={running ? 'running' : attention ? 'attention' : 'queued'} data-running={running}>
        <span className={styles.taskDot} data-attention={attention} data-running={running} aria-hidden="true" />
        <div><strong>{task.title}</strong><span>{running
          ? `${task.assignee || 'agent'} · running · ${ago(task.lastHeartbeatAt ?? task.startedAt)} ago`
          : attention
            ? `${task.assignee || 'unassigned'} · ${task.status}`
            : `${task.assignee || 'unassigned'} · queued · ${ago(task.createdAt)} ago`}</span></div><span aria-hidden="true">↗</span>
      </Link>
    })}</div></TFrame>
    {tasks.length > shown.length && <Link className={styles.moreTasks} href="/kanban">See all {tasks.length} open tasks →</Link>}
  </section>
}
