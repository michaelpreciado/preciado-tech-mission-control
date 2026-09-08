'use client'

import { useState } from 'react'
import type { HermesTask } from '@/lib/types'
import styles from './TaskOverview.module.css'

const running = (t: HermesTask) => ['running', 'in_progress'].includes(t.status)
const attention = (t: HermesTask) => ['blocked', 'failed'].includes(t.status)

export function TaskOverview({ tasks, byId, onOpen }: {
  tasks: HermesTask[]
  byId: Map<string, HermesTask>
  onOpen: (id: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const groups = new Map<string, HermesTask[]>()
  for (const task of tasks) {
    const key = task.assignee || ''
    const group = groups.get(key) ?? []
    group.push(task)
    groups.set(key, group)
  }
  const agent = selected !== null && groups.has(selected) ? selected : null
  const jobs = agent === null ? tasks : groups.get(agent) ?? []
  const ordered = [...jobs].sort((a, b) => Number(attention(b)) - Number(attention(a)) || Number(running(b)) - Number(running(a)) || b.priority - a.priority)

  return <section className={styles.overview} aria-label="Task overview">
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}>TASK NETWORK</span><h2>Work in motion</h2><p>Follow the work. See who owns the next step.</p></div>
      <div className={styles.metrics}>
        <span><strong>{tasks.length}</strong> tasks in view</span>
        <span><strong>{tasks.filter(running).length}</strong> running</span>
        <span><strong>{tasks.filter(attention).length}</strong> need attention</span>
      </div>
    </div>
    <div className={styles.network}>
      <button className={styles.hub} aria-pressed={agent === null} onClick={() => setSelected(null)}>
        <span className={styles.eyebrow}>MISSION CONTROL</span><strong>Task hub</strong><span>{groups.size} assignment groups · view all →</span>
      </button>
      <div className={styles.agents} aria-label="Filter by assignee">
        {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, work]) => <button key={name} className={styles.agent} aria-pressed={agent === name} onClick={() => setSelected(agent === name ? null : name)}>
          <span className={styles.agentTitle}><span className={styles.avatar}>{name ? name.slice(0, 2).toUpperCase() : '—'}</span><strong>{name || 'Unassigned'}</strong><span className={styles.dot} data-running={work.some(running)} aria-label={work.some(running) ? 'Has running tasks' : 'No running tasks'} /></span>
          <span className={styles.workload}>{work.length} tasks <span>{work.filter(running).length} running</span></span>
          <span className={styles.track}><span style={{ width: `${work.filter(running).length / work.length * 100}%` }} /></span>
          <span className={styles.agentFoot}>{work.filter(attention).length ? `${work.filter(attention).length} need attention` : 'No blocked or failed tasks'} <span>View tasks ↗</span></span>
        </button>)}
      </div>
    </div>
    <div className={styles.jobsHeading}><h3>{agent === null ? 'All tasks' : `${agent || 'Unassigned'} tasks`} <span>{jobs.length}</span></h3>{agent !== null && <button onClick={() => setSelected(null)}>Clear assignee filter ×</button>}</div>
    <div className={styles.jobs}>
      {ordered.map(task => <article key={task.id} className={styles.job}>
        <button className={styles.openTask} onClick={() => onOpen(task.id)}>
          <span className={styles.status} data-tone={attention(task) ? 'attention' : running(task) ? 'running' : 'neutral'}>{task.status.replaceAll('_', ' ')}</span>
          <strong>{task.title}</strong>
          <span className={styles.meta}>{task.assignee || 'Unassigned'}{task.origin ? ` · ${task.origin}` : ''} · Priority {task.priority}</span>
          <span className={styles.inspect}>Open task ↗</span>
        </button>
        {!!task.parentIds?.length && <div className={styles.parents}><span>Depends on</span>{task.parentIds.map(id => <button key={id} onClick={() => onOpen(id)}>{byId.get(id)?.title || id} ↗</button>)}</div>}
      </article>)}
      {jobs.length === 0 && <p className={styles.empty}>No tasks match the current filters.</p>}
    </div>
  </section>
}
