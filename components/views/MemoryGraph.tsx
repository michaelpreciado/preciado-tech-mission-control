'use client'

import { useEffect, useMemo, useState } from 'react'
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide, forceX, forceY } from 'd3-force'
import type { SimulationNodeDatum } from 'd3-force'
import { Window, SkeletonPanel, EmptyTerminal, Clamp, Button, fmtDate } from '../ui'
import { MemoryStream } from './MemoryStream'
import { CATEGORICAL } from '@/lib/chart-colors'
import type { MemoryGraph as MemoryGraphData, MemoryGraphNode } from '@/lib/types'

const POLL_MS = 180_000
const WIDTH = 900
const HEIGHT = 560
const MAX_CHIPS = 24

type SimNode = MemoryGraphNode & SimulationNodeDatum
type SimLink = { source: SimNode | string; target: SimNode | string; kind: 'link' | 'tag' }

function folderColor(folder: string) {
  const top = folder.split('/')[0] || '(root)'
  let h = 0
  for (let i = 0; i < top.length; i++) h = (h * 31 + top.charCodeAt(i)) | 0
  return CATEGORICAL[Math.abs(h) % CATEGORICAL.length]
}

/** Runs the d3-force simulation synchronously to a stable layout — a
 * fixed-size vault graph doesn't need a live tick loop, so we just settle
 * it once per node-set and render the result as static SVG. */
function layout(nodes: MemoryGraphNode[], edges: { source: string; target: string; kind: 'link' | 'tag' }[]) {
  const idSet = new Set(nodes.map(n => n.id))
  const simNodes: SimNode[] = nodes.map((n, i) => ({
    ...n,
    x: WIDTH / 2 + Math.cos(i) * 60 + (Math.random() - 0.5) * 30,
    y: HEIGHT / 2 + Math.sin(i) * 60 + (Math.random() - 0.5) * 30,
  }))
  const simLinks: SimLink[] = edges
    .filter(e => idSet.has(e.source) && idSet.has(e.target))
    .map(e => ({ source: e.source, target: e.target, kind: e.kind }))

  const sim = forceSimulation(simNodes)
    .force('charge', forceManyBody<SimNode>().strength(d => (d.kind === 'tag' ? -160 : -70)))
    .force('link', forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(l => (l.kind === 'tag' ? 34 : 78)).strength(0.55))
    .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
    .force('collide', forceCollide<SimNode>().radius(d => (d.kind === 'tag' ? 15 + Math.min(10, (d.noteCount ?? 1) / 4) : 8)))
    .force('x', forceX(WIDTH / 2).strength(0.02))
    .force('y', forceY(HEIGHT / 2).strength(0.02))
    .stop()
  for (let i = 0; i < 260; i++) sim.tick()

  return { nodes: simNodes, links: simLinks }
}

