'use client'

/**
 * Sub-agent dispatch panel for the Team tab.
 *
 * Two views over one deck (lib/collectors/subagents.ts):
 *   - MESH: the fixed sub-agent roster (Hermes root, crew, edge nodes) rendered
 *     as a deterministic dispatch tree. Status is carried by BOTH color and
 *     shape+glyph (never color alone). Motion is reserved for genuinely active
 *     agents; idle and offline nodes are fully static. Errored nodes are the
 *     loudest mark on the screen.
 *   - TREE: the real parent→child sub-session graph harvested from the Hermes
 *     session store, as a flat recent-dispatch list.
 *
 * Mobile (<640px) collapses to a compact list, one row per agent, sorted
 * active → waiting → errored → idle → offline. Tapping any node opens a detail
 * drawer. Everything polls /api/subagents on a short interval (no live stream
 * for this data exists yet — heartbeats & kanban move events on their own).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { SkeletonPanel, fmtDate } from './ui'
import type { SubAgentDeck, SubAgentNode, SubAgentStatus } from '@/lib/types'

const POLL_MS = 12_000

const STATUS_ORDER: SubAgentStatus[] = ['working', 'waiting', 'errored', 'idle', 'offline']

/* Status → glyph (shape channel) + css class (color channel). Both together
   carry state so the view never relies on color alone. */
const STATUS_GLYPH: Record<SubAgentStatus, { glyph: string; cls: string; label: string }> = {
  working: { glyph: '◉', cls: 'working', label: 'WORKING' },
  waiting: { glyph: '◔', cls: 'waiting', label: 'WAITING' },
  errored: { glyph: '✖', cls: 'errored', label: 'ERROR' },
  idle:    { glyph: '◌', cls: 'idle', label: 'IDLE' },
  offline: { glyph: '○', cls: 'offline', label: 'OFFLINE' },
}

