'use client'

/**
 * HOME — the command center.
 *
 * One at-a-glance surface answering: what needs me, what is live, what's
 * scheduled, who's working, and where do I go. Every element is real data and
 * taps through to its page. 4K-fidelity visuals: layered gradients, soft
 * glow, crisp 2-up/3-up tile grids, and tasteful micro-motion.
 */
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useLiveData } from './LiveDataProvider'
import { useUiSettings } from './ui-settings'
import { SectionHead, SkeletonPanel, fmtDate } from './ui'
import { Sparkline } from './Sparkline'
import { CoreHalo } from './views/CoreHalo'
import dynamic from 'next/dynamic'
import type { MissionTask } from '@/lib/types'
import '../app/vf/v3-lane.css'

const CommandHeader = dynamic(() => import('./views/CommandHeader').then(m => m.CommandHeader), { ssr: false, loading: () => <SkeletonPanel label="loading header" /> })
const ActionFeed = dynamic(() => import('./ActionFeed').then(m => m.ActionFeed), { ssr: false })
const CoreOrb3D = dynamic(() => import('./views/CoreOrb3D').then(m => m.default), { ssr: false, loading: () => null })
const RigHud = dynamic(() => import('./views/RigHud').then(m => m.RigHud), { ssr: false, loading: () => <SkeletonPanel label="loading rig telemetry" /> })
const CalendarList = dynamic(() => import('./views/CalendarList').then(m => m.CalendarList), { ssr: false, loading: () => <SkeletonPanel label="loading schedule" /> })

const PRIORITY_TONE: Record<MissionTask['priority'], string> = {
  high: 'alert', normal: '', low: 'info',
}

/* ── Live clock + data-freshness readout (presence) ──────────────────── */

function PresenceClock({ generatedAt, isLive }: { generatedAt?: string; isLive: boolean }) {
  // Starts null on purpose. Seeding this with `new Date()` renders the SERVER's
  // wall clock into the SSR payload; if the second ticks before hydration the
  // text mismatches, React throws #418 and discards the whole server tree to
  // re-render on the client. Time-dependent text must only appear post-mount.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const ageMin = now && generatedAt ? Math.max(0, Math.round((now.getTime() - Date.parse(generatedAt)) / 60000)) : null
  return (
    <div className="mc-home-presence">
      <span className="mc-home-clock">{now ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}</span>
      <span className="mc-home-date">{now ? now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}</span>
      <span className="mc-home-live">
        <span className={`mc-led ${isLive ? 'green' : ''}`} />
        {isLive ? 'LIVE' : 'OFFLINE'}
      </span>
      <span className="mc-home-dataage">data {ageMin === null ? '—' : ageMin === 0 ? 'just now' : `${ageMin}m ago`}</span>
    </div>
  )
}

/* ── Live status tiles (tappable → deep link) ────────────────────────── */

type TileDef = { key: string; label: string; glyph: string; href: string; value: string; sub: string; tone: 'ok' | 'warn' | 'err' | 'info'; spark?: number[]; spark2?: number[]; heat?: number[] }

