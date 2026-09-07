import { ACCENT_DEFAULT, SEMANTIC } from './tokens'

export type OrbitLead = { id: string; stage: string; score?: number; approved?: boolean; blocked?: boolean; progress?: number }
export type OrbitTone = 'info' | 'warn' | 'success' | 'error' | 'muted'
export type OrbitNode = {
  id: string; angle: number; radius: number; color: string; tone: OrbitTone
  scale: number; failed: boolean; businessName: string
}
export type OrbitPlanet = Omit<OrbitNode, 'failed'> & { stage: string }
export type OrbitRing = {
  stage: string; radius: number; color: string; count: number
  nodes: OrbitNode[]; planet: OrbitPlanet | null
}
export type OrbitLayout = { orbits: OrbitRing[]; maxRadius: number }
// Optional display/status metadata supplements the deliberately small public input.
export type OrbitLeadDetails = OrbitLead & {
  businessName?: string
  approval?: { status?: 'pending' | 'approved' | 'rejected' }
}

export const ORBIT_LIMIT = 64
export const ORBIT_RADII = [3.4, 4.1, 4.8, 5.5] as const
const GROUPS = [
  ['prospecting', 'qualified', 'concept'], ['approval'],
  ['development', 'delivered'], ['shipped', 'lost'],
] as const
const LEGACY_STAGES: Record<string, string> = {
  leads_found: 'prospecting', social_scraped: 'qualified', concept_ready: 'concept',
  awaiting_approval: 'approval', in_development: 'development', completed: 'delivered',
}
export function orbitStage(stage: string): string { return LEGACY_STAGES[stage] ?? stage }
export function orbitRingIndex(stage: string): number {
  return GROUPS.findIndex(group => (group as readonly string[]).includes(orbitStage(stage)))
}
function dim(hex: string, factor: number): string {
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * factor).toString(16).padStart(2, '0')).join('')
}
const COLORS = {
  info: SEMANTIC.info.hex, warn: SEMANTIC.warn.hex, success: SEMANTIC.ok.hex,
  error: SEMANTIC.error.hex, muted: dim(ACCENT_DEFAULT, 0.3),
}
const GUIDE_COLORS = [ACCENT_DEFAULT, SEMANTIC.warn.hex, SEMANTIC.info.hex, dim(SEMANTIC.ok.hex, 0.4)]
function hashId(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  return hash >>> 0
}
const byId = (a: OrbitLead, b: OrbitLead) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0
const score = (lead: OrbitLead) => Number.isFinite(lead.score) ? lead.score! : 0
const byScore = (a: OrbitLead, b: OrbitLead) => score(b) - score(a) || byId(a, b)
const rank = (lead: OrbitLead) => ['approval', 'development'].includes(orbitStage(lead.stage)) ? 0
  : ['shipped', 'lost'].includes(orbitStage(lead.stage)) ? 2 : 1
function nodeFor(lead: OrbitLeadDetails, radius: number, angle: number): OrbitNode {
  const stage = orbitStage(lead.stage)
  const rejected = lead.approval?.status === 'rejected'
  const tone: OrbitTone = stage === 'lost' || rejected ? 'muted' : lead.blocked ? 'error'
    : lead.approval?.status === 'pending' || (stage === 'approval' && !lead.approved && lead.approval?.status !== 'approved') ? 'warn'
    : lead.approved || lead.approval?.status === 'approved' || stage === 'shipped' ? 'success'
    : stage === 'development' && lead.progress == null ? 'warn' : 'info'
  return {
    id: lead.id, angle, radius,
    color: stage === 'shipped' && tone === 'success' ? dim(COLORS.success, 0.4) : COLORS[tone],
    tone, scale: tone === 'muted' ? 0.035 : stage === 'shipped' ? 0.048 : 0.065,
    failed: tone === 'error', businessName: lead.businessName ?? lead.id,
  }
}

/** Counts may come from the uncapped API snapshot; planets use the available leads. */
export function layoutPipelineOrbit(leads: OrbitLeadDetails[], counts?: Record<string, number>): OrbitLayout {
  const members = GROUPS.map((_, i) => leads.filter(lead => orbitRingIndex(lead.stage) === i).sort(byScore))
  const planets = members.map(group => group[0])
  const selected = new Set(members.flatMap(group => group.slice(1)).sort((a, b) => rank(a) - rank(b) || byScore(a, b))
    .slice(0, ORBIT_LIMIT).map(lead => lead.id))
  const totals = members.map(group => group.length)
  if (counts) {
    totals.fill(0)
    for (const stage of Object.keys(counts).sort()) {
      const index = orbitRingIndex(stage)
      if (index >= 0 && Number.isFinite(counts[stage]) && counts[stage] > 0) totals[index] += counts[stage]
    }
  }
  return {
    orbits: GROUPS.map((group, i) => {
      const dominant = planets[i]
      const visible = members[i].filter(lead => lead.id === dominant?.id || selected.has(lead.id)).sort(byId)
      const spacing = Math.PI * 2 / Math.max(1, visible.length)
      const jitterBound = Math.min(Math.PI / 36, spacing * 0.24)
      const positioned = visible.map((lead, index) => nodeFor(lead, ORBIT_RADII[i],
        index * spacing + (hashId(lead.id) / 0xffffffff * 2 - 1) * jitterBound))
      const node = positioned.find(node => node.id === dominant?.id)
      return {
        stage: group[0], radius: ORBIT_RADII[i], color: GUIDE_COLORS[i], count: totals[i],
        nodes: positioned.filter(node => node.id !== dominant?.id),
        planet: node && dominant ? {
          id: node.id, angle: node.angle, radius: node.radius, color: node.color, tone: node.tone,
          scale: node.scale * 2.8, businessName: node.businessName, stage: orbitStage(dominant.stage),
        } : null,
      }
    }),
    maxRadius: ORBIT_RADII[3],
  }
}
