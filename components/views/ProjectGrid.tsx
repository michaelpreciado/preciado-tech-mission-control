'use client'

import { useLiveData } from '../LiveDataProvider'
import { Window, EmptyTerminal, SkeletonPanel } from '../ui'

/* ── Projects Grid ────────────────────────────────────── */

export function ProjectGrid({ limit }: { limit?: number } = {}) {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading projects" />
  const projects = limit ? data.projects.slice(0, limit) : data.projects
  if (!projects.length) return <EmptyTerminal label="no projects" />

  return (
    <div className="mc-tile-grid mc-tile-grid--tri">
      {projects.map(p => (
        <Window key={p.id} tag="▤" title={p.name}>
          <div className="mc-tile-body">
            <div className="mc-tile-head">
              <span className="mc-led" />
              <span className="mc-tile-status" title={p.signal}>{p.signal.toUpperCase()}</span>
              <span className="mc-tile-right">{p.kind}</span>
            </div>
            <div className="mc-tile-meta">{p.tasks} tasks · {p.source}</div>
          </div>
        </Window>
      ))}
    </div>
  )
}
