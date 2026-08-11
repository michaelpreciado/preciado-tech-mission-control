'use client'

/**
 * Sub-agent dispatch HUD — the Team tab visualization.
 *
 * Primary view: a TRUE 3D orbital command-core (HoloHud3D, WebGL via
 * react-three-fiber). HERMES is a glowing wireframe core; the agent roster
 * orbits on a tilted ring in real 3D space; energy beams pulse to whoever is
 * genuinely working. The camera auto-drifts and accepts touch drag/pinch —
 * made for watching an active task from a phone (Pixel Fold).
 *
 * Encoding rules (brief-preserving):
 *  - State is carried by color AND shape/motion, never color alone.
 *  - Motion is reserved for genuinely active agents; idle agents are static.
 *  - Animated beam flows along the active agent's edge only.
 *  - Stale agents render desaturated with a "last seen" marker in detail.
 *  - Errored agents are the loudest thing (red, hard flash).
 *  - Offline nodes (desktop asleep) are a normal state, distinct from errors.
 *
 * The mission spotlight, list view, and detail sheet stay as crisp HTML
 * overlays (readable text on mobile) layered over / beside the WebGL stage.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { RelativeTime } from '../RelativeTime'
import { MESH_ROSTER, useSubAgentTelemetry } from '@/lib/telemetry'
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

// Client-only WebGL HUD (no SSR — Canvas can't render on the server).
const HoloHud3D = dynamic(() => import('./HoloHud3D'), { ssr: false, loading: () => <div className="mc-hud3d-loading">INITIALIZING HOLO ARRAY…</div> })

function elapsedOnTask(n: AgentNode): number | null {
  if (!n.currentTask?.startedAt) return null
  return n.currentTask.startedAt > 1e12 ? n.currentTask.startedAt : n.currentTask.startedAt * 1000
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

/* ── Live mission spotlight (HTML overlay over/under the HUD) ─────────── */

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

  const elapsed = started != null ? Math.max(0, Math.floor((now - started) / 1000)) : 0
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
  const working = snap.tree.find(n => n.state === 'working')
  const erroredNode = snap.tree.find(n => n.state === 'errored')

  return (
    <div className="mc-sub-panel">
      <div className="mc-sub-bar">
        <div className="mc-sub-bar-title">
          <span className="mc-sub-kicker">HOLO DISPATCH · 3D TREE</span>
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
        <>
          {/* WebGL 3D stage + non-interactive legend strip.
              aria-hidden: the canvas is decorative and not keyboard-operable; the
              roster is fully exposed to assistive tech via the sr-only synopsis
              below and the LIST view (toggle button is labeled). */}
          <div className="mc-hud3d-frame" aria-hidden="true">
            <HoloHud3D nodes={snap.tree} selectedId={selectedId} onSelect={setSelectedId} />
            <div className="mc-hud3d-overlay">
              <div className="mc-hud3d-hudtag"><span className="mc-hud-brack">◤</span> COMMAND MESH <span className="mc-hud-brack">◢</span></div>
              <div className="mc-hud3d-counters">
                <span className="mc-hud-count is-working">{activeCount} ✦ WORK</span>
                <span className="mc-hud-count is-errored">{erroredCount} ✕ ERR</span>
              </div>
            </div>
          </div>

          {/* screen-reader synopsis so the canvas isn't the only carrier of state */}
          <div className="sr-only" role="status">
            {snap.tree.length} agents. {activeCount} working, {erroredCount} errored,{' '}
            {snap.tree.filter(n => n.state === 'idle').length} idle,{' '}
            {snap.tree.filter(n => n.state === 'offline').length} offline.
            {' '}{working?.name ? `${working.name} is working now.` : ''} The 3D map is visual
            only — use the LIST view for full keyboard navigation of every agent.
          </div>

          {/* spotlight */}
          <div className="mc-hud-spotlight">
            <div className="mc-hud-spot-kicker">
              {working ? '▸ LIVE MISSION' : erroredNode ? '⚠ TASK ERROR' : '◌ MESH STANDBY'}
            </div>
            {working ? (
              <LiveMission node={working} />
            ) : erroredNode ? (
              <div className="mc-hud-idle">
                <span className="mc-hud-idle-line" style={{ color: 'var(--pt-error-ink)' }}>⚠ {erroredNode.name} ERRORED</span>
                <span className="mc-hud-idle-sub">{erroredNode.currentTask?.title ?? 'no task label'} — tap the node for details</span>
              </div>
            ) : (
              <div className="mc-hud-idle">
                <span className="mc-hud-idle-line">CREW ON STANDBY — {snap.tree.filter(n => n.state !== 'offline').length} OF {snap.tree.length} AGENTS AWAKE</span>
                <span className="mc-hud-idle-sub">the mesh stands watch · drag to orbit · pinch to zoom · tap a node for details</span>
              </div>
            )}
          </div>
        </>
      )}

      {selected && <DetailSheet node={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

export { MESH_ROSTER }
