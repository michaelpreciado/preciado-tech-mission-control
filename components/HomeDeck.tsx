'use client'

/**
 * HOME — the command center.
 *
 * Rebuilt from the old 3-tab "Deck" (which just re-mounted the full Github/
 * Costs/SystemHealth panels, making it a second copy of every tab). Home is now
 * ONE at-a-glance surface that answers the three questions every visit asks:
 *   1. What needs me right now?   → ActionFeed (needs-you strip)
 *   2. What is live?              → status tiles + agent pulse + scheduler
 *   3. Where do I go?             → quick-launch grid (deep links)
 *
 * Every tile is tappable and navigates to its page. Real data only — nothing
 * fabricated. Mobile-first: stacks clean on the Pixel Fold, thumb-reachable.
 */
import Link from 'next/link'
import { useMemo } from 'react'
import { useLiveData } from './LiveDataProvider'
import { SectionHead, SkeletonPanel } from './ui'
import { Icon, type IconName } from './icons'
import dynamic from 'next/dynamic'
import type { MissionTask } from '@/lib/types'

const CommandHeader = dynamic(() => import('./views/CommandHeader').then(m => m.CommandHeader), { ssr: false, loading: () => <SkeletonPanel label="loading header" /> })
const ActionFeed = dynamic(() => import('./ActionFeed').then(m => m.ActionFeed), { ssr: false })

/** Priority → existing mc-task-tag tone. */
const PRIORITY_TONE: Record<MissionTask['priority'], string> = {
  high: 'alert', normal: '', low: 'info',
}

/* ── Live status tiles (tappable → deep link) ────────────────────────── */

type TileDef = { key: string; label: string; glyph: string; href: string; value: string; sub: string; tone: 'ok' | 'warn' | 'err' | 'info' }

