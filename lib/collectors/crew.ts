/** Compatibility for older mission-data consumers. Only the crew projection
 * supplies status/model; static persona metadata is decoration. */
import type { CrewId, CrewMember } from '../types'
import type { E } from '../pt/contract'
import type { CrewProjection } from '../pt/crew'
import { CREW } from './shared'

export function legacyCrew(envelope: E<CrewProjection>): CrewMember[] {
  return (Object.keys(CREW) as CrewId[]).map(id => {
    const row = envelope.data?.members.find(member => member.id === id)
    return { ...CREW[id], model: row?.model.value ?? undefined,
      status: row?.worker.kind === 'confirmed-worker' ? 'active' : row?.needsIntervention ? 'attention' : 'unknown',
      signal: row ? `${row.kind} · ${row.worker.freshness} · presence ${row.presence.freshness}` : 'unknown',
      lastRun: row?.worker.sourceAt ?? undefined }
  })
}
