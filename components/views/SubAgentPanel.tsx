'use client'

/**
 * Dispatch telemetry roster, optionally accompanied by the decorative HoloHud3D.
 * /bots opts in by mounting with initialHolo; teamGraph remains the settings gate.
 * The complete keyboard-accessible roster stays mounted while holo is shown.
 */
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { HOLO_NODE_CAP } from '@/components/threed/holo-config'
import { RelativeTime } from '../RelativeTime'
import { Button } from '../ui'
import { useUiSettings } from '../ui-settings'
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

// Client-only WebGL HUD (no SSR — Canvas can't render on the server). Dynamic
// import keeps it out of the bundle until the user opts into the holo view.
const HoloHud3D = dynamic(() => import('./HoloHud3D'), { ssr: false, loading: () => <div className="mc-hud3d-loading">INITIALIZING HOLO ARRAY…</div> })

function taskStartedMs(n: AgentNode): number | null {
  if (!n.currentTask?.startedAt) return null
  return n.currentTask.startedAt > 1e12 ? n.currentTask.startedAt : n.currentTask.startedAt * 1000
}

function fmtElapsed(startedMs: number, now: number): string {
  const s = Math.max(0, Math.floor((now - startedMs) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Ticks once a second while `active` (e.g. any agent has a task running). */
function useNowWhile(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
  return now
}

/* ── Now strip — the pulse of the team ─────────────────────────────────── */

function NowStrip({ nodes }: { nodes: AgentNode[] }) {
  const segs: { key: string; label: string; cls: string }[] = []
  const count = (s: AgentState) => nodes.filter(n => n.state === s).length
  const working = count('working')
  const errored = count('errored')
  const waiting = count('waiting')
  const idle = count('idle')
  const offline = count('offline')
  if (working) segs.push({ key: 'working', label: `${working} ${working === 1 ? 'agent' : 'agents'} working`, cls: 'is-working' })
  if (errored) segs.push({ key: 'errored', label: `${errored} errored`, cls: 'is-errored' })
  if (waiting) segs.push({ key: 'waiting', label: `${waiting} waiting`, cls: 'is-waiting' })
  if (idle) segs.push({ key: 'idle', label: `${idle} idle`, cls: 'is-idle' })
  if (offline) segs.push({ key: 'offline', label: `${offline} offline`, cls: 'is-offline' })

  return (
    <div className="mc-shift-now" role="status" aria-live="polite">
      <span className="mc-shift-now-led" aria-hidden="true" />
      {segs.length === 0 ? (
        <span className="mc-shift-now-empty">no agents reported</span>
      ) : (
        segs.map(s => (
          <span key={s.key} className={`mc-shift-now-item ${s.cls}`}>{s.label}</span>
        ))
      )}
    </div>
  )
}

/* ── Shift roster — the primary view ──────────────────────────────────── */

function RosterRow({ node, now, onSelect }: { node: AgentNode; now: number; onSelect: (id: string) => void }) {
  const task = node.currentTask
  const started = taskStartedMs(node)
  const meta = [node.host ? `@${node.host}` : null, node.model && node.model !== 'n/a (not published)' ? node.model : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      className={`mc-sub-row mc-shift-row state-${node.state}`}
      onClick={() => onSelect(node.id)}
      style={{ '--shift-accent': node.accent } as React.CSSProperties}
      aria-label={`${node.name}, ${STATE_META[node.state].label}${task ? `, ${task.title}` : ''}`}
    >
      <span className="mc-sub-row-shape" style={{ borderColor: node.accent, color: node.accent }}>{STATE_META[node.state].glyph}</span>
      <span className="mc-sub-row-main">
        <span className="mc-sub-row-name">
          {node.name}
          <em className="mc-shift-role">{node.role}</em>
        </span>
        <span className="mc-sub-row-task">
          {task ? (
            <>{task.title}{started != null && <span className="mc-shift-elapsed"> · {fmtElapsed(started, now)}</span>}</>
          ) : (
            <span className="mc-shift-notask">no active task</span>
          )}
        </span>
        <span className="mc-sub-row-meta">{meta || '—'}</span>
      </span>
      <span className="mc-shift-side">
        <span className={`mc-shift-badge is-${node.state}`}>{STATE_META[node.state].label}</span>
      </span>
    </button>
  )
}

function ShiftRoster({ nodes, now, onSelect }: { nodes: AgentNode[]; now: number; onSelect: (id: string) => void }) {
  const sorted = useMemo(
    () => [...nodes].sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0)),
    [nodes],
  )
  return (
    <div className="mc-sub-list" role="list" aria-label="agent shift roster">
      {sorted.map(n => <div role="listitem" key={n.id}><RosterRow node={n} now={now} onSelect={onSelect} /></div>)}
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
        <Button variant="ghost" className="mc-sub-detail-close" onClick={onClose} aria-label="Close detail">✕</Button>
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

/* ── Live mission spotlight (holo overlay) ────────────────────────────── */

function LiveMission({ node }: { node: AgentNode }) {
  const task = node.currentTask
  const [now, setNow] = useState(() => Date.now())
  const started = task?.startedAt ? (task.startedAt > 1e12 ? task.startedAt : task.startedAt * 1000) : null

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

export function SubAgentPanel({ initialHolo = false }: { initialHolo?: boolean }) {
  const snap = useSubAgentTelemetry()
  const { elements3d } = useUiSettings()
  const holoAllowed = elements3d.teamGraph
  // Holo is OPT-IN: default off, mounted only when the user toggles it.
  const [holoOn, setHoloOn] = useState(initialHolo)
  const showHolo = holoAllowed && holoOn

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const stream = STREAM_META[snap.stream] ?? STREAM_META.connecting
  const selected = snap.tree.find(n => n.id === selectedId) ?? null

  const activeCount = snap.tree.filter(n => n.state === 'working').length
  const erroredCount = snap.tree.filter(n => n.state === 'errored').length
  const working = snap.tree.find(n => n.state === 'working')
  const erroredNode = snap.tree.find(n => n.state === 'errored')

  // One shared ticker for the roster's elapsed counters (only while someone
  // actually has a running task — otherwise the list stays static).
  const now = useNowWhile(snap.tree.some(n => n.currentTask))

  return (
    <div className="mc-sub-panel">
      <div className="mc-sub-bar">
        <div className="mc-sub-bar-title">
          <span className="mc-sub-kicker">{showHolo ? 'HOLO DISPATCH · 3D TREE' : 'TEAM · SHIFT ROSTER'}</span>
          <span className={`mc-led ${stream.cls}`} />
          <span className={`mc-sub-stream state-${snap.stream}`}>{stream.label}</span>
        </div>
        <div className="mc-sub-bar-meta">
          {!showHolo && (
            <span className="mc-shift-counts" aria-hidden="true">{activeCount} working · {erroredCount} errored</span>
          )}
          {holoAllowed && (
            <Button
              variant="ghost"
              active={holoOn}
              onClick={() => setHoloOn(v => !v)}
              aria-pressed={holoOn}
              aria-label={holoOn ? 'Show shift roster' : 'Show 3D holo view'}
            >
              {holoOn ? 'ROSTER' : 'HOLO 3D'}
            </Button>
          )}
        </div>
      </div>

      {snap.stream === 'stale' || snap.stream === 'offline' ? (
        <div className="mc-sub-banner">stream dropped — showing last known state, marked stale</div>
      ) : null}

      {showHolo ? (
        <>
          <div className="mc-hud3d-frame" aria-hidden="true">
            <HoloHud3D nodes={snap.tree} selectedId={selectedId} />
            <div className="mc-hud3d-overlay">
              <div className="mc-hud3d-hudtag"><span className="mc-hud-brack">◤</span> COMMAND MESH <span className="mc-hud-brack">◢</span></div>
              <div className="mc-hud3d-counters">
                <span className="mc-hud-count is-working">{activeCount} ✦ WORK</span>
                <span className="mc-hud-count is-errored">{erroredCount} ✕ ERR</span>
              </div>
            </div>
          </div>

          <div className="sr-only" role="status">
            {snap.tree.length} agents. {activeCount} working, {erroredCount} errored,{' '}
            {snap.tree.filter(n => n.state === 'idle').length} idle,{' '}
            {snap.tree.filter(n => n.state === 'offline').length} offline.
            {' '}{working?.name ? `${working.name} is working now.` : ''} The 3D map is visual
            only — use the roster for full keyboard navigation of every agent.
          </div>

          <div className="mc-hud-spotlight">
            <div className="mc-hud-spot-kicker">
              {working ? '▸ LIVE MISSION' : erroredNode ? '⚠ TASK ERROR' : '◌ MESH STANDBY'}
            </div>
            {working ? (
              <LiveMission node={working} />
            ) : erroredNode ? (
              <div className="mc-hud-idle">
                <span className="mc-hud-idle-line" style={{ color: 'var(--pt-error-ink)' }}>⚠ {erroredNode.name} ERRORED</span>
                <span className="mc-hud-idle-sub">{erroredNode.currentTask?.title ?? 'no task label'} — select the agent below for details</span>
              </div>
            ) : (
              <div className="mc-hud-idle">
                <span className="mc-hud-idle-line">CREW ON STANDBY — {snap.tree.filter(n => n.state !== 'offline').length} OF {snap.tree.length} AGENTS AWAKE</span>
                <span className="mc-hud-idle-sub">drag to orbit · select an agent in the roster below for details</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <NowStrip nodes={snap.tree} />
          <ShiftRoster nodes={snap.tree} now={now} onSelect={setSelectedId} />
        </>
      )}

      {showHolo && <>
        <p>Visual map: up to {HOLO_NODE_CAP} agents. Select any agent in the complete roster below.</p>
        <ShiftRoster nodes={snap.tree} now={now} onSelect={setSelectedId} />
      </>}

      {selected && <DetailSheet node={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

export { MESH_ROSTER }