function age(iso?: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function Node({ node, onTap, isRoot }: { node: SubAgentNode; onTap: (n: SubAgentNode) => void; isRoot?: boolean }) {
  const meta = STATUS_GLYPH[node.status]
  const stale = node.status === 'offline'
  const live = node.status === 'working'
  return (
    <button
      type="button"
      className={`mc-sa-node st-${meta.cls} ${live ? 'is-live' : ''} ${stale ? 'is-stale' : ''} ${isRoot ? 'is-root' : ''}`}
      onClick={() => onTap(node)}
      aria-label={`${node.name}, ${meta.label}`}
    >
      <span className="mc-sa-node-shape" aria-hidden="true">{meta.glyph}</span>
      <span className="mc-sa-node-body">
        <span className="mc-sa-node-name">{node.name}</span>
        <span className="mc-sa-node-role">{node.role}</span>
        <span className="mc-sa-node-task">{node.currentTask?.title ?? '—'}</span>
      </span>
      <span className="mc-sa-node-meta">
        <span className="mc-sa-node-status">{meta.label}</span>
        <span className="mc-sa-node-node">{node.node}</span>
        {stale && <span className="mc-sa-node-lastseen">last {age(node.lastSeen)}</span>}
        {!stale && node.lastSeen && <span className="mc-sa-node-lastseen">{age(node.lastSeen)} ago</span>}
      </span>
    </button>
  )
}

function DetailDrawer({ node, onClose }: { node: SubAgentNode | null; onClose: () => void }) {
  if (!node) return null
  const meta = STATUS_GLYPH[node.status]
  return (
    <div className="mc-sa-drawer-back" onClick={onClose}>
      <div className="mc-sa-drawer" onClick={e => e.stopPropagation()}>
        <div className="mc-sa-drawer-head">
          <span className={`mc-sa-node-shape st-${meta.cls}`}>{meta.glyph}</span>
          <div>
            <div className="mc-sa-drawer-name">{node.name}</div>
            <div className="mc-sa-drawer-role">{node.role} · {meta.label} on {node.node}</div>
          </div>
          <button type="button" className="mc-sa-drawer-close" onClick={onClose} aria-label="close">✕</button>
        </div>
        <div className="mc-sa-drawer-grid">
          <div><span className="lbl">model</span><span>{node.model || '—'}</span></div>
          <div><span className="lbl">started</span><span>{node.startedAt ? fmtDate(node.startedAt) : '—'}</span></div>
          <div><span className="lbl">last seen</span><span>{node.lastSeen ? `${fmtDate(node.lastSeen)} (${age(node.lastSeen)} ago)` : '—'}</span></div>
          <div><span className="lbl">transport</span><span>{node.connected === undefined ? 'n/a' : node.connected ? 'connected' : 'down'}</span></div>
        </div>
        <div className="mc-sa-drawer-task">
          <span className="lbl">current task</span>
          {node.currentTask ? (
            <a href="/kanban" className="mc-sa-drawer-tasklink">{node.currentTask.title}</a>
          ) : <span>none in flight</span>}
        </div>
        {node.events && node.events.length > 0 && (
          <div className="mc-sa-drawer-events">
            <span className="lbl">recent events</span>
            <ul>
              {node.events.slice(0, 6).map((e, i) => (
                <li key={i}><em>{fmtDate(e.ts)}</em> {e.kind}{e.detail ? ` — ${e.detail}` : ''}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export function SubAgentPanel() {
  const [deck, setDeck] = useState<SubAgentDeck | null>(null)
  const [err, setErr] = useState(false)
  const [listView, setListView] = useState(false)
  const [selected, setSelected] = useState<SubAgentNode | null>(null)
  const [now, setNow] = useState(Date.now())
  const wasMobile = useRef<boolean | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => fetch('/api/subagents', { cache: 'no-store' })
      .then(r => r.json())
      .then((j: SubAgentDeck) => { if (alive) { setDeck(j); setErr(false) } })
      .catch(() => { if (alive) setErr(true) })
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') { load(); setNow(Date.now()) } }, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // Auto-toggle list view when crossing into mobile, without fighting the user.
  useEffect(() => {
    const q = window.matchMedia('(max-width: 640px)')
    const apply = () => {
      const mobile = q.matches
      if (wasMobile.current !== null && mobile !== wasMobile.current) setListView(mobile)
      wasMobile.current = mobile
    }
    apply()
    q.addEventListener('change', apply)
    return () => q.removeEventListener('change', apply)
  }, [])

  const sorted = useMemo(() => {
    if (!deck) return []
    const order: Record<SubAgentStatus, number> = { working: 0, waiting: 1, errored: 2, idle: 3, offline: 4 }
    return [...deck.mesh].sort((a, b) => (order[a.status] - order[b.status]) || a.name.localeCompare(b.name))
  }, [deck])

  if (!deck) return <SkeletonPanel label="loading sub-agent mesh" />

  const active = deck.mesh.filter(n => n.status === 'working').length
  const workingTree = deck.tree.filter(n => n.status === 'working').length

  return (
    <div className="mc-sa">
      <div className="mc-sa-bar">
        <span className="mc-sa-title">[◉] SUB-AGENT DISPATCH</span>
        <span className="mc-sa-sub">
          {active} actively working · {deck.tree.length} live session{deck.tree.length === 1 ? '' : 's'} in flight
        </span>
        <span className={`mc-led ${deck.gatewayRunning ? 'green' : ''}`} />
        <span className="mc-sa-gw">{deck.gatewayRunning ? 'GW UP' : 'GW DOWN'}</span>
        <button type="button" className="mc-sa-toggle" onClick={() => setListView(v => !v)} aria-pressed={listView}>
          {listView ? '⊞ MAP' : '≡ LIST'}
        </button>
      </div>

      {err && <div className="mc-sa-err">connection lost — showing last known state</div>}

      {!listView ? (
        <div className="mc-sa-map">
          {/* Legend — status is shape + color together */}
          <div className="mc-sa-legend">
            {STATUS_ORDER.map(s => (
              <span key={s} className={`mc-sa-legend-item sg-${s}`}>
                <span className={`mc-sa-node-shape st-${STATUS_GLYPH[s].cls}`}>{STATUS_GLYPH[s].glyph}</span>
                {STATUS_GLYPH[s].label}
              </span>
            ))}
          </div>

          <div className="mc-sa-tree">
            {/* Root: Hermes */}
            {(() => { const root = sorted.find(n => n.id === 'hermes'); return root ? <Node key={root.id} node={root} onTap={setSelected} isRoot /> : null })()}
            <div className="mc-sa-children">
              {sorted.filter(n => n.id !== 'hermes' && n.parent && n.parent !== n.id).map(n => (
                <Node key={n.id} node={n} onTap={setSelected} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mc-sa-list">
          {sorted.map(n => (
            <button key={n.id} type="button" className={`mc-sa-row st-${STATUS_GLYPH[n.status].cls}`} onClick={() => setSelected(n)}>
              <span className="mc-sa-node-shape">{STATUS_GLYPH[n.status].glyph}</span>
              <span className="mc-sa-row-body">
                <span className="mc-sa-row-name">{n.name}</span>
                <span className="mc-sa-row-task">{n.currentTask?.title ?? n.role}</span>
              </span>
              <span className="mc-sa-row-right">
                <span className="mc-sa-row-status">{STATUS_GLYPH[n.status].label}</span>
                <span className="mc-sa-row-node">{n.node}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Live dispatch tree from the real session store */}
      {deck.tree.length > 0 && (
        <div className="mc-sa-sessions">
          <div className="mc-sa-sessions-head">LIVE DISPATCH · {workingTree} working / {deck.tree.length} in window</div>
          <div className="mc-sa-sessions-list">
            {deck.tree.slice(0, 8).map(n => (
              <button key={n.id} type="button" className="mc-sa-sessrow" onClick={() => setSelected(n)}>
                <span className={`mc-sa-sess-dot ${n.status === 'working' ? 'on' : ''}`} />
                <span className="mc-sa-sess-title">{n.name}</span>
                <span className="mc-sa-sess-model">{n.model || n.node}</span>
                <span className="mc-sa-sess-age">{age(n.lastSeen)} ago</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <DetailDrawer node={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