export function MemoryGraphView() {
  const [data, setData] = useState<MemoryGraphData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [listView, setListView] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/memory/graph', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as MemoryGraphData
        if (!cancelled) { setData(json); setLoadError(false) }
      } catch {
        if (!cancelled) setLoadError(true)
      }
    }
    load()
    const t = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  // Base node set (before search/tag filtering) — drives the physics layout,
  // so typing in the search box never re-settles the graph, only fades nodes.
  const baseNodes = useMemo(() => {
    if (!data) return []
    return showAll ? data.nodes : data.nodes.filter(n => n.kind === 'tag' || !n.isolated)
  }, [data, showAll])

  const { nodes: positioned, links } = useMemo(() => layout(baseNodes, data?.edges ?? []), [baseNodes, data])

  const tagChips = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of baseNodes) if (n.kind === 'note') for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CHIPS)
  }, [baseNodes])

  const query = search.trim().toLowerCase()
  const matches = (n: MemoryGraphNode) => {
    const searchOk = !query || n.title.toLowerCase().includes(query) || n.tags.some(t => t.includes(query))
    const tagOk = activeTags.length === 0
      || (n.kind === 'tag' ? activeTags.includes(n.id.slice(4)) : n.tags.some(t => activeTags.includes(t)))
    return searchOk && tagOk
  }

  const selected = selectedId ? positioned.find(n => n.id === selectedId) ?? null : null
  const neighborIds = useMemo(() => {
    if (!selected) return null
    const set = new Set<string>([selected.id])
    for (const l of links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id
      const t = typeof l.target === 'string' ? l.target : l.target.id
      if (s === selected.id) set.add(t)
      if (t === selected.id) set.add(s)
    }
    return set
  }, [selected, links])

  const toggleTag = (tag: string) => setActiveTags(cur => cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag])

  if (loadError) return <EmptyTerminal label="failed to load memory graph" />
  if (!data) return <SkeletonPanel label="loading vault graph" />
  if (!data.totalNotes) return <EmptyTerminal label="no vault configured — see /setup" />

  return (
    <Window
      tag="◈"
      title="OBSIDIAN NODE GRAPH"
      meta={`${data.connectedNotes}/${data.totalNotes} notes connected`}
    >
      <div className="mc-mem-toolbar">
        <input
          type="search"
          className="mc-mem-search"
          placeholder="search notes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search memory notes"
        />
        <div className="mc-mem-actions">
          <Button variant="ghost" active={showAll} onClick={() => setShowAll(v => !v)}>
            {showAll ? `SHOWING ALL ${data.totalNotes}` : `SHOW ALL ${data.totalNotes} NOTES`}
          </Button>
          <Button variant="ghost" active={listView} onClick={() => setListView(v => !v)}>
            {listView ? 'GRAPH VIEW' : 'LIST VIEW'}
          </Button>
        </div>
      </div>

      {tagChips.length > 0 && (
        <div className="mc-mem-tags">
          {tagChips.map(([tag, count]) => (
            <Button
              key={tag}
              variant="ghost"
              className="mc-mem-chip"
              active={activeTags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              #{tag} <span className="mc-mem-chip-count">{count}</span>
            </Button>
          ))}
          {activeTags.length > 0 && (
            <Button variant="ghost" onClick={() => setActiveTags([])}>CLEAR</Button>
          )}
        </div>
      )}

      {listView ? (
        <MemoryStream />
      ) : (
        <div className="mc-mem-body">
          <div className="mc-mem-svg-wrap">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mc-mem-svg" role="img" aria-label="Vault note graph">
              <g className="mc-mem-edges">
                {links.map((l, i) => {
                  const s = typeof l.source === 'string' ? null : l.source
                  const t = typeof l.target === 'string' ? null : l.target
                  if (!s || !t) return null
                  const dim = !matches(s) || !matches(t)
                  const focusDim = neighborIds && (!neighborIds.has(s.id) || !neighborIds.has(t.id))
                  return (
                    <line
                      key={i}
                      x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                      className={`mc-mem-edge mc-mem-edge-${l.kind}`}
                      opacity={dim || focusDim ? 0.08 : l.kind === 'tag' ? 0.22 : 0.4}
                    />
                  )
                })}
              </g>
              <g className="mc-mem-nodes">
                {positioned.map(n => {
                  const dim = !matches(n) || (neighborIds && !neighborIds.has(n.id))
                  const isTag = n.kind === 'tag'
                  const r = isTag ? 5 + Math.min(9, (n.noteCount ?? 1) / 3) : 5
                  const fill = isTag ? 'var(--pt-neon)' : folderColor(n.folder)
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${n.x},${n.y})`}
                      className={`mc-mem-node ${n.id === selectedId ? 'is-selected' : ''}`}
                      opacity={dim ? 0.16 : 1}
                      onClick={() => setSelectedId(cur => cur === n.id ? null : n.id)}
                      role="button"
                      tabIndex={0}
                      aria-label={n.title}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(cur => cur === n.id ? null : n.id) } }}
                    >
                      {isTag ? (
                        <rect x={-r} y={-r} width={r * 2} height={r * 2} transform="rotate(45)" fill={fill} className="mc-mem-node-shape" />
                      ) : (
                        <circle r={r} fill={fill} className="mc-mem-node-shape" />
                      )}
                      {(isTag || n.id === selectedId) && (
                        <text className="mc-mem-label" x={0} y={-r - 5} textAnchor="middle">{n.title}</text>
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>
          </div>

          <div className="mc-mem-detail">
            {selected ? (
              <>
                <div className="mc-mem-detail-title">{selected.title}</div>
                <div className="mc-mem-detail-meta">
                  {selected.folder && <span>{selected.folder}</span>}
                  {selected.updatedAt && <span>{fmtDate(selected.updatedAt)}</span>}
                </div>
                {selected.tags.length > 0 && (
                  <div className="mc-mem-detail-tags">
                    {selected.tags.map(t => <span key={t} className="mc-task-tag">#{t}</span>)}
                  </div>
                )}
                {selected.excerpt
                  ? <Clamp className="mc-mem-detail-excerpt" text={selected.excerpt} lines={6} label={selected.title} />
                  : selected.kind === 'tag' && <div className="mc-mem-detail-excerpt">{selected.noteCount} notes tagged #{selected.title.slice(1)}</div>}
                <Button variant="ghost" onClick={() => setSelectedId(null)}>CLOSE</Button>
              </>
            ) : (
              <div className="mc-mem-detail-empty">click a node to preview its excerpt</div>
            )}
          </div>
        </div>
      )}
    </Window>
  )
}
