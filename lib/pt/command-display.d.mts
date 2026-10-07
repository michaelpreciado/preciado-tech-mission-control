import type { Command, PracticeArea } from './catalog'
import type { Freshness } from './contract'
type State = { freshness: Freshness; blocked: boolean; label: string; lastKnown: boolean }
export type CommandRow = Command & { badge: (State & { value: number | null; snapshotId: string | null }) | null }
export type CommandView = State & {
  error: string | null; snapshotId: string | null; dataRevision: string | null; generatedAt: string | null; validUntil: string | null
  commands: CommandRow[]
  groups: { practiceArea: PracticeArea; commands: CommandRow[] }[]
}
export function compatibleCommands(envelope: unknown, catalog: readonly Readonly<Command>[]): boolean
export function commandDisplay(envelope: unknown, catalog: readonly Readonly<Command>[], practiceAreas: readonly PracticeArea[], now?: number, failed?: boolean, error?: string | null): CommandView
