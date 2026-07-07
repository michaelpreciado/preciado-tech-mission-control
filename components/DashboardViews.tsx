'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLiveData } from './LiveDataProvider'
import { SectionHead, Window, EmptyTerminal, SkeletonPanel, fmtDate } from './ui'
import { Heatmap, StackedBarChart } from './Viz'
import { AgentAvatar } from './AgentAvatar'
import { useBrand } from './Shell'
import type {
  MissionTask, MissionCron, MissionProject, CrewMember,
  MemoryEntry, GitHubActivity, CostDashboard,
  ModelUsage, CalendarEvent, Idea, Mission, OperationsDashboard,
} from '@/lib/types'

/* ── StatusDot ── */

export function StatusDot({ status }: { status?: string }) {
  const cls = status === 'active' ? 'green' : status === 'attention' ? 'amber' : ''
  return <span className={`mc-led ${cls}`} />
}

/* ── Helpers ──────────────────────────────────────────── */

const TINT = {
  blue:    { fr: '#ff10f0', glow: 'rgba(255,16,240,0.55)' },
  cyan:    { fr: '#5eead4', glow: 'rgba(94,234,212,0.55)' },
  violet:  { fr: '#b58dff', glow: 'rgba(181,141,255,0.55)' },
  amber:   { fr: '#ffb84d', glow: 'rgba(255,184,77,0.55)' },
  lime:    { fr: '#a3e635', glow: 'rgba(163,230,53,0.55)' },
  magenta: { fr: '#ff6bd6', glow: 'rgba(255,107,214,0.55)' },
}

function accentToTint(accent: string) {
  for (const t of Object.values(TINT)) {
    if (t.fr === accent) return t
  }
  return { fr: accent || TINT.blue.fr, glow: accent ? `${accent}88` : TINT.blue.glow }
}

const CREW_POS: Record<string, { x: number; y: number }> = {
  friday: { x: 50, y: 50 }, crypto: { x: 50, y: 20 },
  echo: { x: 22, y: 32 }, sage: { x: 78, y: 32 },
  forge: { x: 18, y: 72 }, ticker: { x: 50, y: 80 }, scout: { x: 82, y: 72 },
}

function money(n?: number) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

function statusLabel(s?: string) {
  if (s === 'active') return 'ACTIVE'
  if (s === 'standby') return 'STANDBY'
  if (s === 'sleeping') return 'SLEEPING'
  if (s === 'on-demand') return 'ON-DEMAND'
  if (s === 'attention') return 'ATTENTION'
  return (s || 'STANDBY').toUpperCase()
}

/* ── Cockpit (stat header) ────────────────────────────── */

