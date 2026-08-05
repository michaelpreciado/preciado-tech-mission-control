'use client'

/**
 * Sub-agent dispatch HUD — the Team tab visualization.
 *
 * Rebuilt as a holographic command-core (HoloHUD):
 *   HERMES sits at the center of a rotating orbital core. Agents orbit on a
 *   fixed ring (positions never drift between renders). Energy beams pulse
 *   from the core to whichever agent is genuinely working. A live mission
 *   readout spotlights the active task with a running elapsed timer.
 *
 * Encoding rules (preserved from the brief):
 *  - State is carried by color AND shape, never color alone.
 *  - Motion is reserved for genuinely active agents; idle agents are static.
 *  - Animated energy flow runs along the dirty agent's beam only.
 *  - Stale agents (no heartbeat in interval) render desaturated + "last seen".
 *  - Errored agents are the loudest thing on screen (flash + audible shape).
 *  - Offline nodes (desktop asleep) are a normal state, distinct from errors.
 *
 * Mobile-first: the orbital HUD fits a 360px portrait viewport (Pixel Fold
 * cover display) with zero zoom, and the list view is one thumb-tap away.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RelativeTime } from '../RelativeTime'
import {
  HEARTBEAT_STALE_MS,
  MESH_ROSTER,
  useSubAgentTelemetry,
} from '@/lib/telemetry'
import type { AgentNode, AgentState } from '@/lib/telemetry-types'

/* ── State encoding: color + shape + label ─────────────────────────────── */

const STATE_META: Record<AgentState, { label: string; glyph: string }> = {
  working: { label: 'WORKING', glyph: '▣' },
  waiting: { label: 'WAITING', glyph: '▤' },
  errored: { label: 'ERRORED', glyph: '✕' },
  idle:    { label: 'IDLE',    glyph: '○' },
  offline: { label: 'OFFLINE', glyph: '◇' },
}

/** Deterministic rank used for list sorting (active → waiting → errored → idle → offline). */
const STATE_RANK: Record<AgentState, number> = { working: 0, waiting: 1, errored: 2, idle: 3, offline: 4 }

/* ── HoloHUD orbital geometry (fixed SVG user-space, deterministic) ───── */

const CX = 240   // core x
const CY = 216   // core y
const CORE_R = 30
const ORBIT_R = 138
const NODE_R = 21

