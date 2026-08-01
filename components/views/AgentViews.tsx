'use client'

import { useLiveData } from '../LiveDataProvider'
import { SkeletonPanel, fmtDate } from '../ui'
import { AgentAvatar } from '../AgentAvatar'
import { CATEGORICAL, glow } from '@/lib/chart-colors'
import { statusLabel } from './shared'
import type { CrewMember } from '@/lib/types'

/* ── Agent Office ─────────────────────────────────────── */

/* CrewOffice removed: it animated a hardcoded 7-agent roster whose status came
   from an empty kanban DB, so the floor was fiction. components/AgentOffice.tsx
   replaces it with desks driven by real per-channel session activity. */

const TINT = {
  blue:    { fr: CATEGORICAL[0], glow: glow(CATEGORICAL[0]) },
  magenta: { fr: CATEGORICAL[1], glow: glow(CATEGORICAL[1]) },
  lime:    { fr: CATEGORICAL[2], glow: glow(CATEGORICAL[2]) },
  violet:  { fr: CATEGORICAL[3], glow: glow(CATEGORICAL[3]) },
  teal:    { fr: CATEGORICAL[4], glow: glow(CATEGORICAL[4]) },
  orange:  { fr: CATEGORICAL[5], glow: glow(CATEGORICAL[5]) },
}

function accentToTint(accent: string) {
  for (const t of Object.values(TINT)) {
    if (t.fr === accent) return t
  }
  return { fr: accent || TINT.blue.fr, glow: accent ? glow(accent) : TINT.blue.glow }
}

function AgentCard({ agent }: { agent: CrewMember }) {
  const tint = accentToTint(agent.accent)
  const live = agent.status === 'active' || agent.status === 'on-demand'
  return (
    <div className="mc-agent-card">
      <div className="mc-agent-card-pix">
        <AgentAvatar name={agent.name} tint={tint} size={3} />
      </div>
      <div className="mc-agent-card-info">
        <div className="mc-agent-card-row">
          <span className={`mc-led ${live ? '' : 'dim'}`} style={{ background: tint.fr, boxShadow: `0 0 6px ${tint.glow}` }} />
          <span className="mc-agent-card-name" style={{ color: tint.fr, textShadow: `0 0 6px ${tint.glow}` }}>{agent.name}</span>
          <span className={`mc-agent-card-status ${live ? 'live' : ''}`}>{statusLabel(agent.status)}</span>
        </div>
        <div className="mc-agent-card-role">{agent.role}</div>
        <div className="mc-agent-card-meta">
          <span>{agent.model || agent.station}</span>
          <span>last run {agent.lastRun ? fmtDate(agent.lastRun) : '—'}</span>
        </div>
      </div>
    </div>
  )
}

export function AgentCardGrid() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading agents" />
  return (
    <div className="mc-agent-grid">
      {data.crew.map(a => <AgentCard key={a.id} agent={a} />)}
    </div>
  )
}
