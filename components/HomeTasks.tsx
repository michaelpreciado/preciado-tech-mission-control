'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { HermesKanbanSnapshot } from '@/lib/types'
import styles from './HomeWorkspace.module.css'

const closed = new Set(['done', 'completed', 'cancelled', 'canceled', 'archived'])
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
  const rank = (status: string) => ['blocked', 'failed'].includes(status) ? 0 : ['running', 'in_progress'].includes(status) ? 1 : 2
  const shown = [...tasks].sort((a, b) => rank(a.status) - rank(b.status) || b.priority - a.priority).slice(0, 6)
  return <section className={styles.section} aria-labelledby="home-open-tasks">
    <header className={styles.sectionHeader}><div><span className={styles.kicker}>WORK QUEUE</span><h2 id="home-open-tasks">Open tasks <span>{snapshot ? tasks.length : '—'}</span></h2></div><Link href="/kanban">View board ↗</Link></header>
    {error && <p role="status" className={styles.error}>{error}{snapshot ? ' Showing the last loaded tasks.' : ''}</p>}
    {!snapshot && !error && <p className={styles.empty}>Loading your tasks…</p>}
    {snapshot && !snapshot.available && <p className={styles.empty}>Task board is currently unavailable.</p>}
    {snapshot?.available && !tasks.length && <p className={styles.empty}>All clear. No open tasks.</p>}
    <div className={styles.tasks}>{shown.map(task => <Link className={styles.task} key={task.id} href="/kanban">
      <span className={styles.taskDot} data-attention={rank(task.status) === 0} aria-hidden="true" />
      <div><strong>{task.title}</strong><span>{task.assignee || 'Unassigned'} · {task.status.replaceAll('_', ' ')}</span></div><span aria-hidden="true">↗</span>
    </Link>)}</div>
    {tasks.length > shown.length && <Link className={styles.moreTasks} href="/kanban">See all {tasks.length} open tasks →</Link>}
  </section>
}