/** Normalise a contribution count to a 0–4 intensity step against its own series. */
function heatLevel(v: number, series: number[]): number {
  const max = Math.max(1, ...series)
  if (v <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((v / max) * 4)))
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`
  return value.toLocaleString()
}

/** Secondary tile visuals: local-compute spark + GH contribution heatstrip. */
function TileExtras({ tile }: { tile: TileDef }) {
  return (
    <>
      {tile.spark2 && tile.spark2.length > 1 && (
        <span className="mc-home-tile-spark is-local" aria-hidden="true">
          <Sparkline points={tile.spark2} color="var(--mc-cat-3)" />
        </span>
      )}
      {tile.heat && tile.heat.length > 0 && (
        <span className="mc-home-tile-heat" aria-hidden="true">
          {tile.heat.map((v, i) => (
            <i key={i} className="mc-home-tile-heat-cell" data-lvl={heatLevel(v, tile.heat as number[])} />
          ))}
        </span>
      )}
    </>
  )
}

function StatusTiles() {
  const { data } = useLiveData()
  const done = useMemo(() => {
    if (!data) return []
    const crew = data.crew ?? []
    const working = crew.filter(c => c.status === 'active' || c.status === 'on-demand')
    const offline = crew.filter(c => c.status === 'offline' || c.status === 'sleeping')
    const tasks = data.tasks ?? []
    // Board is canonical — kanban openTasks wins, counts.openTasks is the fallback.
    const open = data.kanban?.openTasks ?? data.counts?.openTasks ?? tasks.filter(t => t.status !== 'done').length
    // Only count FAILING ENABLED jobs. Disabled/dormant jobs aren't failures —
    // they're parked, and shouldn't keep the hero red forever.
    const cronFails = (data.cron ?? []).filter(c => c.enabled !== false && c.lastRunStatus === 'error').length
    const billing = data.costs?.billing?.[0]
    const costMonth = billing ? `$${(billing.planAmount + (billing.openRouterUsd ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
    const planTokens = billing ? (billing.claudeTokens ?? 0) + (billing.codexTokens ?? 0) : 0
    // Freshness cue trumps the savings line — stale numbers get an amber warning
    // instead of being shown silently.
    const staleDays = data.costs?.freshness?.staleDays ?? 0
    const localSaved = data.costs?.localCompute?.costAvoidedMonthUsd
    const costSubBase = staleDays > 0
      ? `⚠ data ${staleDays}d old`
      : localSaved != null
        ? `this month · local saved $${Math.round(localSaved)}`
        : 'this month'
    const costSub = planTokens > 0 ? `${costSubBase} · ${formatCompact(planTokens)} in-plan tokens` : costSubBase
    const costTone: TileDef['tone'] = staleDays > 0 ? 'warn' : 'info'
    // Second spark: local-compute daily tokens (53 days) — distinct lime series.
    const localSpark = (data.costs?.localCompute?.daily ?? []).slice(-30).map(d => d.tokens ?? 0)
    const ghStreak = data.github?.currentStreak ?? 0
    // 12-week contribution heatstrip — sum each week's contributionDays so
    // empty weeks still register as a 0 cell (type: { contributionDays: [...] }[]).
    const ghHeat = (data.github?.weeks ?? []).slice(-12).map(w =>
      (w.contributionDays ?? []).reduce((sum, d) => sum + (d.contributionCount ?? 0), 0)
    )
    const kb = data.kanban
    // "WORKING NOW" = live crew agents, not the kanban open count (which can be
    // 0 mid-flight). It answers "is anything happening right now".
    const running = kb?.runningTasks ?? working

    // Live cost burn curve (last 30 logged days) — the money sparkline.
    const costSpark = (data.costs?.daily ?? [])
      .slice(-30)
      .map(d => d.cost ?? 0)

    return [
      { key: 'working', label: 'WORKING NOW', glyph: '▶', href: '/bots', value: String(running), sub: 'agents working', tone: running ? 'ok' : 'info' },
      { key: 'open', label: 'OPEN TASKS', glyph: '≡', href: '/kanban', value: String(open), sub: 'kanban board', tone: open ? 'warn' : 'ok' },
      { key: 'cron', label: 'CRON FAILS', glyph: '○', href: '/calendar', value: String(cronFails), sub: 'jobs failing', tone: cronFails ? 'err' : 'ok' },
      { key: 'cost', label: 'COST · THIS MO', glyph: '$', href: '/costs', value: costMonth, sub: costSub, tone: costTone, spark: costSpark, spark2: localSpark.length > 1 ? localSpark : undefined },
      { key: 'gh', label: 'GH STREAK', glyph: '★', href: '/github', value: `${ghStreak}d`, sub: 'contributions', tone: ghStreak ? 'ok' : 'info', heat: ghHeat },
      { key: 'proj', label: 'PROJECTS', glyph: '▤', href: '/projects', value: String(data.counts?.projects ?? data.projects.length), sub: 'active repos', tone: 'info' },
    ] as TileDef[]
  }, [data])

  if (!data) return <SkeletonPanel label="loading status" />

  const heroIdx = done.findIndex(t => t.tone === 'err')
  const heroTile = heroIdx >= 0 ? done[heroIdx] : done.find(t => t.tone === 'warn')
  const rest = heroTile ? done.filter(t => t.key !== heroTile.key) : done

  return (
    <>
      {heroTile && (
        <div className="mc-home-tile-hero">
          <Link href={heroTile.href} className={`mc-home-tile tone-${heroTile.tone} is-hero`}>
            <span className="mc-home-tile-glyph">{heroTile.glyph}</span>
            <span className="mc-home-tile-mid">
              <span className="mc-home-tile-label">{heroTile.label}</span>
              <span className="mc-home-tile-sub">{heroTile.sub}</span>
            </span>
            <span className="mc-home-tile-value">{heroTile.value}</span>
            {heroTile.spark && heroTile.spark.length > 1 && (
              <span className="mc-home-tile-spark" aria-hidden="true"><Sparkline points={heroTile.spark} color="var(--pt-neon-bright)" /></span>
            )}
            <TileExtras tile={heroTile} />
          </Link>
        </div>
      )}
      <div className="mc-home-tiles">
        {rest.map(t => (
          <Link key={t.key} href={t.href} className={`mc-home-tile tone-${t.tone}`}>
            <span className="mc-home-tile-glyph">{t.glyph}</span>
            <span className="mc-home-tile-mid">
              <span className="mc-home-tile-label">{t.label}</span>
              <span className="mc-home-tile-sub">{t.sub}</span>
            </span>
            <span className="mc-home-tile-value">{t.value}</span>
            {t.spark && t.spark.length > 1 && (
              <span className="mc-home-tile-spark" aria-hidden="true"><Sparkline points={t.spark} color="var(--pt-info)" /></span>
            )}
            <TileExtras tile={t} />
          </Link>
        ))}
      </div>
    </>
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
          <Link key={a.id} href="/bots" className={`mc-home-agent${live ? ' is-live' : ''}${bad ? ' is-bad' : ''}`} title={`${a.name} · ${a.status}`} aria-label={`${a.name} — ${a.status}`}>
            <span className="mc-home-agent-dot" aria-hidden="true" style={{
              background: live ? a.accent : bad ? '#ff5f57' : down ? '#5b6474' : a.accent,
              boxShadow: live ? `0 0 10px ${a.accent}` : 'none',
              opacity: down ? 0.4 : 1,
            }} />
            <span className="mc-home-agent-name">{a.name}</span>
          </Link>
        )
      })}
    </div>
  )
}

