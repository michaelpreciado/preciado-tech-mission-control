'use client'

import dynamic from 'next/dynamic'
import { SectionHead, SkeletonPanel } from '@/components/ui'
import { useLiveData } from '@/components/LiveDataProvider'
import { AgentAvatar } from '@/components/AgentAvatar'

const CommandHeader = dynamic(() => import('@/components/DashboardViews').then(m => m.CommandHeader), { ssr: false })
const CrewOffice = dynamic(() => import('@/components/DashboardViews').then(m => m.CrewOffice), { ssr: false })
const AgentCardGrid = dynamic(() => import('@/components/DashboardViews').then(m => m.AgentCardGrid), { ssr: false })

function accentToTint(accent: string) {
  return { fr: accent || '#ff10f0', glow: accent ? `${accent}88` : 'rgba(255,16,240,0.55)' }
}

function TeamVisualCells() {
  const { data, isLive } = useLiveData()
  if (!data) return <SkeletonPanel label="loading team" />
  return (
    <>
      <div className="mc-visual-head">
        <span className="mc-vh-title">[o_o] AGENT OFFICE</span>
        <span className="mc-vh-sub">live crew floor — real-time agent activity</span>
        <div className="mc-vh-meta">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className={`mc-led ${isLive ? 'green' : ''}`} /> {isLive ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>
      <div className="mc-visual-cells">
        {data.crew.map(a => {
          const tint = accentToTint(a.accent)
          return (
            <div key={a.id} className="mc-cell"
              style={{ background: `radial-gradient(ellipse at 50% 70%, ${tint.glow}, transparent 70%), rgba(3,8,20,0.7)` }}>
              <div className="mc-cell-tag" style={{ color: tint.fr, textShadow: `0 0 6px ${tint.glow}` }}>
                {a.name}
                <span className="role">— {a.role}</span>
              </div>
              <span className="mc-cell-status">{a.status.toUpperCase()}</span>
              <AgentAvatar name={a.name} tint={tint} size={4} />
            </div>
          )
        })}
      </div>
    </>
  )
}

export default function TeamPage() {
  return (
    <>
      <CommandHeader />
      <TeamVisualCells />
      <SectionHead label="TEAM / CREW" />
      <CrewOffice />
      <AgentCardGrid />
    </>
  )
}
