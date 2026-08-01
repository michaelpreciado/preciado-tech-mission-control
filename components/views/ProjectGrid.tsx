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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {projects.map(p => (
        <Window key={p.id} tag="▤" title={p.name}>
          <div style={{ padding: 14, fontSize: 11, color: 'var(--pt-text-dim)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className="mc-led" />
              <span style={{ color: 'var(--pt-neon-bright)', textShadow: 'var(--pt-glow-sm)', letterSpacing: '0.1em' }} title={p.signal}>{p.signal.toUpperCase()}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--pt-text-dim)' }}>{p.kind}</span>
            </div>
            <div style={{ marginTop: 6 }}>{p.tasks} tasks · {p.source}</div>
          </div>
        </Window>
      ))}
    </div>
  )
}