/* ── Live activity stream (what the crew is touching) ────────────────── */

const AREA_GLYPH: Record<string, string> = { workspace: '⌬', vault: '⊡', repo: '⭮', inbox: '▣', cron: '○', logs: '≋' }

function LiveActivity() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading activity" />
  const files = data.operations?.recentFiles ?? data.operations?.inbox ?? []
  const hotspots = data.operations?.hotspots ?? []
  if (!files.length && !hotspots.length) {
    return (
      <div className="mc-window">
        <div className="mc-tcol-head"><span className="mc-tcol-glyph">≋</span><span>LIVE ACTIVITY</span><span className="mc-tcol-count">0</span></div>
        <div className="mc-empty is-compact"><div className="mc-empty-glyph">≋</div><div className="mc-empty-title">NO RECENT ACTIVITY</div>
          <p className="mc-empty-desc">Agent work will stream in here as it happens.</p></div>
      </div>
    )
  }

  // hotspot chips
  return (
    <div className="mc-window mc-home-activity">
      <div className="mc-tcol-head"><span className="mc-tcol-glyph">≋</span><span>LIVE ACTIVITY</span>
        <span className="mc-tcol-count">{files.length} SIGNS</span></div>
      {hotspots.length > 0 && (
        <div className="mc-hspot-row">
          {hotspots.map(h => (
            <span key={h.label} className="mc-hspot-chip">
              <span className={`mc-led ${h.tone === 'green' ? 'green' : h.tone === 'amber' ? 'amber' : h.tone === 'red' ? 'red' : ''}`} />
              <span className="mc-hspot-label">{h.label}</span>
              <span className="mc-hspot-count">{h.count}</span>
            </span>
          ))}
        </div>
      )}
      <div className="mc-home-activity-list">
        {files.slice(0, 12).map((f, i) => (
          <div key={f.id || i} className="mc-commit">
            <span className="sha">{AREA_GLYPH[f.area] ?? '·'} {f.ownerName}</span>
            <div>
              <div className="msg" title={f.title}>{f.title}</div>
              <div className="repo">{f.area} · {f.kind}</div>
            </div>
            <span className="when">{f.ageMinutes < 60 ? `${Math.max(1, f.ageMinutes)}m` : fmtDate(f.updatedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── System health summary ───────────────────────────────────────────── */

function HealthSummary() {
  const { data } = useLiveData()
  const integrations = data?.integrations ?? []
  if (!data) return <SkeletonPanel label="loading health" />
  if (!integrations.length) return null
  const up = integrations.filter(i => i.status === 'connected').length
  const down = integrations.filter(i => i.status === 'attention' || i.status === 'missing').length
  return (
    <div className="mc-home-health">
      {integrations.map(i => {
        const tone = i.status === 'connected' ? 'ok' : i.status === 'attention' ? 'warn' : i.status === 'missing' ? 'err' : 'info'
        return (
          <div key={i.name} className={`mc-home-health-chip tone-${tone}`}>
            <span className={`mc-led ${i.status === 'connected' ? 'green' : i.status === 'attention' ? 'amber' : i.status === 'missing' ? 'red' : ''}`} aria-hidden="true" />
            <span className="mc-home-health-name">{i.name}</span>
            <span className="mc-home-health-detail">{i.status}{i.detail ? ` · ${i.detail}` : ''}</span>
          </div>
        )
      })}
      <div className="mc-home-health-score">
        <span className="mc-home-health-count">{up}/{integrations.length}</span>
        <span className="mc-home-health-lbl">INTEGRATIONS UP{down ? ` · ${down} DOWN` : ''}</span>
      </div>
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
      <Link href="/kanban" className={`mc-tcol-head mc-tcol-head-link ${alert ? 'alert' : ''}`}>
        <span className="mc-tcol-glyph">{headGlyph}</span>
        <span>{headLabel}</span>
        <span className="mc-tcol-count">{items.length}</span>
        <span className="mc-tcol-chev" aria-hidden="true">›</span>
      </Link>
      <div className="mc-tcol-body">
        {items.length === 0 ? (
          <div className="mc-tcol-sentinel">— all clear —</div>
        ) : items.map(t => (
          <Link key={t.id} href="/kanban" className="mc-task mc-task-link">
            <div className="mc-task-head">
              <div className="mc-task-title" title={t.title}>{t.title}</div>
              <span className="mc-task-chev" aria-hidden="true">›</span>
            </div>
            <div className="mc-task-meta">
              <span className="agent">{t.ownerName}</span>
              <span className={`mc-task-tag ${PRIORITY_TONE[t.priority] ?? ''}`}>{t.priority}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ── Home — the command center ───────────────────────────────────────── */

export function HomeDeck() {
  const { data, isLive } = useLiveData()
  const { elements3d } = useUiSettings()
  return (
    <>
      <CommandHeader />

      <div className="v1-kicker">
        <span className="jp" lang="ja">司令部</span>
        <span>Command deck</span>
      </div>

      {/* 1 · What needs me */}
      <ActionFeed />

      {/* 2 · Quiet status line */}
      <div className="mc-home-presence-row">
        <PresenceClock generatedAt={data?.generatedAt} isLive={isLive} />
      </div>

      {/* 3 · What needs me / what's live — pulse numbers first, above the fold */}
      <SectionHead label="SYSTEM PULSE" />
      <StatusTiles />
      <AgentPulse />

      {/* 4 · System core + rig telemetry — heavier visuals sit below the pulse */}
      <div className="mc-home-corewrap">
        <div className="mc-home-coreorb-holder">
          {/* CoreHalo is the always-on CSS command-core motif — it makes the
              frame a real instrument. The 3D globe layers on top of it.
              Off (Setup → UI CUSTOMIZATION): the holder still reads as a
              live core, just without the point cloud — no data is lost. */}
          <CoreHalo />
          {elements3d.homeGlobe && <CoreOrb3D />}
        </div>
        <div className="mc-home-corebody">
          <SectionHead label="SYSTEM CORE · RIG" />
          <RigHud />
        </div>
      </div>

      {/* 5 · What's scheduled */}
      <SectionHead label="SCHEDULER / TODAY" />
      <CalendarList limit={5} />

      {/* 6 · Live ops + integrations */}
      <SectionHead label="OPS / LIVE STREAM" />
      <LiveActivity />
      <HealthSummary />

      <SectionHead label="TASKS" />
      <TaskPreview />
    </>
  )
}