function StatusTiles() {
  const { data } = useLiveData()
  const done = useMemo(() => {
    if (!data) return []
    const crew = data.crew ?? []
    const working = crew.filter(c => c.status === 'active' || c.status === 'on-demand')
    const offline = crew.filter(c => c.status === 'offline' || c.status === 'sleeping')
    const tasks = data.tasks ?? []
    const open = data.counts?.openTasks ?? tasks.filter(t => t.status !== 'done').length
    const cronFails = (data.cron ?? []).filter(c => c.lastRunStatus === 'error').length
    const billing = data.costs?.billing?.[0]
    const costMonth = billing ? `$${(billing.planAmount + (billing.openRouterUsd ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
    const ghStreak = data.github?.currentStreak ?? 0
    const pending = open > 0 ? open : 0

    const tiles: TileDef[] = [
      { key: 'working', label: 'WORKING NOW', glyph: '▶', href: '/team', value: String(working.length), sub: `${offline.length} offline`, tone: working.length ? 'ok' : 'info' },
      { key: 'open', label: 'OPEN TASKS', glyph: '≡', href: '/kanban', value: String(pending), sub: 'kanban board', tone: pending ? 'warn' : 'ok' },
      { key: 'cron', label: 'CRON FAILS', glyph: '○', href: '/calendar', value: `${cronFails}/${data.cron.length}`, sub: 'scheduler', tone: cronFails ? 'err' : 'ok' },
      { key: 'cost', label: 'COST · THIS MO', glyph: '$', href: '/costs', value: costMonth, sub: 'plan + OR', tone: 'info' },
      { key: 'gh', label: 'GH STREAK', glyph: '★', href: '/github', value: `${ghStreak}d`, sub: 'contributions', tone: ghStreak ? 'ok' : 'info' },
    ]
    return tiles
  }, [data])

  if (!data) return <SkeletonPanel label="loading status" />
  return (
    <div className="mc-home-tiles">
      {done.map(t => (
        <Link key={t.key} href={t.href} className={`mc-home-tile tone-${t.tone}`}>
          <span className="mc-home-tile-glyph">{t.glyph}</span>
          <span className="mc-home-tile-mid">
            <span className="mc-home-tile-label">{t.label}</span>
            <span className="mc-home-tile-sub">{t.sub}</span>
          </span>
          <span className="mc-home-tile-value">{t.value}</span>
        </Link>
      ))}
    </div>
  )
}

/* ── Live agent pulse ────────────────────────────────────────────────── */

function AgentPulse() {
  const { data } = useLiveData()
  const crew = data?.crew ?? []
  if (!data) return <SkeletonPanel label="loading agents" />
  if (!crew.length) return null
  return (
    <div className="mc-home-agents">
      {crew.map(a => {
        const live = a.status === 'active' || a.status === 'on-demand'
        const bad = a.status === 'attention'
        const down = a.status === 'offline'
        return (
          <Link key={a.id} href="/team" className={`mc-home-agent${live ? ' is-live' : ''}${bad ? ' is-bad' : ''}`} title={`${a.name} · ${a.status}`}>
            <span className="mc-home-agent-dot" style={{
              background: bad ? '#ff5f57' : down ? '#5b6474' : live ? a.accent : a.accent,
              boxShadow: live ? `0 0 8px ${a.accent}` : 'none',
              opacity: down ? 0.4 : 1,
            }} />
            <span className="mc-home-agent-name">{a.name}</span>
          </Link>
        )
      })}
    </div>
  )
}

/* ── Quick-launch grid ───────────────────────────────────────────────── */

const LAUNCH: { href: string; label: string; icon: IconName; desc: string }[] = [
  { href: '/kanban', label: 'Kanban', icon: 'kanban', desc: 'Board & tasks' },
  { href: '/approvals', label: 'Approvals', icon: 'approvals', desc: 'Waiting on you' },
  { href: '/costs', label: 'Costs', icon: 'costs', desc: 'Spend & billing' },
  { href: '/team', label: 'Team', icon: 'team', desc: 'Agent mesh' },
  { href: '/memory', label: 'Memory', icon: 'memory', desc: 'Steward ledger' },
  { href: '/calendar', label: 'Scheduler', icon: 'calendar', desc: 'Cron jobs' },
]

function LaunchGrid() {
  return (
    <div className="mc-home-launch">
      {LAUNCH.map(l => (
        <Link key={l.href} href={l.href} className="mc-home-launch-card">
          <span className="mc-home-launch-ic"><Icon name={l.icon} size={18} /></span>
          <span className="mc-home-launch-body">
            <span className="mc-home-launch-name">{l.label}</span>
            <span className="mc-home-launch-desc">{l.desc}</span>
          </span>
          <span className="mc-home-launch-arrow">›</span>
        </Link>
      ))}
    </div>
  )
}

/* ── Task preview (needs + active) ───────────────────────────────────── */

function TaskPreview() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading tasks" />
  const tasks = data.tasks ?? []
  const needs = tasks.filter(t => t.status === 'attention').slice(0, 5)
  const active = tasks.filter(t => t.status === 'active').slice(0, 5)
  return (
    <div className="mc-deck-grid">
      <TaskCol headLabel="NEEDS ATTENTION" headGlyph="⚠" alert items={needs} />
      <TaskCol headLabel="ACTIVE" headGlyph="▶" items={active} />
    </div>
  )
}

function TaskCol({ headLabel, headGlyph, alert, items }: {
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
          <div className="mc-tcol-sentinel">— all clear —</div>
        ) : items.map(t => (
          <div key={t.id} className="mc-task">
            <div className="mc-task-head">
              <div className="mc-task-title" title={t.title}>{t.title}</div>
            </div>
            <div className="mc-task-meta">
              <span className="agent">{t.ownerName}</span>
              <span className={`mc-task-tag ${PRIORITY_TONE[t.priority] ?? ''}`}>{t.priority}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Home — the command center ───────────────────────────────────────── */

export function HomeDeck() {
  return (
    <>
      <CommandHeader />

      {/* 1 · What needs me */}
      <ActionFeed />

      {/* 2 · What is live — status tiles */}
      <SectionHead label="SYSTEM PULSE" />
      <StatusTiles />

      {/* agents */}
      <AgentPulse />

      {/* 3 · Where do I go — quick launch */}
      <SectionHead label="COMMAND CENTER" />
      <LaunchGrid />

      <SectionHead label="TASKS" />
      <TaskPreview />
    </>
  )
}
