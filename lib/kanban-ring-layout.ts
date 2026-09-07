import { ACCENT_DEFAULT, SEMANTIC } from './tokens'

export type RingTask = { id: string; status: string; priority: number; failures?: number }
export type RingLane = 'doing' | 'todo' | 'done'
export type RingTone = 'info' | 'accent' | 'success' | 'error'
export type RingNode = {
  id: string
  angle: number
  radius: number
  color: string
  tone: RingTone
  scale: number
  stage: string
  failed: boolean
}
export type RingArc = {
  fromAngle: number
  toAngle: number
  color: string
  stage: RingLane
  count: number
}
export type RingLayout = { nodes: RingNode[]; arcs: RingArc[]; maxRadius: number }

export const RING_LIMIT = 96
export const RING_RADII = { doing: 1.6, todo: 2.3, done: 3.0 } as const
export const RING_COLORS = {
  info: SEMANTIC.info.hex,
  accent: ACCENT_DEFAULT,
  success: SEMANTIC.ok.hex,
  error: SEMANTIC.error.hex,
} as const
const LANES: RingLane[] = ['doing', 'todo', 'done']
const LANE_TONES = { doing: 'info', todo: 'accent', done: 'success' } as const
const TAU = Math.PI * 2

// New statuses remain visible in the pending lane; no closed status enum.
export function ringLane(status: string): RingLane {
  if (status === 'doing' || status === 'active') return 'doing'
  if (status === 'done' || status === 'archived') return 'done'
  return 'todo'
}

function isFailed(task: RingTask): boolean {
  return task.status === 'blocked' || task.status === 'failed' || (task.failures ?? 0) > 0
}

function selectionRank(task: RingTask): number {
  if (ringLane(task.status) === 'doing') return 0
  if (isFailed(task)) return 1
  return ringLane(task.status) === 'todo' ? 2 : 3
}

function hashId(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  return hash >>> 0
}

/** Arc sweep encodes each lane's share of ALL counts, including unsampled tasks. */
export function kanbanRingArcs(counts: Record<string, number>): RingArc[] {
  const totals = { doing: 0, todo: 0, done: 0 }
  for (const [stage, count] of Object.entries(counts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (Number.isFinite(count) && count > 0) totals[ringLane(stage)] += count
  }
  const total = totals.doing + totals.todo + totals.done
  return LANES.filter(lane => totals[lane] > 0).map(lane => ({
    fromAngle: -Math.PI / 2,
    toAngle: -Math.PI / 2 + TAU * totals[lane] / total,
    color: RING_COLORS[LANE_TONES[lane]],
    stage: lane,
    count: totals[lane],
  }))
}

/** Time deliberately does not affect layout; orbit drift belongs to the renderer. */
export function layoutKanbanRing(tasks: RingTask[], _now?: number): RingLayout {
  const counts: Record<string, number> = Object.create(null)
  for (const task of tasks) counts[task.status] = (counts[task.status] ?? 0) + 1
  const selected = [...tasks].sort((a, b) =>
    selectionRank(a) - selectionRank(b) || b.priority - a.priority ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  ).slice(0, RING_LIMIT)
  const nodes: RingNode[] = []
  for (const lane of LANES) {
    const members = selected.filter(task => ringLane(task.status) === lane)
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    const spacing = TAU / Math.max(1, members.length)
    // Less than 6 degrees, and less than half a slot so neighbors cannot cross.
    const jitterBound = Math.min(Math.PI / 36, spacing * 0.24)
    members.forEach((task, index) => {
      const failed = isFailed(task)
      const tone = failed ? 'error' : LANE_TONES[lane]
      nodes.push({
        id: task.id,
        angle: index * spacing + (hashId(task.id) / 0xffffffff * 2 - 1) * jitterBound,
        radius: RING_RADII[lane],
        color: RING_COLORS[tone],
        tone,
        scale: (lane === 'done' ? 0.048 : 0.065) * (1 + Math.min(4, Math.max(0, task.priority)) * 0.08),
        stage: task.status,
        failed,
      })
    })
  }
  const arcs = kanbanRingArcs(counts)
  return { nodes, arcs, maxRadius: arcs.reduce((radius, arc) => Math.max(radius, RING_RADII[arc.stage]), 0) }
}