function orbitPoint(i: number, total: number): { x: number; y: number } {
  // Start at 12 o'clock, clock clockwise. Fixed by roster index → no drift.
  const a = (i / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2
  return { x: CX + ORBIT_R * Math.cos(a), y: CY + ORBIT_R * Math.sin(a) }
}

function elapsedOnTask(n: AgentNode): number | null {
  if (!n.currentTask?.startedAt) return null
  return n.currentTask.startedAt > 1e12 ? n.currentTask.startedAt : n.currentTask.startedAt * 1000
}

function isStaleNode(n: AgentNode): boolean {
  if (n.state === 'offline' || n.state === 'working') return false
  if (n.lastSeenAt === null) return false
  const ts = n.lastSeenAt > 1e12 ? n.lastSeenAt : n.lastSeenAt * 1000
  return Date.now() - ts > HEARTBEAT_STALE_MS
}

/** Rough shape glyph for a node — shape encodes state (never color alone). */
function nodeShape(state: AgentState): string {
  switch (state) {
    case 'working': return '◆'   // diamond
    case 'waiting': return '⬢'   // hexagon
    case 'errored': return '▲'   // triangle
    case 'offline': return '◇'   // hollow diamond
    default:        return '●'   // circle
  }
}

/* ── Orbital HUD (primary/mobile-first view) ──────────────────────────── */

function HudView({
  nodes,
  selected,
  onSelect,
}: {
  nodes: AgentNode[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  // HERMES owns the core; the other agents orbit it.
  const orbitAgents = useMemo(() => nodes.filter(n => n.id !== 'hermes'), [nodes])
  const hermes = useMemo(() => nodes.find(n => n.id === 'hermes') ?? null, [nodes])
  const total = Math.max(1, orbitAgents.length)

  const active = orbitAgents.filter(n => n.state === 'working' || n.state === 'errored')
  const working = orbitAgents.find(n => n.state === 'working')

  return (
    <div className="mc-hud" role="region" aria-label="Sub-agent orbital dispatch HUD">
      {/* top status telemetry strip */}
      <div className="mc-hud-toprow">
        <div className="mc-hud-hudtag">
          <span className="mc-hud-brack">◤</span>
          <span className="mc-hud-kicker">SYNC ARRAY</span>
          <span className="mc-hud-brack">◢</span>
        </div>
        <div className="mc-hud-counters">
          <span className="mc-hud-count is-working">{active.filter(a => a.state === 'working').length} ✦ WORKING</span>
          <span className="mc-hud-count is-errored">{active.filter(a => a.state === 'errored').length} ✕ ERR</span>
        </div>
      </div>

      <div className="mc-hud-stage">
        {/* rotating scan grid underlay (pure CSS) */}
        <div className="mc-hud-grid" aria-hidden="true" />

        <svg
          viewBox="0 0 480 432"
          className="mc-hud-svg"
          role="img"
          aria-label="Orbital dispatch constellation"
        >
          <defs>
            <radialGradient id="mc-hud-core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ff7df8" stopOpacity="0.9" />
              <stop offset="55%" stopColor="#ff10f0" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#ff10f0" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* orbit rings */}
          <circle cx={CX} cy={CY} r={ORBIT_R} className="mc-hud-ring" />
          <circle cx={CX} cy={CY} r={ORBIT_R - 26} className="mc-hud-ring is-faint" />
          <circle cx={CX} cy={CY} r={ORBIT_R + 26} className="mc-hud-ring is-faint" />
          {/* rotating hatch ring */}
          <circle cx={CX} cy={CY} r={ORBIT_R} className="mc-hud-ring-rot" />

          {/* crosshair ticks */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
            const a = (deg * Math.PI) / 180
            const x1 = CX + Math.cos(a) * (ORBIT_R + 34)
            const y1 = CY + Math.sin(a) * (ORBIT_R + 34)
            const x2 = CX + Math.cos(a) * (ORBIT_R + 44)
            const y2 = CY + Math.sin(a) * (ORBIT_R + 44)
            return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} className="mc-hud-tick" />
          })}

          {/* HERMES core */}
          {hermes && (
            <g className="mc-hud-core">
              <circle cx={CX} cy={CY} r={CORE_R + 14} fill="url(#mc-hud-core-glow)" />
              <circle cx={CX} cy={CY} r={CORE_R} className="mc-hud-core-ring" />
              <circle cx={CX} cy={CY} r={CORE_R - 6} className={`mc-hud-core-inner state-${hermes.state}`} />
              <text x={CX} y={CY + 1} textAnchor="middle" className="mc-hud-core-glyph">⟟</text>
              <text x={CX} y={CY + CORE_R + 22} textAnchor="middle" className="mc-hud-core-label">HERMES</text>
            </g>
          )}

          {/* energy beams + orbiting agent nodes */}
          {orbitAgents.map((n, i) => {
            const p = orbitPoint(i, total)
            const stale = isStaleNode(n)
            const glowing = n.state === 'working' || n.state === 'errored'
            const beamTo = n.state === 'working' || n.state === 'waiting'
            return (
              <g key={n.id}>
                {/* energy beam from core → active agent */}
                {beamTo && (
                  <line
                    x1={CX} y1={CY} x2={p.x} y2={p.y}
                    className={`mc-hud-beam state-${n.state}`}
                    stroke={n.state === 'errored' ? '#ff5f57' : n.accent}
                  />
                )}
                {/* node */}
                <g
                  transform={`translate(${p.x}, ${p.y})`}
                  className={`mc-hud-node state-${n.state}${glowing ? ' is-glowing' : ''}${stale ? ' is-stale' : ''}${selected === n.id ? ' is-selected' : ''}`}
                  onClick={() => onSelect(n.id)}
                  role="button"
                  aria-label={`${n.name} · ${STATE_META[n.state].label}${n.currentTask ? ` · ${n.currentTask.title}` : ''}`}
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.id) } }}
                >
                  {/* selected halo */}
                  {selected === n.id && <circle r={NODE_R + 8} className="mc-hud-selected-halo" />}
                  {/* working pulse ring */}
                  {n.state === 'working' && <circle r={NODE_R + 6} className="mc-hud-pulse" />}
                  <circle r={NODE_R} className="mc-hud-node-ring" stroke={n.state === 'errored' ? '#ff5f57' : n.accent} />
                  <text x={0} y={1} textAnchor="middle" className="mc-hud-node-glyph" fill={n.state === 'errored' ? '#ff5f57' : n.accent}>
                    {nodeShape(n.state)}
                  </text>
                  <text x={0} y={NODE_R + 14} textAnchor="middle" className="mc-hud-node-name">{n.name}</text>
                </g>
              </g>
            )
          })}
        </svg>

        {/* side legend (desktop only) */}
        <div className="mc-hud-legend">
          <div className="mc-hud-legend-title">AGENT STATES</div>
          {(Object.keys(STATE_META) as AgentState[]).map(s => (
            <div key={s} className={`mc-hud-legend-row state-${s}`}>
              <span className="mc-hud-legend-glyph">{STATE_META[s].glyph}</span>
              <span>{STATE_META[s].label}</span>
            </div>
          ))}
        </div>

        {/* live mission spotlight — pins to the active task */}
        <div className="mc-hud-spotlight">
          <div className="mc-hud-spot-kicker">
            {working ? '▸ LIVE MISSION' : errorsBrief(active) ? '⚠ TASK ERROR' : '◌ MESH IDLE'}
          </div>
          {working ? (
            <LiveMission node={working} />
          ) : (
            <div className="mc-hud-idle">
              <span className="mc-hud-idle-line">NO AGENT WORKING — MESH STANDBY</span>
              <span className="mc-hud-idle-sub">{orbitAgents.length} nodes on array · {nodes.filter(n => n.state === 'offline').length} offline</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function errorsBrief(active: AgentNode[]): AgentNode | null {
  return active.find(a => a.state === 'errored') ?? null
}

/* ── Live mission readout ─────────────────────────────────────────────── */

function LiveMission({ node }: { node: AgentNode }) {
  const task = node.currentTask
  const [now, setNow] = useState(() => Date.now())
  const started = useMemo(() => elapsedOnTask(node), [node])

  useEffect(() => {
    if (started == null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [started])

  if (!task) {
    return (
      <div className="mc-hud-mission">
        <div className="mc-hud-mission-name" style={{ color: node.accent }}>{node.name}</div>
        <div className="mc-hud-mission-status working">WORKING — NO TASK LABEL</div>
      </div>
    )
  }

  const elapsed =
    started != null
      ? Math.max(0, Math.floor((now - started) / 1000))
      : 0
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="mc-hud-mission">
      <div className="mc-hud-mission-name" style={{ color: node.accent }}>{node.name}</div>
      <div className="mc-hud-mission-title">{task.title}</div>
      <div className="mc-hud-mission-meta">
        <span className={`mc-hud-status state-${node.state}`}>{node.state}</span>
        <span className="mc-hud-elapsed"><span className="mc-hud-elapsed-num">{mm}:{ss}</span> elapsed</span>
        {node.host && <span className="mc-hud-host">@{node.host}</span>}
      </div>
      {task.status && <div className="mc-hud-progress"><span className="mc-hud-progress-fill" /> <span className="mc-hud-progress-lbl">{task.status}</span></div>}
    </div>
  )
}

/* ── Compact list view (mobile toggle) ────────────────────────────────── */

function ListView({ nodes, onSelect }: { nodes: AgentNode[]; onSelect: (id: string) => void }) {
  const sorted = useMemo(
    () => [...nodes].sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0)),
    [nodes],
  )
  return (
    <div className="mc-sub-list" role="list">
      {sorted.map(n => (
        <button
          key={n.id}
          type="button"
          className={`mc-sub-row state-${n.state}`}
          onClick={() => onSelect(n.id)}
          role="listitem"
        >
          <span className={`mc-sub-row-shape state-${n.state}`} style={{ borderColor: n.accent, color: n.accent }}>{STATE_META[n.state].glyph}</span>
          <span className="mc-sub-row-main">
            <span className="mc-sub-row-name">{n.name} <em className="mc-sub-row-state">{STATE_META[n.state].label}</em></span>
            <span className="mc-sub-row-task">{n.currentTask ? n.currentTask.title : 'no active task'}</span>
            <span className="mc-sub-row-meta">{n.host ?? '—'} · last seen <RelativeTime ts={n.lastSeenAt} frame="ago" /></span>
          </span>
        </button>
      ))}
    </div>
  )
}

/* ── Detail sheet ─────────────────────────────────────────────────────── */

function DetailSheet({ node, onClose }: { node: AgentNode; onClose: () => void }) {
  if (!node) return null
  const task = node.currentTask
  return (
    <div className="mc-sub-detail" role="dialog" aria-label={`${node.name} detail`}>
      <div className="mc-sub-detail-head">
        <span className="mc-sub-detail-name" style={{ color: node.accent }}>{node.name}</span>
        <span className={`mc-sub-detail-state state-${node.state}`}>{STATE_META[node.state].label}</span>
        <button type="button" className="mc-sub-btn" onClick={onClose} aria-label="Close detail">✕</button>
      </div>
      <div className="mc-sub-detail-body">
        <div className="mc-sub-detail-row"><span className="lbl">role</span><span>{node.role}</span></div>
        <div className="mc-sub-detail-row"><span className="lbl">host node</span><span>{node.host ?? '—'}</span></div>
        <div className="mc-sub-detail-row"><span className="lbl">model</span><span>{node.model ?? 'n/a (not published)'}</span></div>
        <div className="mc-sub-detail-row"><span className="lbl">last seen</span><span><RelativeTime ts={node.lastSeenAt} frame="ago" /></span></div>
        {task && (
          <div className="mc-sub-detail-task">
            <div className="mc-sub-detail-row"><span className="lbl">task</span><span className="mc-sub-detail-task-title">{task.title}</span></div>
            <div className="mc-sub-detail-row"><span className="lbl">status</span><span>{task.status ?? '—'}</span></div>
            <div className="mc-sub-detail-row"><span className="lbl">started</span><span><RelativeTime ts={task.startedAt} frame="elapsed" /></span></div>
            <div className="mc-sub-detail-row"><span className="lbl">kanban</span>
              <a href={`/kanban`} className="mc-sub-link" target="_blank" rel="noreferrer">open board ↗</a>
            </div>
          </div>
        )}
        {!task && <div className="mc-sub-detail-row"><span className="lbl">task</span><span>no active task</span></div>}
        <div className="mc-sub-detail-row"><span className="lbl">tokens / cost</span><span>not published on the bus</span></div>
        <div className="mc-sub-detail-events">
          <div className="mc-sub-detail-events-title">recent events</div>
          {node.events.length === 0
            ? <div className="mc-sub-detail-row">no events yet</div>
            : node.events.slice(0, 8).map(evt => (
              <div key={evt.id} className="mc-sub-detail-event">
                <span className={`mc-sub-detail-event-kind kind-${evt.raw_kind}`}>{evt.raw_kind}</span>
                <span className="mc-sub-detail-event-task">{evt.title ?? evt.task_id}</span>
                <span className="mc-sub-detail-event-ts"><RelativeTime ts={evt.ts} frame="ago" /></span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

/* ── Main panel ───────────────────────────────────────────────────────── */

const STREAM_META: Record<string, { label: string; cls: string }> = {
  connecting: { label: 'CONNECTING', cls: 'amber' },
  live: { label: 'LIVE', cls: 'green' },
  stale: { label: 'STREAM DOWN — STALE', cls: 'amber' },
  offline: { label: 'OFFLINE', cls: 'dim' },
}

export function SubAgentPanel() {
  const snap = useSubAgentTelemetry()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listMode, setListMode] = useState(false)
  const stream = STREAM_META[snap.stream] ?? STREAM_META.connecting
  const selected = snap.tree.find(n => n.id === selectedId) ?? null

  const activeCount = snap.tree.filter(n => n.state === 'working').length
  const erroredCount = snap.tree.filter(n => n.state === 'errored').length

  return (
    <div className="mc-sub-panel">
      <div className="mc-sub-bar">
        <div className="mc-sub-bar-title">
          <span className="mc-sub-kicker">HOLO DISPATCH · ORBITAL MESH</span>
          <span className={`mc-led ${stream.cls}`} />
          <span className={`mc-sub-stream state-${snap.stream}`}>{stream.label}</span>
        </div>
        <div className="mc-sub-bar-meta">
          <span>{activeCount} working · {erroredCount} errored</span>
          <button
            type="button"
            className={`mc-sub-btn${listMode ? ' is-on' : ''}`}
            onClick={() => setListMode(v => !v)}
            aria-label="Toggle list view"
          >
            {listMode ? 'HOLO' : 'LIST'}
          </button>
        </div>
      </div>

      {snap.stream === 'stale' || snap.stream === 'offline' ? (
        <div className="mc-sub-banner">stream dropped — showing last known state, marked stale</div>
      ) : null}

      {listMode ? (
        <ListView nodes={snap.tree} onSelect={setSelectedId} />
      ) : (
        <HudView nodes={snap.tree} selected={selectedId} onSelect={setSelectedId} />
      )}

      {selected && <DetailSheet node={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

export { MESH_ROSTER }
