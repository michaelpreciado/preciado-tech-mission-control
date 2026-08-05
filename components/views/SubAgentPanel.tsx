'use client'

/**
 * Sub-agent dispatch tree — the Team tab visualization.
 *
 * Primary view: a deterministic dispatch tree (Hermes root → sub-agents →
 * task leaves), NOT a force graph. Layout is fixed by roster order so nodes
 * never drift between renders.
 *
 * Encoding rules (from the brief):
 *  - State is carried by color AND shape, never color alone.
 *  - Motion is reserved for genuinely active agents; idle agents are static.
 *  - Animated flow runs along the parent→child edge only while a dispatch is
 *    actually in flight (working/waiting agents).
 *  - Stale agents (no heartbeat in the expected interval) render desaturated
 *    with an explicit "last seen" label.
 *  - Errored agents are the loudest thing on screen.
 *  - Offline nodes (desktop asleep) are a normal state, distinct from errors.
 *
 * Mobile-first: tree fits a 390px viewport, pinch-zoom + pan, reset-to-fit,
 * 44px tap targets, and a compact list view below 640px.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
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

/* ── Layout constants (deterministic, fixed px in SVG user space) ──────── */

const COL_W = 92
const ROOT_X = 92 * 4 // Hermes centered above 8 columns (0..7)
const ROOT_Y = 52
const AGENT_Y = 148
const TASK_ROW = 46
const NODE_W = 84
const NODE_H = 46
const TOTAL_W = COL_W * 8

function shapeFor(state: AgentState, accent: string, stale: boolean): { d: string; fill: string; stroke: string; dash?: string } {
  const cx = 0
  const cy = 0
  const w = NODE_W / 2 - 4
  const h = NODE_H / 2 - 4
  const base = stale ? '#3a3f4a' : accent
  const dim = stale ? '#2a2e38' : accent
  switch (state) {
    case 'working':
      // Diamond — active pulse.
      return { d: `M 0 -${h + 6} L ${w + 4} 0 L 0 ${h + 6} L -${w + 4} 0 Z`, fill: `${base}22`, stroke: base, dash: undefined }
    case 'waiting':
      // Hexagon — queued, not moving.
      return { d: `M ${w} 0 L ${w / 2} -${h} L -${w / 2} -${h} L -${w} 0 L -${w / 2} ${h} L ${w / 2} ${h} Z`, fill: `${base}18`, stroke: base, dash: undefined }
    case 'errored':
      // Triangle pointing up — loud + red, never confused with a square.
      return { d: `M 0 -${h + 8} L ${w + 6} ${h} L -${w - 6} ${h} Z`, fill: 'rgba(255,95,87,0.14)', stroke: '#ff5f57', dash: undefined }
    case 'offline':
      // Dashed square — asleep node, normal state.
      return { d: `M -${w} -${h} H ${w} V ${h} H -${w} Z`, fill: 'rgba(120,128,148,0.06)', stroke: '#788094', dash: '5 4' }
    default:
      // Idle — static rounded square.
      return { d: `M -${w} -${h} H ${w} V ${h} H -${w} Z`, fill: `${base}10`, stroke: dim, dash: undefined }
  }
}

function elapsedOnTask(n: AgentNode): number | null {
  if (!n.currentTask?.startedAt) return null
  return n.currentTask.startedAt > 1e12 ? n.currentTask.startedAt : n.currentTask.startedAt * 1000
}

/* ── SVG node ──────────────────────────────────────────────────────────── */

