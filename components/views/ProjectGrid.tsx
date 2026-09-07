'use client'

import { useState } from 'react'
import { useLiveData } from '../LiveDataProvider'
import { Window, EmptyTerminal, SkeletonPanel } from '../ui'
import { Tilt } from '../Tilt'

/* ── Projects Grid ────────────────────────────────────── */

const PRIORITY_TONE: Record<string, string> = { high: 'alert', normal: '', low: 'info' }

export function ProjectGrid({ limit }: { limit?: number } = {}) {
  const { data } = useLiveData()
  const [open, setOpen] = useState<Set<string>>(new Set())
  if (!data) return <SkeletonPanel label="loading projects" />
  const projects = limit ? data.projects.slice(0, limit) : data.projects
  if (!projects.length) return <EmptyTerminal label="no projects" />

  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <div className="mc-tile-grid mc-tile-grid--tri v4-group">
      {projects.map(p => {
        const todo = p.todo ?? []
        const openCount = todo.filter(t => t.status !== 'done').length
        const expanded = open.has(p.id)
        return (
          <Tilt key={p.id} className="mc-proj-tilt">
            <Window tag="▤" title={p.name}>
              <div className="mc-tile-body">
              <div className="mc-tile-head">
                <span className="mc-led" />
                <span className="mc-tile-status" title={p.signal}>{p.signal.toUpperCase()}</span>
                <span className="mc-tile-right">{p.kind}</span>
              </div>
              <div className="mc-tile-meta">{p.tasks} tasks · {p.source}</div>

              {todo.length > 0 && (
                <div className="mc-proj-todo">
                  <button type="button" className="mc-proj-todo-toggle"
                    onClick={() => toggle(p.id)}
                    aria-expanded={expanded}
                    aria-label={`${openCount} open to-do items for ${p.name}`}>
                    <span className="mc-proj-todo-carets">{expanded ? '▾' : '▸'}</span>
                    <span className="mc-proj-todo-label">TO-DO</span>
                    <span className={`mc-proj-todo-count ${openCount ? 'hot' : ''}`}>{openCount} OPEN</span>
                  </button>
                  {expanded && (
                    <ul className="mc-proj-todo-list">
                      {todo.map(t => (
                        <li key={t.id} className={`mc-proj-task ${t.status === 'done' ? 'is-done' : ''}`}>
                          <span className="mc-proj-task-box" aria-hidden="true">
                            {t.status === 'done' ? '✓' : ''}
                          </span>
                          <span className="mc-proj-task-title">{t.title}</span>
                          <span className={`mc-proj-task-prio ${PRIORITY_TONE[t.priority] ?? ''}`}>{t.priority}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {p.github && typeof p.github.openIssues === 'number' && (
                <div className="mc-tile-foot">{p.github.openIssues} open issues</div>
              )}
            </div>
            </Window>
          </Tilt>
        )
      })}
    </div>
  )
}
