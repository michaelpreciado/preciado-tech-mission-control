'use client'

import { useState } from 'react'
import { useLiveData } from './LiveDataProvider'
import { SectionHead, SkeletonPanel } from './ui'
import dynamic from 'next/dynamic'
import type { MissionTask } from '@/lib/types'

const CommandHeader = dynamic(() => import('./DashboardViews').then(m => m.CommandHeader), { ssr: false, loading: () => <SkeletonPanel label="loading header" /> })
const ActionFeed = dynamic(() => import('./ActionFeed').then(m => m.ActionFeed), { ssr: false })
const CalendarList = dynamic(() => import('./DashboardViews').then(m => m.CalendarList), { ssr: false, loading: () => <SkeletonPanel label="loading schedule" /> })
const GithubPanel = dynamic(() => import('./DashboardViews').then(m => m.GithubPanel), { ssr: false, loading: () => <SkeletonPanel label="loading github" /> })
const CostsPanel = dynamic(() => import('./DashboardViews').then(m => m.CostsPanel), { ssr: false, loading: () => <SkeletonPanel label="loading costs" /> })
const OperationsPanel = dynamic(() => import('./DashboardViews').then(m => m.OperationsPanel), { ssr: false, loading: () => <SkeletonPanel label="loading ops" /> })
const ProjectGrid = dynamic(() => import('./DashboardViews').then(m => m.ProjectGrid), { ssr: false, loading: () => <SkeletonPanel label="loading projects" /> })
const SystemHealthPanel = dynamic(() => import('./SystemHealthPanel').then(m => m.SystemHealthPanel), { ssr: false, loading: () => <SkeletonPanel label="loading system health" /> })

const tabs = [
  { id: 'overview', label: 'Overview', glyph: '■' },
  { id: 'intel', label: 'Intel', glyph: '◆' },
  { id: 'operations', label: 'Operations', glyph: '▶' },
] as const

type TabId = typeof tabs[number]['id']

function DeckTabs({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="mc-tabs">
      {tabs.map(t => (
        <button key={t.id}
          className={`mc-tab ${active === t.id ? 'is-active' : ''}`}
          onClick={() => onChange(t.id)}>
          <span className="mc-tab-glyph">{t.glyph}</span>{t.label}
        </button>
      ))}
    </div>
  )
}

/* Two-column task preview for the deck (needs + active only) */
function DeckTaskPreview() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading tasks" />
  const tasks = data.tasks ?? []
  const needs = tasks.filter(t => t.status === 'attention').slice(0, 5)
  const active = tasks.filter(t => t.status === 'active').slice(0, 5)
  return (
    <div className="mc-deck-grid">
      <TaskPreviewCol headLabel="NEEDS ATTENTION" headGlyph="⚠" alert items={needs} />
      <TaskPreviewCol headLabel="ACTIVE" headGlyph="▶" items={active} />
    </div>
  )
}

function TaskPreviewCol({ headLabel, headGlyph, alert, items }: {
  headLabel: string; headGlyph: string; alert?: boolean; items: MissionTask[]
}) {
  return (
    <div className="mc-window mc-tcol">
      <div className={`mc-tcol-head ${alert ? 'alert' : ''}`}>
        <span className="mc-tcol-glyph">{headGlyph}</span>
        <span>{headLabel}</span>
        <span className="mc-tcol-count">{items.length}</span>
      </div>
      <div className="mc-tcol-body">
        {items.length === 0 ? (
          <div style={{ padding: '12px 0', color: 'var(--pt-text-mute)', fontSize: 10, letterSpacing: '0.18em' }}>
            — all clear —
          </div>
        ) : items.map(t => (
          <div key={t.id} className="mc-task">
            <div className="mc-task-head">
              <div className="mc-task-title">{t.title}</div>
            </div>
            <div className="mc-task-meta">
              <span className="agent">{t.ownerName}</span>
              <span>·</span>
              <span>{t.priority}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HomeDeck() {
  const [tab, setTab] = useState<TabId>('overview')

  return (
    <>
      <CommandHeader />
      <ActionFeed />
      <DeckTabs active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <>
          <SectionHead label="TASKS" />
          <DeckTaskPreview />

          <SectionHead label="SCHEDULER" />
          <CalendarList limit={5} />
        </>
      )}

      {tab === 'intel' && (
        <>
          <SectionHead label="GITHUB" />
          <GithubPanel />
          <SectionHead label="COSTS" />
          <CostsPanel />
        </>
      )}

      {tab === 'operations' && (
        <>
          <SectionHead label="SYSTEM HEALTH" />
          <SystemHealthPanel />
          <SectionHead label="OPS / LIVE STREAM" />
          <OperationsPanel />
          <SectionHead label="PROJECTS" />
          <ProjectGrid limit={6} />
        </>
      )}
    </>
  )
}