function AgentNodeMark({
  node,
  agentX,
  selected,
  onTap,
}: {
  node: AgentNode
  agentX: number
  selected: boolean
  onTap: (id: string) => void
}) {
  const now = Date.now()
  const stale =
    node.state !== 'offline' &&
    node.lastSeenAt !== null &&
    now - (node.lastSeenAt > 1e12 ? node.lastSeenAt : node.lastSeenAt * 1000) > HEARTBEAT_STALE_MS &&
    node.state !== 'working'
  const shape = shapeFor(node.state, node.accent, stale)
  const isActive = node.state === 'working' || node.state === 'errored'

  return (
    <g
      className={`mc-sub-node state-${node.state}${isActive ? ' is-active' : ''}${stale ? ' is-stale' : ''}${selected ? ' is-selected' : ''}`}
      transform={`translate(${agentX}, ${AGENT_Y})`}
      onClick={() => onTap(node.id)}
      style={{ cursor: 'pointer' }}
      role="button"
      aria-label={`${node.name} · ${STATE_META[node.state].label}`}
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(node.id) } }}
    >
      {/* dispatch edge from root while in flight */}
      {node.state === 'working' || node.state === 'waiting' ? (
        <line
          x1={ROOT_X} y1={ROOT_Y + 18} x2={ROOT_X} y2={AGENT_Y - 22}
          className="mc-sub-edge"
          stroke={node.accent}
          strokeWidth={1.5}
          strokeDasharray="6 5"
        />
      ) : (
        <line x1={ROOT_X} y1={ROOT_Y + 18} x2={ROOT_X} y2={AGENT_Y - 22} stroke="rgba(120,128,148,0.25)" strokeWidth={1} />
      )}

      {/* node body */}
      <path d={shape.d} fill={shape.fill} stroke={shape.stroke} strokeWidth={node.state === 'errored' ? 2.2 : 1.6} strokeDasharray={shape.dash} className="mc-sub-node-shape" />

      {/* status glyph + name */}
      <text x={0} y={-2} textAnchor="middle" className="mc-sub-glyph" fill={node.state === 'errored' ? '#ff5f57' : node.accent}>
        {STATE_META[node.state].glyph}
      </text>
      <text x={0} y={16} textAnchor="middle" className="mc-sub-name" fill={stale ? 'var(--pt-text-mute)' : 'var(--pt-text-high)'}>
        {node.name}
      </text>
    </g>
  )
}

/* ── Task leaf ─────────────────────────────────────────────────────────── */

function TaskLeaf({ node, agentX, onTap }: { node: AgentNode; agentX: number; onTap: (id: string) => void }) {
  const tasks = useMemo(
    () => [...node.tasks].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)),
    [node.tasks],
  )
  return (
    <g>
      {tasks.slice(0, 3).map((t, i) => {
        const y = AGENT_Y + 30 + i * TASK_ROW
        const failed = t.failed || t.status === 'blocked' || t.status === 'gave_up'
        return (
          <g
            key={t.id}
            transform={`translate(${agentX}, ${y})`}
            className={`mc-sub-task${failed ? ' is-failed' : ''}`}
            onClick={() => onTap(node.id)}
            role="button"
            aria-label={`${node.name} task: ${t.title}`}
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(node.id) } }}
          >
            <rect x={-40} y={-14} width={80} height={26} rx={5} fill={failed ? 'rgba(255,95,87,0.08)' : 'rgba(30,144,255,0.05)'} stroke={failed ? 'rgba(255,95,87,0.5)' : 'rgba(120,128,148,0.3)'} strokeWidth={1} />
            <text x={0} y={2} textAnchor="middle" className="mc-sub-task-title" fill={failed ? '#ff9a95' : 'var(--pt-text)'}>
              {t.title.length > 22 ? `${t.title.slice(0, 20)}…` : t.title}
            </text>
            <text x={0} y={15} textAnchor="middle" className="mc-sub-task-meta">
              {t.status ?? 'ready'}{t.startedAt ? ' · ' : ''}{t.startedAt ? <RelativeTime ts={t.startedAt} frame="elapsed" /> : null}
            </text>
          </g>
        )
      })}
      {tasks.length > 3 && (
        <text x={agentX} y={AGENT_Y + 30 + 3 * TASK_ROW} textAnchor="middle" className="mc-sub-task-meta">
          +{tasks.length - 3} more
        </text>
      )}
    </g>
  )
}

/* ── Tree view (SVG, deterministic) ────────────────────────────────────── */