export function CommandHeader() {
  const { data, isLive, refresh } = useLiveData()
  const { appName, appTagline } = useBrand()
  const [now, setNow] = useState(() => new Date())
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  const counts = data?.counts
  const allTasks = data?.tasks ?? []

  const stats = data ? [
    { key: 'attention', label: 'Attention', value: allTasks.filter(t => t.status === 'attention').length, glyph: '⚠' },
    { key: 'active', label: 'Active', value: allTasks.filter(t => t.status === 'active').length, glyph: '▶' },
    { key: 'cron_live', label: 'Cron', value: counts?.enabledCronJobs ?? 0, glyph: '○' },
    { key: 'projects', label: 'Projects', value: counts?.projects ?? 0, glyph: '■' },
  ] : []

  return (
    <div className="mc-cockpit">
      <span className="mc-cockpit-corner tl" />
      <span className="mc-cockpit-corner tr" />
      <span className="mc-cockpit-corner bl" />
      <span className="mc-cockpit-corner br" />
      <div className="mc-cockpit-row">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h1 className="mc-hero-brand">{appName}</h1>
          <div className="mc-stats">
            {stats.map(s => (
              <div key={s.key} className="mc-stat">
                <span className="mc-stat-corner tl" />
                <span className="mc-stat-corner tr" />
                <span className="mc-stat-corner bl" />
                <span className="mc-stat-corner br" />
                <div className="mc-stat-head">
                  <span className="mc-stat-glyph">{s.glyph}</span>
                  <span>{s.label}</span>
                </div>
                <div className="mc-stat-val">{s.value}</div>
              </div>
            ))}
            <div className="mc-live-badge">
              <span className={`mc-led ${isLive ? 'green' : ''}`} /> {isLive ? 'LIVE' : 'OFFLINE'}
              <span style={{ color: 'var(--pt-text-mute)', marginLeft: 6, letterSpacing: '0.06em' }}>
                last&nbsp;{time}
              </span>
            </div>
            <button
              className={`mc-refresh-btn ${spinning ? 'spin' : ''}`}
              onClick={() => { setSpinning(true); refresh(); setTimeout(() => setSpinning(false), 800) }}
            >
              ↻ refresh
            </button>
          </div>
        </div>
        <div className="mc-cockpit-meta">
          <span className="mc-cock-sub" style={{ color: 'var(--pt-neon)', textShadow: 'var(--pt-glow-sm)' }}>
            {appName} / {appTagline}
          </span>
          <span className="mc-cock-sub">// agents: {data?.crew?.length ?? '—'} — {isLive ? 'online' : 'offline'}</span>
          {data?.warnings?.length ? (
            <div className="mc-cockpit-warn">⚠ {data.warnings[0]}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ── Task Card + Column ───────────────────────────────── */

function TaskCard({ task }: { task: MissionTask }) {
  const tagKind = task.status === 'attention' ? 'alert' : task.status === 'done' ? 'done' : ''
  const tagLabel = statusLabel(task.status)
  return (
    <div className="mc-task">
      <div className="mc-task-head">
        <div className="mc-task-title">{task.title}</div>
        <span className={`mc-task-tag ${tagKind}`}>{tagLabel}</span>
      </div>
      <div className="mc-task-meta">
        <span className="agent">{task.ownerName}</span>
        <span>·</span>
        <span>{task.priority}</span>
      </div>
      <div className="mc-task-path">{task.source}</div>
    </div>
  )
}

function TaskColumn({ headLabel, count, headGlyph = '▶', alert = false, items, tag = 'ACTIVE', tagKind = '' }: {
  headLabel: string; count: number; headGlyph?: string; alert?: boolean
  items: MissionTask[]; tag?: string; tagKind?: string
}) {
  return (
    <div className="mc-window mc-tcol">
      <div className={`mc-tcol-head ${alert ? 'alert' : ''}`}>
        <span className="mc-tcol-glyph">{headGlyph}</span>
        <span>{headLabel}</span>
        <span className="mc-tcol-count">{count}</span>
      </div>
      <div className="mc-tcol-body">
        {items.map(t => <TaskCard key={t.id} task={t} />)}
      </div>
    </div>
  )
}

export function TaskBoard({ limit }: { limit?: number } = {}) {
  const { data } = useLiveData()
  const tasks = data?.tasks ?? []

  const buckets = useMemo(() => {
    const needs = tasks.filter(t => t.status === 'attention')
    const active = tasks.filter(t => t.status === 'active')
    const scheduled = tasks.filter(t => t.status === 'scheduled')
    const backlog = tasks.filter(t => t.status === 'backlog')
    const done = tasks.filter(t => t.status === 'done')
    return { needs, active, scheduled, backlog, done }
  }, [tasks])

  if (!data) return <SkeletonPanel label="loading tasks" />

  const sl = (arr: MissionTask[]) => limit ? arr.slice(0, limit) : arr

  return (
    <div className="mc-kanban">
      <TaskColumn headLabel="NEEDS ATTENTION" headGlyph="⚠" alert
        count={buckets.needs.length} items={sl(buckets.needs)} tag="ATTENTION" tagKind="alert" />
      <TaskColumn headLabel="ACTIVE" headGlyph="▶"
        count={buckets.active.length} items={sl(buckets.active)} tag="ACTIVE" />
      <TaskColumn headLabel="SCHEDULED" headGlyph="◷"
        count={buckets.scheduled.length} items={sl(buckets.scheduled)} tag="SCHEDULED" />
      <TaskColumn headLabel="BACKLOG" headGlyph="≡"
        count={buckets.backlog.length} items={sl(buckets.backlog)} tag="BACKLOG" />
      <TaskColumn headLabel="DONE" headGlyph="✓"
        count={buckets.done.length} items={sl(buckets.done)} tag="DONE" tagKind="done" />
    </div>
  )
}

/* ── Agent Office ─────────────────────────────────────── */

type WanderPos = { x: number; y: number; walking: boolean }

export function CrewOffice() {
  const { data, isLive } = useLiveData()
  const [wander, setWander] = useState<Record<string, WanderPos>>({})
  const [blipIdx, setBlipIdx] = useState(0)

  const crew = data?.crew ?? []

  // Map crew.id → active task title
  const agentTask = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of data?.tasks ?? []) {
      if ((t.status === 'active' || t.status === 'attention') && !map[t.owner]) {
        map[t.owner] = t.title
      }
    }
    return map
  }, [data?.tasks])

  const isWorking = (a: CrewMember) =>
    a.status === 'active' || a.status === 'on-demand' || !!agentTask[a.id]

  // Seed wander state from home positions on first load
  useEffect(() => {
    if (!crew.length) return
    setWander(prev => {
      if (Object.keys(prev).length >= crew.length) return prev
      const next = { ...prev }
      for (const a of crew) {
        if (next[a.id]) continue
        const home = CREW_POS[a.id] ?? { x: 50, y: 50 }
        next[a.id] = { x: home.x, y: home.y, walking: false }
      }
      return next
    })
  }, [crew.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Independent wander loop per agent — staggered so they don't all step at once
  useEffect(() => {
    if (!crew.length) return
    const WALK_MS = 980          // must be ≥ CSS transition duration
    const stopTimeouts: ReturnType<typeof setTimeout>[] = []

    const intervals = crew.map((a, i) => {
      const home = CREW_POS[a.id] ?? { x: 50, y: 50 }
      const period = 3000 + i * 650  // 3.0s, 3.65s, 4.3s …

      return setInterval(() => {
        const nx = Math.min(90, Math.max(5, home.x + (Math.random() - 0.5) * 34))
        const ny = Math.min(88, Math.max(5, home.y + (Math.random() - 0.5) * 26))
        setWander(prev => ({ ...prev, [a.id]: { ...prev[a.id], x: nx, y: ny, walking: true } }))
        stopTimeouts.push(
          setTimeout(() => setWander(prev => ({ ...prev, [a.id]: { ...prev[a.id], walking: false } })), WALK_MS)
        )
      }, period)
    })

    return () => {
      intervals.forEach(clearInterval)
      stopTimeouts.forEach(clearTimeout)
    }
  }, [crew.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Blip cycle (highlight one agent at a time)
  useEffect(() => {
    if (!crew.length) return
    const t = setInterval(() => setBlipIdx(x => (x + 1) % crew.length), 3200)
    return () => clearInterval(t)
  }, [crew.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <SkeletonPanel label="loading office" />

  const HUB = { x: 50, y: 50 }

  return (
    <div className="mc-window" style={{ flex: 1 }}>
      <div className="mc-window-head">
        <div className="mc-window-dots"><span /><span /><span /></div>
        <div className="mc-window-title">
          <span className="mc-win-tag">◈</span>
          <span>AGENT OFFICE</span>
        </div>
        <div className="mc-window-meta" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className={`mc-led ${isLive ? 'green' : ''}`} /> {isLive ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>
      <div style={{ padding: 14 }}>
        <div className="mc-office">
          <div className="mc-office-floor">
            <div className="mc-office-grid" />
            <div className="mc-office-radar" />
            <div className="mc-office-scan" />
            <div className="mc-office-vignette" />

            {/* Tether lines follow agents as they wander */}
            <svg className="mc-office-links" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(124,199,255,0.55)" />
                  <stop offset="100%" stopColor="rgba(255,16,240,0)" />
                </radialGradient>
              </defs>
              <circle cx={HUB.x} cy={HUB.y} r="14" fill="url(#hubGlow)" />
              {crew.map((a, i) => {
                const w = wander[a.id]
                const fallback = CREW_POS[a.id] ?? { x: 30 + (i * 15) % 60, y: 30 + (i * 20) % 50 }
                const pos = isWorking(a) ? fallback : (w ?? fallback)
                const tint = accentToTint(a.accent)
                return (
                  <line key={a.id}
                    x1={HUB.x} y1={HUB.y}
                    x2={pos.x} y2={pos.y}
                    className={`mc-link ${i === blipIdx ? 'is-hot' : ''}`}
                    style={{ stroke: tint.fr, animationDelay: `${i * 0.4}s` }}
                  />
                )
              })}
            </svg>

            {/* Desks */}
            <div className="mc-desk is-primary" style={{ left: '36%', top: '2%', width: '28%', height: '14%' }}>
              <span className="mc-desk-label">COMMAND · PRIMARY</span>
              <span className="mc-desk-corner tl" /><span className="mc-desk-corner tr" />
              <span className="mc-desk-corner bl" /><span className="mc-desk-corner br" />
            </div>
            <div className="mc-desk" style={{ left: '6%', top: '20%', width: '26%', height: '22%' }}>
              <span className="mc-desk-label">ECHO · MEMORY</span>
              <span className="mc-desk-corner tl" /><span className="mc-desk-corner tr" />
              <span className="mc-desk-corner bl" /><span className="mc-desk-corner br" />
            </div>
            <div className="mc-desk" style={{ right: '6%', top: '20%', width: '26%', height: '22%' }}>
              <span className="mc-desk-label">SAGE · LAB</span>
              <span className="mc-desk-corner tl" /><span className="mc-desk-corner tr" />
              <span className="mc-desk-corner bl" /><span className="mc-desk-corner br" />
            </div>
            <div className="mc-desk" style={{ left: '6%', bottom: '10%', width: '26%', height: '26%' }}>
              <span className="mc-desk-label">FORGE · BUILD</span>
              <span className="mc-desk-corner tl" /><span className="mc-desk-corner tr" />
              <span className="mc-desk-corner bl" /><span className="mc-desk-corner br" />
            </div>
            <div className="mc-desk" style={{ right: '6%', bottom: '10%', width: '26%', height: '26%' }}>
              <span className="mc-desk-label">SCOUT · RECON</span>
              <span className="mc-desk-corner tl" /><span className="mc-desk-corner tr" />
              <span className="mc-desk-corner bl" /><span className="mc-desk-corner br" />
            </div>

            {/* Hub */}
            <div className="mc-hub">
              <span className="mc-hub-ring r1" />
              <span className="mc-hub-ring r2" />
              <span className="mc-hub-ring r3" />
              <span className="mc-hub-core" />
              <span className="mc-hub-label">MISSION CTRL</span>
            </div>

            {/* Agent sprites — walk to random positions near their home desk */}
            {crew.map((a, i) => {
              const w = wander[a.id]
              const home = CREW_POS[a.id] ?? { x: 30 + (i * 15) % 60, y: 30 + (i * 20) % 50 }
              const working = isWorking(a)
              const cx = working ? home.x : (w?.x ?? home.x)
              const cy = working ? home.y : (w?.y ?? home.y)
              const walking = !working && (w?.walking ?? false)
              const tint = accentToTint(a.accent)
              return (
                <div key={a.id}
                  className={`mc-sprite${i === blipIdx ? ' is-active' : ''}${walking ? ' is-walking' : ''}${working ? ' is-working' : ''}`}
                  style={{
                    left: `calc(${cx}% - 18px)`,
                    top: `calc(${cy}% - 22px)`,
                    '--tint': tint.fr,
                    '--tint-glow': tint.glow,
                  } as React.CSSProperties}
                >
                  {working && agentTask[a.id] && (
                    <div className="mc-sprite-task">{agentTask[a.id]}</div>
                  )}
                  <span className="mc-sprite-pulse" />
                  <span className="mc-sprite-pulse delay" />
                  <AgentAvatar name={a.name} tint={tint} size={3} status={statusLabel(a.status)} />
                </div>
              )
            })}
          </div>

          <div className="mc-office-foot">
            <span className="mc-of-item"><span className={`mc-led ${isLive ? 'green' : ''}`} /> LIVE FEED</span>
            {crew.slice(0, 4).map(a => (
              <span key={a.id}>{a.name} — {statusLabel(a.status)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Agent Card Grid ──────────────────────────────────── */

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

/* ── Calendar / Scheduler ─────────────────────────────── */

export function CalendarList({ limit }: { limit?: number } = {}) {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading scheduler" />
  const crons = limit ? data.cron.slice(0, limit) : data.cron
  if (!crons.length) return <EmptyTerminal label="no cron jobs configured" />
  return (
    <>
      {crons.map(s => (
        <div key={s.id} className="mc-cal-card">
          <div className="mc-cal-card-head">
            <span className="mc-cal-card-name">{s.name}</span>
            <span className="mc-cal-card-tag">{s.cadence}</span>
          </div>
          <div className="mc-cron">
            <span className="cron-fields">{s.schedule}</span>
            {s.timezone && <span className="tz">[{s.timezone}]</span>}
          </div>
          {s.description && <div className="mc-cal-desc">{s.description}</div>}
          <div className="mc-cal-foot">
            {s.lastRunStatus && <span>last: {s.lastRunStatus}</span>}
            {s.nextRunAt && <span>next: {fmtDate(s.nextRunAt)}</span>}
          </div>
        </div>
      ))}
    </>
  )
}

/* ── Connect card — shown when an integration has no key/path yet ── */
export function ConnectCard({ name, hint }: { name: string; hint: string }) {
  return (
    <div className="mc-connect-card">
      <div className="mc-connect-title">◇ CONNECT {name.toUpperCase()}</div>
      <p>{hint}</p>
      <a href="/setup" className="mc-refresh-btn">🛠 OPEN SETUP</a>
    </div>
  )
}

export function CalendarPanel() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading calendar" />
  const events = data.calendar ?? []
  const gcal = data.integrations?.find(i => i.name === 'Google Calendar')
  if (!events.length && gcal?.status === 'missing') {
    return <ConnectCard name="Google Calendar" hint="Point Setup at a service-account credentials file to sync your next 7 days of events." />
  }
  if (!events.length) return <EmptyTerminal label="no upcoming events" />
  return (
    <Window tag="▦" title="UPCOMING EVENTS" meta={`${events.length} events`}>
      <div style={{ padding: 0 }}>
        {events.map(ev => (
          <div key={ev.id} className="mc-commit">
            <span className="sha">{fmtDate(ev.start)}</span>
            <div>
              <div className="msg">{ev.summary}</div>
            </div>
            <span className="when">{fmtDate(ev.end)}</span>
          </div>
        ))}
      </div>
    </Window>
  )
}

export function SchedulerView() {
  const { data } = useLiveData()
  const [filter, setFilter] = useState('all')

  if (!data) return <SkeletonPanel label="loading scheduler" />

  const crons = data.cron
  const filtered = filter === 'all' ? crons : crons.filter(s => s.cadence === filter)
  const dailyCount = crons.filter(c => c.cadence === 'daily').length
  const recurringCount = crons.filter(c => c.cadence === 'recurring').length
  const oneShotCount = crons.filter(c => c.cadence === 'one-shot').length

  return (
    <>
      <CommandHeader />
      <CalendarPanel />
      <div className="mc-cal-header">
        <div className="mc-cal-title">
          <span className="glyph">▦</span> Scheduler
        </div>
        <div className="mc-cal-counts">
          <span className="mc-pill">{dailyCount} DAILY</span>
          <span className="mc-pill">{recurringCount} RECURRING</span>
          <span className="mc-pill">{oneShotCount} ONE-SHOT</span>
        </div>
      </div>
      <div className="mc-cal-filters">
        {(['all', 'daily', 'recurring', 'one-shot'] as const).map(id => (
          <span key={id}
            className={`mc-radio ${filter === id ? 'is-active' : ''}`}
            onClick={() => setFilter(id)}>
            <span className="dot" /> {id}
          </span>
        ))}
      </div>
      <CalendarList />
    </>
  )
}

/* ── GitHub Panel ─────────────────────────────────────── */

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5', HTML: '#e34c26',
  CSS: '#563d7c', Swift: '#F05138', Shell: '#89e051', Rust: '#dea584', Go: '#00ADD8',
}

const EVENT_LABELS: Record<string, { label: string; glyph: string }> = {
  PushEvent: { label: 'push', glyph: '↑' },
  CreateEvent: { label: 'create', glyph: '＋' },
  DeleteEvent: { label: 'delete', glyph: '✕' },
  PullRequestEvent: { label: 'pull request', glyph: '⇄' },
  PullRequestReviewEvent: { label: 'pr review', glyph: '◎' },
  IssuesEvent: { label: 'issue', glyph: '◉' },
  IssueCommentEvent: { label: 'comment', glyph: '✎' },
  WatchEvent: { label: 'star', glyph: '★' },
  ForkEvent: { label: 'fork', glyph: '⑂' },
  ReleaseEvent: { label: 'release', glyph: '◆' },
  PublicEvent: { label: 'made public', glyph: '◇' },
}

function pushedAgo(iso?: string): string {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 60) return `${Math.max(1, min)}m ago`
  if (min < 60 * 24) return `${Math.round(min / 60)}h ago`
  if (min < 60 * 24 * 30) return `${Math.round(min / 1440)}d ago`
  return `${Math.round(min / 43200)}mo ago`
}

export function GithubPanel() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading github" />

  const gh = data.github
  if (!gh) return <EmptyTerminal label="no github data" />
  if (!gh.username) {
    return <ConnectCard name="GitHub" hint="Set your GitHub username in Setup (and authenticate the gh CLI) to light up the contributions heatmap and repo grid." />
  }

  const weeks = gh.weeks ?? []
  // Use GitHub's own quartile level so colors match the real profile graph;
  // fall back to a count cap only for legacy data without levels.
  const heatData = weeks.map(w => w.contributionDays.map(d => d.level ?? Math.min(4, d.contributionCount)))
  const total = gh.totalContributions ?? weeks.flatMap(w => w.contributionDays).reduce((a, d) => a + d.contributionCount, 0)
  const streak = gh.currentStreak ?? 0
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // Month labels derived from the actual rolling-year window (GitHub places a
  // label above the first column of each month).
  const monthLabels: { label: string; weekIndex: number }[] = []
  weeks.forEach((w, wi) => {
    const first = w.contributionDays[0]
    if (!first) return
    const m = new Date(first.date).getUTCMonth()
    const prev = monthLabels[monthLabels.length - 1]
    if ((!prev || MONTHS[m] !== prev.label) && wi < weeks.length - 1) {
      monthLabels.push({ label: MONTHS[m], weekIndex: wi })
    }
  })

  const repos = gh.repos ?? []
  const totalStars = repos.reduce((s, r) => s + r.stars, 0)
  const totalIssues = repos.reduce((s, r) => s + r.openIssues, 0)
  const totalPrs = repos.reduce((s, r) => s + (r.openPrs ?? 0), 0)
  // Contributions in the last 30 days from the calendar tail
  const last30 = weeks.flatMap(w => w.contributionDays).slice(-30)
  const month = last30.reduce((s, d) => s + d.contributionCount, 0)

  const heroStats = [
    { label: 'CONTRIBUTIONS · 1Y', value: total.toLocaleString() },
    { label: 'LAST 30 DAYS', value: month.toLocaleString() },
    { label: 'STREAK', value: `${streak}d` },
    { label: 'STARS', value: totalStars.toLocaleString() },
    { label: 'OPEN ISSUES', value: totalIssues.toLocaleString() },
    { label: 'OPEN PRS', value: totalPrs.toLocaleString() },
  ]

  return (
    <>
      <div className="mc-gh-stats">
        {heroStats.map(s => (
          <div key={s.label} className="mc-gh-stat">
            <div className="val">{s.value}</div>
            <div className="lbl">{s.label}</div>
          </div>
        ))}
        <a className="mc-gh-profile" href={`https://github.com/${gh.username}`} target="_blank" rel="noreferrer">
          @{gh.username} ↗
        </a>
      </div>

      {heatData.length > 0 && (
        <Window tag="▦" title="GITHUB · CONTRIBUTIONS"
          meta={<>
            <span className="mc-gh-live"><span className="mc-led green" /> LIVE{gh.syncedAt ? ` · synced ${fmtDate(gh.syncedAt)}` : ''}</span>
            <span style={{ color: 'var(--pt-neon-bright)', textShadow: 'var(--pt-glow-sm)' }}> · {total} in the last year · {streak}-day streak{gh.streakNote ? ` (${gh.streakNote})` : ''}</span>
          </>}>
          <div className="mc-gh-heatmap-wrap">
            <div className="mc-gh-day-labels">
              <span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span />
            </div>
            <div className="mc-gh-heatmap-inner">
              <div className="mc-gh-month-labels">
                {monthLabels.map((m, i) => (
                  <span key={i} style={{ left: `calc(${(m.weekIndex / weeks.length) * 100}%)` }}>{m.label}</span>
                ))}
              </div>
              <Heatmap data={heatData} />
            </div>
          </div>
          <div className="mc-heatmap-legend">
            <span>LESS</span>
            <span className="scale">
              <span className="lvl-0" /><span className="lvl-1" /><span className="lvl-2" /><span className="lvl-3" /><span className="lvl-4" />
            </span>
            <span>MORE</span>
            <span style={{ marginLeft: 'auto' }}>WINDOW · 365D</span>
          </div>
        </Window>
      )}

      <SectionHead label={`GITHUB / REPOSITORIES · ${repos.length} MOST RECENT`} />
      <div className="mc-repo-grid">
        {repos.map(repo => (
          <a key={repo.name} className="mc-repo-card" href={repo.url} target="_blank" rel="noreferrer">
            <div className="mc-repo-head">
              <span className="mc-repo-name">{repo.name}</span>
              {repo.private && <span className="mc-repo-private">PRIVATE</span>}
            </div>
            {repo.description && <div className="mc-repo-desc">{repo.description}</div>}
            <div className="mc-repo-meta">
              {repo.language && (
                <span className="mc-repo-lang">
                  <span className="dot" style={{ background: LANG_COLORS[repo.language] ?? '#8b949e' }} />
                  {repo.language}
                </span>
              )}
              {repo.stars > 0 && <span>★ {repo.stars}</span>}
              {repo.openIssues > 0 && <span>◉ {repo.openIssues}</span>}
              {(repo.openPrs ?? 0) > 0 && <span>⇄ {repo.openPrs}</span>}
              <span className="when">{pushedAgo(repo.pushedAt)}</span>
            </div>
          </a>
        ))}
      </div>

      <SectionHead label="GITHUB / RECENT ACTIVITY" />
      <Window tag="◉" title="RECENT EVENTS">
        <div>
          {(gh.recentEvents ?? []).slice(0, 10).map((ev, i) => {
            const pretty = EVENT_LABELS[ev.type] ?? { label: ev.type.replace(/Event$/, '').toLowerCase(), glyph: '·' }
            return (
              <div key={ev.key || i} className="mc-commit">
                <span className="sha">{pretty.glyph} {pretty.label}</span>
                <div>
                  <div className="repo">{ev.repo}</div>
                </div>
                <span className="when">{fmtDate(ev.createdAt)}</span>
              </div>
            )
          })}
        </div>
      </Window>
    </>
  )
}

/* ── Costs Panel ──────────────────────────────────────── */

const CLAUDE_COLORS: Record<string, string> = {
  'claude-opus': '#b58dff',
  'claude-sonnet': '#ff10f0',
  'claude-haiku': '#5eead4',
}

const PROVIDER_COLORS: Record<string, string> = {
  'ollama': '#a3e635',
  'openrouter': '#ff10f0',
  'openai-codex': '#ff8c69',
  'openclaw': '#ffb84d',
  'together': '#ff6bd6',
  'claude': '#b58dff',
}

const MODEL_COLORS = ['#ff10f0', '#5eead4', '#b58dff', '#ffb84d', '#a3e635', '#ff6bd6', '#ff8c69', '#c4b5fd']

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function claudeModelColor(model: string): string {
  for (const [key, color] of Object.entries(CLAUDE_COLORS)) {
    if (model.includes(key)) return color
  }
  return '#c4b5fd'
}

function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8,}$/, '').replace(/-20\d+$/, '')
}

function providerColor(provider: string): string {
  for (const [key, color] of Object.entries(PROVIDER_COLORS)) {
    if (provider.toLowerCase().includes(key)) return color
  }
  return '#c4b5fd'
}

function shortProvider(provider: string): string {
  return provider.replace(/^openrouter$/, 'OR').replace(/^openai-codex$/, 'OpenAI').replace(/^ollama$/, 'Ollama').replace(/^openclaw$/, 'OClaw')
}

/* ── Interactive Treemap ── */
function TokenTreemap({ models, height = 160 }: { models: ModelUsage[], height?: number }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const sorted = [...models].filter(m => m.totalTokens > 0).sort((a, b) => b.totalTokens - a.totalTokens)
  const total = sorted.reduce((s, m) => s + m.totalTokens, 0)
  if (!total) return null

  // Simple squarified treemap — single row layout
  const rects: { m: ModelUsage, x: number, w: number, color: string }[] = []
  let x = 0
  for (const m of sorted) {
    const w = (m.totalTokens / total) * 100
    rects.push({ m, x, w, color: providerColor(m.provider) })
    x += w
  }

  return (
    <div style={{ position: 'relative', height, overflow: 'hidden', borderRadius: 4, cursor: 'crosshair' }}>
      <div style={{ display: 'flex', height: '100%', gap: 1 }}>
        {rects.map(({ m, w, color }) => {
          const isHovered = hovered === m.model
          const label = m.model.split('/').pop() ?? m.model
          return (
            <div
              key={m.model}
              onMouseEnter={() => setHovered(m.model)}
              onMouseLeave={() => setHovered(null)}
              style={{
                flex: `0 0 ${w}%`,
                minWidth: w > 1 ? 2 : 1,
                background: `linear-gradient(135deg, ${color}${isHovered ? 'dd' : '44'}, ${color}${isHovered ? 'bb' : '22'})`,
                border: `1px solid ${color}${isHovered ? '99' : '33'}`,
                borderRadius: 2,
                transition: 'all 0.2s ease',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', padding: 4,
                boxShadow: isHovered ? `0 0 16px ${color}66, inset 0 0 20px ${color}22` : 'none',
                transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                zIndex: isHovered ? 2 : 1,
                position: 'relative',
              }}
            >
              {w > 6 && (
                <>
                  <div style={{ fontSize: w > 12 ? 10 : 8, color: '#fff', fontWeight: 600, letterSpacing: '0.06em', textShadow: `0 0 6px ${color}`, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-all' }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 8, color: `${color}`, letterSpacing: '0.1em', marginTop: 2 }}>
                    {fmtTokens(m.totalTokens)}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
      {/* Hover tooltip */}
      {hovered && (() => {
        const m = sorted.find(m => m.model === hovered)
        if (!m) return null
        const pct = ((m.totalTokens / total) * 100).toFixed(1)
        return (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            background: 'rgba(3,8,20,0.95)', border: '1px solid var(--pt-border)',
            padding: '8px 12px', borderRadius: 6, fontSize: 10,
            backdropFilter: 'blur(8px)', zIndex: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            pointerEvents: 'none', maxWidth: 220,
          }}>
            <div style={{ color: providerColor(m.provider), fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>
              {m.model.split('/').pop()}
            </div>
            <div style={{ color: 'var(--pt-text-dim)', lineHeight: 1.6 }}>
              <span style={{ color: 'var(--pt-text-mute)' }}>provider</span> {shortProvider(m.provider)}<br/>
              <span style={{ color: 'var(--pt-text-mute)' }}>tokens</span> {fmtTokens(m.totalTokens)} ({pct}%)<br/>
              <span style={{ color: 'var(--pt-text-mute)' }}>requests</span> {m.requests.toLocaleString()}<br/>
              {m.estimatedCostUsd > 0 && <><span style={{ color: 'var(--pt-text-mute)' }}>cost</span> {money(m.estimatedCostUsd)}<br/></>}
              {m.estimatedCostUsd === 0 && <span style={{ color: '#a3e635', fontSize: 9 }}>FREE / LOCAL</span>}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

/* ── Provider breakdown pie with interactive hover ── */
function ProviderRing({ models }: { models: ModelUsage[] }) {
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const byProvider: Record<string, { tokens: number, requests: number, cost: number, models: number }> = {}
  for (const m of models) {
    const p = m.provider || 'unknown'
    if (!byProvider[p]) byProvider[p] = { tokens: 0, requests: 0, cost: 0, models: 0 }
    byProvider[p].tokens += m.totalTokens
    byProvider[p].requests += m.requests
    byProvider[p].cost += m.estimatedCostUsd
    byProvider[p].models++
  }

  const providers = Object.entries(byProvider)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.tokens - a.tokens)

  const totalTokens = providers.reduce((s, p) => s + p.tokens, 0)
  const size = 120
  const R = 44
  const C = 2 * Math.PI * R

  let offset = 0
  const arcs = providers.map(p => {
    const pct = (p.tokens / totalTokens) * 100
    const color = providerColor(p.name)
    const arc = { ...p, pct, color, offset }
    offset += pct
    return arc
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
          {arcs.map(a => {
            const isActive = activeProvider === a.name
            return (
              <circle key={a.name} cx={size / 2} cy={size / 2} r={R}
                fill="none" strokeWidth={isActive ? 14 : 10}
                stroke={a.color} strokeOpacity={isActive ? 1 : 0.7}
                strokeDasharray={`${(a.pct / 100) * C} ${C}`}
                strokeDashoffset={-(a.offset / 100) * C}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: 'all 0.2s ease', cursor: 'pointer', filter: isActive ? `drop-shadow(0 0 6px ${a.color})` : 'none' }}
                onMouseEnter={() => setActiveProvider(a.name)}
                onMouseLeave={() => setActiveProvider(null)}
              />
            )
          })}
          <text x={size / 2} y={size / 2 - 4} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--pt-text-high)', fontWeight: 700 }}>
            {fmtTokens(totalTokens)}
          </text>
          <text x={size / 2} y={size / 2 + 9} textAnchor="middle" style={{ fontSize: 7, fill: 'var(--pt-text-mute)', letterSpacing: '0.18em' }}>
            TOKENS
          </text>
        </svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 140 }}>
        {arcs.map(a => (
          <div key={a.name}
            onMouseEnter={() => setActiveProvider(a.name)}
            onMouseLeave={() => setActiveProvider(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '4px 8px', borderRadius: 4,
              background: activeProvider === a.name ? `${a.color}15` : 'transparent',
              transition: 'background 0.15s',
            }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: a.color, display: 'inline-block', boxShadow: `0 0 6px ${a.color}66`, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: activeProvider === a.name ? a.color : 'var(--pt-text)', letterSpacing: '0.06em', flex: 1, fontWeight: activeProvider === a.name ? 600 : 400, transition: 'color 0.15s' }}>
              {shortProvider(a.name)}
            </span>
            <span style={{ fontSize: 9, color: 'var(--pt-text-mute)', fontFamily: 'var(--font-mono)' }}>
              {fmtTokens(a.tokens)}
            </span>
            <span style={{ fontSize: 8, color: 'var(--pt-text-mute)', width: 36, textAlign: 'right' }}>
              {a.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Daily activity heatstrip (all providers) ── */
function DailyHeatstrip({ daily }: { daily: CostDashboard['daily'] }) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null)
  if (!daily?.length) return null

  const maxTokens = Math.max(...daily.map(d => d.tokens), 1)

  return (
    <div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 64 }}>
        {daily.map((d, i) => {
          const h = Math.max(4, (d.tokens / maxTokens) * 56)
          const isHovered = hoveredDay === i
          // Color by dominant model's provider
          const topModel = Object.entries(d.byModel ?? {}).sort((a, b) => {
            const aTokens = typeof a[1] === 'object' ? (a[1] as { tokens?: number }).tokens ?? 0 : 0
            const bTokens = typeof b[1] === 'object' ? (b[1] as { tokens?: number }).tokens ?? 0 : 0
            return bTokens - aTokens
          })[0]
          const dominantColor = topModel ? providerColor(topModel[0]) : '#ff10f0'
          return (
            <div key={i}
              onMouseEnter={() => setHoveredDay(i)}
              onMouseLeave={() => setHoveredDay(null)}
              style={{
                flex: 1, minWidth: 3, height: h,
                background: `linear-gradient(to top, ${dominantColor}${isHovered ? 'cc' : '55'}, ${dominantColor}${isHovered ? '88' : '22'})`,
                borderRadius: '2px 2px 0 0',
                transition: 'all 0.15s ease',
                boxShadow: isHovered ? `0 0 8px ${dominantColor}66` : 'none',
                cursor: 'crosshair',
                position: 'relative',
              }}
            />
          )
        })}
      </div>
      {/* Date labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 7, color: 'var(--pt-text-mute)', letterSpacing: '0.1em' }}>{daily[0]?.date?.slice(5)}</span>
        <span style={{ fontSize: 7, color: 'var(--pt-text-mute)', letterSpacing: '0.1em' }}>{daily[daily.length - 1]?.date?.slice(5)}</span>
      </div>
      {/* Hover info */}
      {hoveredDay !== null && daily[hoveredDay] && (
        <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--pt-surface-2)', borderRadius: 4, fontSize: 9, color: 'var(--pt-text-dim)' }}>
          <span style={{ color: 'var(--pt-text-high)', fontWeight: 600 }}>{daily[hoveredDay].date}</span>
          {' — '}
          <span>{fmtTokens(daily[hoveredDay].tokens)} tokens</span>
          {' · '}
          <span>{daily[hoveredDay].requests} reqs</span>
          {daily[hoveredDay].cost > 0 && <>{' · '}<span style={{ color: '#ffb84d' }}>{money(daily[hoveredDay].cost)}</span></>}
        </div>
      )}
    </div>
  )
}

/* ── Ranked model leaderboard (monthly) ── */
function ModelLeaderboard({ rows, color, emptyLabel = 'no usage in the last 30 days' }: {
  rows: { name: string; tokens: number; cost?: number; requests?: number }[]
  color: string
  emptyLabel?: string
}) {
  const sorted = [...rows].filter(r => r.tokens > 0).sort((a, b) => b.tokens - a.tokens).slice(0, 10)
  if (!sorted.length) {
    return <div style={{ padding: '14px', fontSize: 10, color: 'var(--pt-text-mute)', letterSpacing: '0.16em' }}>— {emptyLabel} —</div>
  }
  const max = sorted[0].tokens
  const totalTokens = sorted.reduce((s, r) => s + r.tokens, 0)
  const RANK_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32']
  return (
    <div style={{ padding: '6px 14px 10px' }}>
      {sorted.map((r, i) => {
        const rankColor = RANK_COLORS[i] ?? 'var(--pt-text-mute)'
        const pct = totalTokens ? ((r.tokens / totalTokens) * 100).toFixed(1) : '0'
        return (
          <div key={r.name} style={{ padding: '7px 0', borderBottom: i < sorted.length - 1 ? '1px dashed var(--pt-border-dim)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, width: 22, flexShrink: 0,
                color: rankColor, textShadow: i < 3 ? `0 0 6px ${rankColor}66` : 'none',
              }}>#{i + 1}</span>
              <span style={{ fontSize: 11, color: i === 0 ? color : 'var(--pt-text-high)', fontFamily: 'var(--font-mono)', fontWeight: i === 0 ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: i === 0 ? `0 0 8px ${color}55` : 'none' }}>
                {r.name}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color, fontFamily: 'var(--font-mono)', fontWeight: 600, flexShrink: 0 }}>
                {fmtTokens(r.tokens)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 30 }}>
              <div style={{ flex: 1, height: 5, background: 'rgba(3,8,20,0.8)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--pt-border-dim)' }}>
                <div style={{ width: `${(r.tokens / max) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${color}44, ${color})`, boxShadow: `0 0 6px ${color}55`, transition: 'width 0.5s ease' }} />
              </div>
              <span style={{ fontSize: 8, color: 'var(--pt-text-mute)', width: 80, textAlign: 'right', letterSpacing: '0.06em', flexShrink: 0 }}>
                {pct}%{typeof r.requests === 'number' && r.requests > 0 ? ` · ${r.requests} req` : ''}{typeof r.cost === 'number' && r.cost > 0 ? ` · ${money(r.cost)}` : ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── 30-day burn hero — stacked daily bars: api / claude code / local ── */
function MonthlyBurnHero({ costs }: { costs: CostDashboard }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const cu = costs.claudeUsage
  const or = costs.openRouterLive
  const providerOf = (model: string) =>
    (costs.models ?? []).find(m => m.model === model)?.provider ?? 'unknown'

  // Merge agent-session days and claude-code days into one 30-day series,
  // split into local (ollama) / api (everything else) / claude code.
  const byDate = new Map<string, { local: number; api: number; claude: number }>()
  for (const d of costs.daily ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
    const slot = byDate.get(d.date) ?? { local: 0, api: 0, claude: 0 }
    for (const [model, v] of Object.entries(d.byModel ?? {})) {
      const tokens = typeof v === 'object' ? (v as { tokens?: number }).tokens ?? 0 : 0
      if (providerOf(model) === 'ollama') slot.local += tokens
      else slot.api += tokens
    }
    byDate.set(d.date, slot)
  }
  for (const d of cu?.daily ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
    const slot = byDate.get(d.date) ?? { local: 0, api: 0, claude: 0 }
    slot.claude += d.tokens
    byDate.set(d.date, slot)
  }
  const days = [...byDate.entries()]
    .map(([date, v]) => ({ date, ...v, total: v.local + v.api + v.claude }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)

  const totalMonth = days.reduce((s, d) => s + d.total, 0)
  const claudeMonth = days.reduce((s, d) => s + d.claude, 0)
  const localMonth = days.reduce((s, d) => s + d.local, 0)
  const apiMonth = days.reduce((s, d) => s + d.api, 0)
  const maxDay = Math.max(...days.map(d => d.total), 1)

  const SEG = [
    { key: 'api' as const, label: 'API', color: '#ff10f0' },
    { key: 'claude' as const, label: 'CLAUDE CODE', color: '#b58dff' },
    { key: 'local' as const, label: 'LOCAL', color: '#a3e635' },
  ]

  return (
    <Window tag="◎" title="TOKEN BURN · LAST 30 DAYS"
      meta={or ? `openrouter billed ${money(or.usageMonthly)} this month` : undefined}>
      <div style={{ padding: '14px 16px 6px', display: 'flex', gap: 26, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 700, color: 'var(--pt-neon-bright)', fontFamily: 'var(--font-mono)', lineHeight: 1, textShadow: 'var(--pt-glow-text)' }}>
            {fmtTokens(totalMonth)}
          </div>
          <div style={{ fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.2em', marginTop: 5 }}>TOKENS BURNED · 30D</div>
        </div>
        {[
          { label: 'API', value: fmtTokens(apiMonth), color: '#ff10f0' },
          { label: 'CLAUDE CODE', value: fmtTokens(claudeMonth), color: '#b58dff' },
          { label: 'LOCAL · FREE', value: fmtTokens(localMonth), color: '#a3e635' },
          ...(or ? [{ label: 'OPENROUTER $/MO', value: money(or.usageMonthly), color: '#ffb84d' }] : []),
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: 17, fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 7, color: 'var(--pt-text-mute)', letterSpacing: '0.18em', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '10px 16px 4px' }}>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 86 }}>
          {days.map((d, i) => {
            const isHovered = hovered === i
            return (
              <div key={d.date}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                style={{ flex: 1, minWidth: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'crosshair', opacity: hovered === null || isHovered ? 1 : 0.45, transition: 'opacity 0.15s' }}>
                {SEG.map(seg => {
                  const h = (d[seg.key] / maxDay) * 82
                  return h > 0 ? (
                    <div key={seg.key} style={{
                      height: Math.max(1.5, h),
                      background: `linear-gradient(to top, ${seg.color}${isHovered ? 'ee' : '88'}, ${seg.color}${isHovered ? 'aa' : '44'})`,
                      boxShadow: isHovered ? `0 0 6px ${seg.color}66` : 'none',
                    }} />
                  ) : null
                })}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 7, color: 'var(--pt-text-mute)', letterSpacing: '0.1em' }}>
          <span>{days[0]?.date.slice(5)}</span>
          {hovered !== null && days[hovered] && (
            <span style={{ color: 'var(--pt-text-high)' }}>
              {days[hovered].date} · {fmtTokens(days[hovered].total)}
              {days[hovered].api > 0 && ` · api ${fmtTokens(days[hovered].api)}`}
              {days[hovered].claude > 0 && ` · claude ${fmtTokens(days[hovered].claude)}`}
              {days[hovered].local > 0 && ` · local ${fmtTokens(days[hovered].local)}`}
            </span>
          )}
          <span>{days[days.length - 1]?.date.slice(5)}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, padding: '8px 0 10px' }}>
          {SEG.map(seg => (
            <span key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.14em' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, boxShadow: `0 0 5px ${seg.color}88` }} />
              {seg.label}
            </span>
          ))}
        </div>
      </div>
    </Window>
  )
}

export function CostsPanel({ initialCosts }: { initialCosts?: CostDashboard } = {}) {
  const { data } = useLiveData()
  const costs = data?.costs ?? initialCosts
  const [overviewTab, setOverviewTab] = useState<'treemap' | 'providers' | 'timeline'>('treemap')
  if (!costs) return <SkeletonPanel label="loading costs" />

  const or = costs.openRouterLive
  const cu = costs.claudeUsage
  const allModels = costs.models ?? []

  // Separate by provider type
  const ollamaModels = allModels.filter(m => m.provider === 'ollama')
  const paidModels = allModels.filter(m => m.estimatedCostUsd > 0)
  const maxCost = Math.max(...paidModels.map(m => m.estimatedCostUsd), 1)

  // Ollama totals
  const ollamaTotalTokens = ollamaModels.reduce((s, m) => s + m.totalTokens, 0)
  const ollamaTotalRequests = ollamaModels.reduce((s, m) => s + m.requests, 0)

  // ── Monthly (last 30 days) per-model aggregates from the daily series ──
  const providerOf = (model: string) => allModels.find(m => m.model === model)?.provider ?? 'unknown'
  const monthlyByModel = new Map<string, { tokens: number; cost: number }>()
  for (const d of costs.daily ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
    for (const [model, v] of Object.entries(d.byModel ?? {})) {
      const tokens = typeof v === 'object' ? (v as { tokens?: number }).tokens ?? 0 : 0
      const cost = typeof v === 'object' ? (v as { cost?: number }).cost ?? 0 : 0
      const cur = monthlyByModel.get(model) ?? { tokens: 0, cost: 0 }
      cur.tokens += tokens; cur.cost += cost
      monthlyByModel.set(model, cur)
    }
  }
  const requestsOf = (model: string) => allModels.find(m => m.model === model)?.requests
  const orMonthlyRows = [...monthlyByModel.entries()]
    .filter(([model]) => /openrouter/i.test(`${providerOf(model)} ${model}`))
    .map(([model, v]) => ({ name: model.split('/').slice(-2).join('/'), tokens: v.tokens, cost: v.cost, requests: requestsOf(model) }))
  const ollamaMonthlyRows = [...monthlyByModel.entries()]
    .filter(([model]) => providerOf(model) === 'ollama')
    .map(([model, v]) => ({ name: model, tokens: v.tokens, requests: requestsOf(model) }))
  const orMonthlyTokens = orMonthlyRows.reduce((s, r) => s + r.tokens, 0)
  const ollamaMonthlyTokens = ollamaMonthlyRows.reduce((s, r) => s + r.tokens, 0)

  const claudeMonthlyByModel = new Map<string, number>()
  for (const d of cu?.daily ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
    for (const [model, tokens] of Object.entries(d.byModel ?? {})) {
      claudeMonthlyByModel.set(model, (claudeMonthlyByModel.get(model) ?? 0) + Number(tokens))
    }
  }
  const claudeMonthlyRows = [...claudeMonthlyByModel.entries()]
    .map(([model, tokens]) => ({ name: shortModel(model), tokens }))
  const claudeMonthlyTokens = claudeMonthlyRows.reduce((s, r) => s + r.tokens, 0)

  // Claude daily token chart
  const cuDaily = cu?.daily ?? []
  const cuTopModels = (cu?.models ?? []).slice(0, 4)
  const cuStackedDaily = cuDaily.map(d => ({
    label: d.date.slice(5),
    segments: cuTopModels.map(m => ({
      key: m.model,
      value: d.byModel?.[m.model] ?? 0,
      color: claudeModelColor(m.model),
    })),
  }))

  return (
    <>
      {/* ── 30-DAY BURN HERO ── */}
      <MonthlyBurnHero costs={costs} />

      {/* ── ALL MODELS OVERVIEW ── */}
      {allModels.length > 0 && (
        <>
          <SectionHead label="ALL MODELS · OVERVIEW" />
          <Window tag="◈" title="MODEL UNIVERSE" meta={`${allModels.length} models · ${allModels.filter(m => m.totalTokens > 0).length} active`}>
            <div style={{ padding: '10px 14px 6px' }}>
              {/* Tab switcher */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                {([['treemap', 'TREEMAP'], ['providers', 'BY PROVIDER'], ['timeline', 'TIMELINE']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setOverviewTab(key)}
                    style={{
                      padding: '5px 12px', fontSize: 9, letterSpacing: '0.14em',
                      background: overviewTab === key ? 'rgba(255,16,240,0.15)' : 'transparent',
                      border: `1px solid ${overviewTab === key ? 'rgba(255,16,240,0.4)' : 'var(--pt-border-dim)'}`,
                      borderRadius: 4, color: overviewTab === key ? '#ff10f0' : 'var(--pt-text-mute)',
                      cursor: 'pointer', transition: 'all 0.15s',
                      fontFamily: 'var(--pt-font-mono)',
                    }}>
                    {label}
                  </button>
                ))}
              </div>

              {overviewTab === 'treemap' && <TokenTreemap models={allModels} height={170} />}
              {overviewTab === 'providers' && <ProviderRing models={allModels} />}
              {overviewTab === 'timeline' && <DailyHeatstrip daily={costs.daily} />}
            </div>

            {/* Quick stats row */}
            <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--pt-border)' }}>
              {[
                { label: 'TOTAL TOKENS', value: fmtTokens(costs.totalTokens), color: '#ff10f0' },
                { label: 'REQUESTS', value: costs.totalRequests.toLocaleString(), color: '#5eead4' },
                { label: 'TOTAL COST', value: money(costs.estimatedCostUsd), color: '#ffb84d' },
                { label: 'LOCAL (FREE)', value: fmtTokens(ollamaTotalTokens), color: '#a3e635' },
              ].map((stat, i) => (
                <div key={i} style={{
                  flex: 1, padding: '10px 12px', textAlign: 'center',
                  borderRight: i < 3 ? '1px solid var(--pt-border)' : 'none',
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: stat.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 7, color: 'var(--pt-text-mute)', letterSpacing: '0.16em', marginTop: 4 }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </Window>
        </>
      )}

      {/* ── OpenRouter: monthly billing + model leaderboard ── */}
      {(or || orMonthlyRows.length > 0) && (
        <>
          <SectionHead label="OPENROUTER · MONTHLY" />
          {or && (
            <Window tag="⬡" title="OPENROUTER · LIVE BILLING"
              meta={or.limit != null ? `${Math.round((or.usageMonthly / or.limit) * 100)}% of $${or.limit} limit` : 'no limit'}>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: '#ff10f0', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                      {money(or.usageMonthly)}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--pt-text-mute)', letterSpacing: '0.18em', marginTop: 3 }}>THIS MONTH</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#5eead4', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                      {fmtTokens(orMonthlyTokens)}
                    </div>
                    <div style={{ fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.16em', marginTop: 4 }}>TOKENS · 30D</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontSize: 11, color: 'var(--pt-text-dim)', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--pt-text-mute)', fontSize: 9, letterSpacing: '0.12em' }}>WEEK</span>
                      {' '}{money(or.usageWeekly)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--pt-text-dim)', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--pt-text-mute)', fontSize: 9, letterSpacing: '0.12em' }}>TODAY</span>
                      {' '}{money(or.usageDaily)}
                    </div>
                  </div>
                  {or.limitRemaining != null && (
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div style={{ fontSize: 13, color: '#a3e635', fontFamily: 'var(--font-mono)' }}>{money(or.limitRemaining)}</div>
                      <div style={{ fontSize: 9, color: 'var(--pt-text-mute)', letterSpacing: '0.12em' }}>REMAINING</div>
                    </div>
                  )}
                </div>
                {or.limit != null && (() => {
                  const pct = Math.min(100, (or.usageMonthly / or.limit) * 100)
                  const barColor = pct > 85 ? '#ff6b6b' : pct > 60 ? '#ffb84d' : '#ff10f0'
                  return (
                    <div>
                      <div style={{ height: 8, background: 'var(--pt-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          width: `${pct}%`, height: '100%',
                          background: `linear-gradient(90deg, ${barColor}88, ${barColor})`,
                          boxShadow: `0 0 10px ${barColor}`,
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.1em' }}>
                        <span>$0</span>
                        <span style={{ color: barColor }}>{pct.toFixed(1)}% used</span>
                        <span>{money(or.limit)}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </Window>
          )}
          <Window tag="◆" title="OPENROUTER · MODEL LEADERBOARD — 30D"
            meta={`${fmtTokens(orMonthlyTokens)} tokens`}>
            <ModelLeaderboard rows={orMonthlyRows} color="#ff10f0"
              emptyLabel="no openrouter usage logged in the last 30 days" />
          </Window>
        </>
      )}

      {/* ── Claude Code: monthly leaderboard + trend ── */}
      {cu && cu.totalTokens > 0 && (
        <>
          <SectionHead label="CLAUDE CODE · MONTHLY" />
          <Window tag="◆" title="CLAUDE CODE · MODEL LEADERBOARD — 30D"
            meta={`${fmtTokens(claudeMonthlyTokens)} tokens · 30d (${fmtTokens(cu.totalTokens)} all-time)`}>
            <ModelLeaderboard rows={claudeMonthlyRows} color="#b58dff"
              emptyLabel="no claude code usage in the last 30 days" />
          </Window>

          {cuStackedDaily.length > 1 && (
            <Window tag="▦" title="CLAUDE · DAILY TOKEN TREND" meta={`${cuStackedDaily.length}d`}>
              <div style={{ padding: '8px 14px 12px' }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                  {cuTopModels.map(m => (
                    <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, background: claudeModelColor(m.model), borderRadius: 1, display: 'inline-block', boxShadow: `0 0 4px ${claudeModelColor(m.model)}` }} />
                      <span style={{ fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.12em' }}>{shortModel(m.model)}</span>
                    </div>
                  ))}
                </div>
                <StackedBarChart data={cuStackedDaily} h={90} />
              </div>
            </Window>
          )}
        </>
      )}

      {/* ── Ollama: local inference leaderboard ── */}
      {ollamaModels.length > 0 && (
        <>
          <SectionHead label="OLLAMA · LOCAL INFERENCE" />
          <Window tag="◆" title="OLLAMA · MODEL LEADERBOARD — 30D"
            meta={`${ollamaTotalRequests.toLocaleString()} reqs all-time · $0.00`}>
            <div style={{ padding: '12px 14px 0', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#a3e635', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                  {fmtTokens(ollamaMonthlyTokens)}
                </div>
                <div style={{ fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.16em', marginTop: 3 }}>TOKENS · 30D</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#a3e635', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                  {fmtTokens(ollamaTotalTokens)}
                </div>
                <div style={{ fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.16em', marginTop: 3 }}>ALL-TIME</div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#a3e635', fontFamily: 'var(--font-mono)' }}>
                  {money(ollamaTotalTokens * 0.0000005)}
                </div>
                <div style={{ fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.12em', marginTop: 2 }}>EST. SAVED vs API</div>
              </div>
            </div>
            <ModelLeaderboard rows={ollamaMonthlyRows} color="#a3e635"
              emptyLabel="no local inference in the last 30 days" />
          </Window>
        </>
      )}

      {/* ── Paid API models burn (all-time logs) ── */}
      {paidModels.length > 0 && (
        <Window tag="$" title={`BURN BY MODEL — ${new Date().toLocaleString('en', { month: 'short' }).toUpperCase()}`}
          meta={`total ${money(costs.estimatedCostUsd)}`}>
          <div className="mc-cost-rows">
            {paidModels.map(m => (
              <div key={m.model} className="mc-cost-row">
                <div className="mc-cost-name">{m.model.split('/').pop()}</div>
                <div className="mc-cost-bar"><span style={{ width: `${(m.estimatedCostUsd / maxCost) * 100}%` }} /></div>
                <div className="mc-cost-val">{money(m.estimatedCostUsd)}</div>
              </div>
            ))}
          </div>
          {costs.warnings?.map((w, i) => (
            <div key={i} style={{ padding: '6px 14px', fontSize: 9, color: '#ffb84d', letterSpacing: '0.14em', borderTop: '1px solid var(--pt-border)' }}>
              ⚠ {w}
            </div>
          ))}
        </Window>
      )}

      {!or && !cu && paidModels.length === 0 && ollamaModels.length === 0 && (
        <EmptyTerminal label="no billing data — set OPENROUTER_API_KEY in .env" />
      )}
    </>
  )
}

/* ── Ideas Panel ──────────────────────────────────────── */

export function IdeasPanel() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading ideas" />
  const ideas = data.ideas ?? []
  if (!ideas.length) return <EmptyTerminal label="no ideas yet" />
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
      {ideas.map((idea, i) => (
        <Window key={i} tag="◇" title={`IDEA · ${String(i + 1).padStart(2, '0')}`}>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--pt-text-high)', marginBottom: 6 }}>{idea.title}</div>
            {idea.description && <div style={{ fontSize: 11, color: 'var(--pt-text-dim)', lineHeight: 1.65 }}>{idea.description}</div>}
            <div style={{ fontSize: 9, color: 'var(--pt-text-mute)', marginTop: 8, letterSpacing: '0.14em' }}>
              {idea.source} · {idea.status}
            </div>
          </div>
        </Window>
      ))}
    </div>
  )
}

/* ── Operations Panel ─────────────────────────────────── */

const TONE_LED: Record<string, string> = { green: 'green', amber: 'amber', red: 'amber', blue: '', slate: '' }

export function OperationsPanel() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading operations" />
  const ops = data.operations
  if (!ops) return <EmptyTerminal label="no operations data" />

  return (
    <>
      {/* Hotspot badges */}
      {ops.hotspots?.length > 0 && (
        <Window tag="◉" title="HOTSPOTS" meta={`${ops.hotspots.length} areas`}>
          <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {ops.hotspots.map(h => (
              <div key={h.label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--pt-surface-2)', borderRadius: 3, fontSize: 10, letterSpacing: '0.12em' }}>
                <span className={`mc-led ${TONE_LED[h.tone] ?? ''}`} />
                <span style={{ color: 'var(--pt-text-high)' }}>{h.label}</span>
                <span style={{ color: 'var(--pt-text-mute)' }}>{h.count}</span>
              </div>
            ))}
          </div>
        </Window>
      )}

      {/* Inbox items */}
      {ops.inbox?.length > 0 && (
        <Window tag="▣" title="INBOX" meta={`${ops.inbox.length} items`}>
          <div>
            {ops.inbox.slice(0, 8).map(item => (
              <div key={item.id} className="mc-commit">
                <span className="sha">{item.ownerName}</span>
                <div>
                  <div className="msg">{item.title}</div>
                  <div className="repo">{item.area}</div>
                </div>
                <span className="when">{fmtDate(item.updatedAt)}</span>
              </div>
            ))}
          </div>
        </Window>
      )}

      {/* Recent activity */}
      <Window tag="▶" title="RECENT ACTIVITY" meta={`${ops.recentFiles?.length ?? 0} files`}>
        <div>
          {(ops.recentFiles ?? []).slice(0, 15).map(f => (
            <div key={f.id} className="mc-commit">
              <span className="sha">{f.ownerName}</span>
              <div>
                <div className="msg">{f.title}</div>
                <div className="repo">{f.area} · {f.kind}</div>
              </div>
              <span className="when">{fmtDate(f.updatedAt)}</span>
            </div>
          ))}
        </div>
      </Window>
    </>
  )
}

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

/* ── Missions Panel ───────────────────────────────────── */

export function MissionsPanel() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading missions" />
  const missions = data.missions ?? []
  if (!missions.length) return <EmptyTerminal label="no missions in flight" />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
      {missions.map(m => (
        <Window key={m.id} tag={m.id} title={m.title}>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 10, letterSpacing: '0.18em', color: 'var(--pt-text-dim)' }}>STATUS</span>
              <span style={{ fontSize: 12, color: 'var(--pt-neon-bright)', textShadow: 'var(--pt-glow-sm)' }}>{m.status.toUpperCase()}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--pt-text-dim)' }}>{m.priority}</span>
            </div>
            {m.description && <div style={{ fontSize: 11, color: 'var(--pt-text-dim)', lineHeight: 1.6 }}>{m.description}</div>}
          </div>
        </Window>
      ))}
    </div>
  )
}

/* ── Memory Stream ────────────────────────────────────── */

export function MemoryStream() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading memory" />
  const memory = data.memory ?? []
  if (!memory.length) return <EmptyTerminal label="no memory entries" />

  return (
    <Window tag="⊡" title="STEWARDSHIP LEDGER" meta={`${memory.length} entries`}>
      <div style={{ padding: 0 }}>
        {memory.map(m => (
          <div key={m.id} className="mc-commit">
            <span className="sha">{m.source}</span>
            <div>
              <div className="msg">{m.title}</div>
              {m.excerpt && <div className="repo">{m.excerpt.slice(0, 80)}</div>}
            </div>
            <span className="when">{fmtDate(m.updatedAt)}</span>
          </div>
        ))}
      </div>
    </Window>
  )
}

/* ── Integrations Panel ───────────────────────────────── */

export function IntegrationsPanel() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading integrations" />
  const integrations = data.integrations ?? []
  if (!integrations.length) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {integrations.map(int => (
        <div key={int.name} className="mc-window" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className={`mc-led ${int.status === 'connected' ? 'green' : int.status === 'attention' ? 'amber' : ''}`} />
            <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--pt-text-high)' }}>{int.name}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--pt-text-dim)' }}>{int.detail}</div>
        </div>
      ))}
    </div>
  )
}
