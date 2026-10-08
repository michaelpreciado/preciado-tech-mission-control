import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide, forceX, forceY } from 'd3-force'
import type { SimulationNodeDatum } from 'd3-force'

export const MEMORY_GRAPH_WIDTH = 900
export const MEMORY_GRAPH_HEIGHT = 560

/** Only what the forces read — keeps the worker message small. */
export type LayoutNode = { id: string; kind: 'note' | 'tag'; noteCount?: number }
export type LayoutEdge = { source: string; target: string; kind: 'link' | 'tag' }
export type LayoutPosition = { id: string; x: number; y: number }

type SimNode = LayoutNode & SimulationNodeDatum
type SimLink = { source: SimNode | string; target: SimNode | string; kind: 'link' | 'tag' }

/** Runs the d3-force simulation synchronously to a stable layout — a
 * fixed-size vault graph doesn't need a live tick loop, so we just settle
 * it once per node-set. Pure: runs on the main thread or in a worker. */
export function settleMemoryGraph(nodes: LayoutNode[], edges: LayoutEdge[]): LayoutPosition[] {
  const W = MEMORY_GRAPH_WIDTH, H = MEMORY_GRAPH_HEIGHT
  const idSet = new Set(nodes.map(n => n.id))
  const simNodes: SimNode[] = nodes.map((n, i) => ({
    ...n,
    x: W / 2 + Math.cos(i) * 60 + (Math.random() - 0.5) * 30,
    y: H / 2 + Math.sin(i) * 60 + (Math.random() - 0.5) * 30,
  }))
  const simLinks: SimLink[] = edges
    .filter(e => idSet.has(e.source) && idSet.has(e.target))
    .map(e => ({ source: e.source, target: e.target, kind: e.kind }))

  const sim = forceSimulation(simNodes)
    .force('charge', forceManyBody<SimNode>().strength(d => (d.kind === 'tag' ? -160 : -70)))
    .force('link', forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(l => (l.kind === 'tag' ? 34 : 78)).strength(0.55))
    .force('center', forceCenter(W / 2, H / 2))
    .force('collide', forceCollide<SimNode>().radius(d => (d.kind === 'tag' ? 15 + Math.min(10, (d.noteCount ?? 1) / 4) : 8)))
    .force('x', forceX(W / 2).strength(0.02))
    .force('y', forceY(H / 2).strength(0.02))
    .stop()
  for (let i = 0; i < 260; i++) sim.tick()

  return simNodes.map(n => ({ id: n.id, x: n.x ?? W / 2, y: n.y ?? H / 2 }))
}