function TreeView({ nodes, onSelect }: { nodes: AgentNode[]; onSelect: (id: string) => void }) {
  const maxTasks = Math.max(1, ...nodes.map(n => n.tasks.length))
  const height = AGENT_Y + 40 + maxTasks * TASK_ROW + 30
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [selected, setSelected] = useState<string | null>(null)
  const touchRef = useRef<{ mode: 'pan' | 'pinch' | null; x: number; y: number; dist: number; sx: number; sy: number; sk: number } | null>(null)

  const handleTap = (id: string) => {
    setSelected(prev => (prev === id ? null : id))
    onSelect(id)
  }

  // Pointer pan (mouse drag) + pinch (two pointers).
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return // touch handled by gesture handlers below
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    touchRef.current = { mode: 'pan', x: e.clientX, y: e.clientY, dist: 0, sx: view.x, sy: view.y, sk: view.k }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = touchRef.current
    if (!t || t.mode !== 'pan') return
    setView(v => ({ ...v, x: t.sx + (e.clientX - t.x), y: t.sy + (e.clientY - t.y) }))
  }
  const onPointerUp = () => { touchRef.current = null }

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const t = e.touches[0]
      touchRef.current = { mode: 'pan', x: t.clientX, y: t.clientY, dist: 0, sx: view.x, sy: view.y, sk: view.k }
    } else if (e.touches.length === 2) {
      const a = e.touches[0], b = e.touches[1]
      touchRef.current = { mode: 'pinch', x: 0, y: 0, dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY), sx: view.x, sy: view.y, sk: view.k }
    }
  }
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = touchRef.current
    if (!t) return
    if (t.mode === 'pan' && e.touches.length === 1) {
      const p = e.touches[0]
      setView(v => ({ ...v, x: t.sx + (p.clientX - t.x), y: t.sy + (p.clientY - t.y) }))
    } else if (t.mode === 'pinch' && e.touches.length === 2) {
      const a = e.touches[0], b = e.touches[1]
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
      const k = Math.min(4, Math.max(0.4, t.sk * (dist / Math.max(1, t.dist))))
      setView(v => ({ ...v, k }))
    }
  }
  const onTouchEnd = () => { touchRef.current = null }

  const resetFit = () => setView({ x: 0, y: 0, k: 1 })

  return (
    <div className="mc-sub-tree-wrap">
      <div className="mc-sub-tree-tools">
        <button type="button" className="mc-sub-btn" onClick={resetFit} aria-label="Reset view to fit">⌂ FIT</button>
        <span className="mc-sub-zoom">{Math.round(view.k * 100)}%</span>
      </div>
      <div
        className="mc-sub-tree-pane"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <svg
            viewBox={`0 0 ${TOTAL_W} ${height}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMin meet"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: 'top left', transition: touchRef.current ? 'none' : 'transform 120ms ease' }}
            className="mc-sub-svg"
          >
            {/* Hermes root */}
            <g transform={`translate(${ROOT_X}, ${ROOT_Y})`} className="mc-sub-root">
              <circle r={22} fill="rgba(30,144,255,0.14)" stroke="#1e90ff" strokeWidth={2} />
              <text x={0} y={4} textAnchor="middle" className="mc-sub-glyph" fill="#1e90ff">⌂</text>
              <text x={0} y={34} textAnchor="middle" className="mc-sub-name" fill="var(--pt-text-high)">HERMES</text>
            </g>

            {/* agents */}
            {nodes.map((n, i) => {
              const agentX = i * COL_W + COL_W / 2
              return (
                <g key={n.id}>
                  <AgentNodeMark node={n} agentX={agentX} selected={selected === n.id} onTap={handleTap} />
                  <TaskLeaf node={n} agentX={agentX} onTap={handleTap} />
                </g>
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}

/* ── Compact list view (<640px toggle) ─────────────────────────────────── */

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

/* ── Detail sheet ──────────────────────────────────────────────────────── */

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

/* ── Main panel ────────────────────────────────────────────────────────── */

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
          <span className="mc-sub-kicker">TELEMETRY · DISPATCH TREE</span>
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
            {listMode ? 'TREE' : 'LIST'}
          </button>
        </div>
      </div>

      {snap.stream === 'stale' || snap.stream === 'offline' ? (
        <div className="mc-sub-banner">stream dropped — showing last known state, marked stale</div>
      ) : null}

      {listMode ? (
        <ListView nodes={snap.tree} onSelect={setSelectedId} />
      ) : (
        <TreeView nodes={snap.tree} onSelect={setSelectedId} />
      )}

      {selected && <DetailSheet node={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

export { MESH_ROSTER }
