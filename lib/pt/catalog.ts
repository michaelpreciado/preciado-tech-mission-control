/** Frozen command destinations. Consumers resolve these relative paths against
 * their portal origin; desktop actions are IDs, never executable shell strings.
 * Desktop packaging is generated from this file, never maintained separately. */
import { commandDisplay } from './command-display.mjs'
import type { E } from './contract'
export const PRACTICE_AREAS = ['Web Development', 'AI Solutions', 'Tech Advisory'] as const
export type PracticeArea = typeof PRACTICE_AREAS[number]
export type DestinationId = 'pipeline' | 'crew' | 'command' | 'deliverables'

export type Command = {
  id: DestinationId
  label: string
  practiceArea: PracticeArea
  webPath: `/${string}`
  desktopActionId: `mp.preciadoTech.${DestinationId}`
  enabled: boolean
  blockedReason: string | null
  /** Reference a canonical projection; this catalog never computes badge counts. */
  badgeRef: { destination: DestinationId; fact: string } | null
}

export const COMMAND_CATALOG: readonly Readonly<Command>[] = Object.freeze([
  Object.freeze({ id: 'pipeline', label: 'Pipeline', practiceArea: 'Web Development', webPath: '/pipeline', desktopActionId: 'mp.preciadoTech.pipeline', enabled: true, blockedReason: null, badgeRef: Object.freeze({ destination: 'pipeline', fact: 'pendingDecisionCount' }) } as const),
  Object.freeze({ id: 'crew', label: 'Crew', practiceArea: 'AI Solutions', webPath: '/crew', desktopActionId: 'mp.preciadoTech.crew', enabled: true, blockedReason: null, badgeRef: Object.freeze({ destination: 'crew', fact: 'counts.needsIntervention' }) } as const),
  Object.freeze({ id: 'command', label: 'Command', practiceArea: 'Tech Advisory', webPath: '/command', desktopActionId: 'mp.preciadoTech.command', enabled: false, blockedReason: 'destination_not_implemented', badgeRef: null } as const),
  Object.freeze({ id: 'deliverables', label: 'Deliverables', practiceArea: 'Web Development', webPath: '/deliverables', desktopActionId: 'mp.preciadoTech.deliverables', enabled: true, blockedReason: null, badgeRef: null } as const),
])

export const COMMAND_GROUPS = Object.freeze(PRACTICE_AREAS.map(practiceArea => Object.freeze({
  practiceArea,
  commands: Object.freeze(COMMAND_CATALOG.filter(command => command.practiceArea === practiceArea)),
})))

export const COMMAND_ACTION_IDS = Object.freeze(COMMAND_CATALOG.map(command => command.desktopActionId))
export type BadgeSnapshot = E<{ facts: Record<string, number | null> }>
export type CommandsProjection = {
  commands: readonly Readonly<Command>[]
  referencedSnapshots: Partial<Record<DestinationId, BadgeSnapshot>>
}

/** The palette and native collector use the same display policy. */
export function paletteSnapshot(envelope: unknown, now = Date.now(), failed = false, error: string | null = null) {
  return commandDisplay(envelope, COMMAND_CATALOG, PRACTICE_AREAS, now, failed, error)
}
