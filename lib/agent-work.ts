/**
 * Pure classification helpers for the live office floor.
 *
 * Kept free of runtime imports so the tricky judgement calls — what counts as
 * "live", and what kind of work a tool call represents — are unit-testable
 * without a database or config. lib/agent-activity.ts does the I/O.
 */
import type { WorkKind } from './types'

/** A session counts as live only if it produced a message this recently. */
export const LIVE_WINDOW_MS = 5 * 60 * 1000

/**
 * What kind of work a tool call represents. Drives which animation a desk
 * plays, so the floor reads as "building / researching / writing" at a glance.
 * Tool names come from the agent's own vocabulary (messages.tool_name).
 */
export function workKindForTool(tool: string | null | undefined): WorkKind {
  if (!tool) return 'thinking'
  const t = tool.toLowerCase()
  if (/^(terminal|patch|write_file|execute_code|process|delegate_task)$/.test(t)) return 'building'
  if (/^(read_file|search_files|session_search|vision_analyze|skill_view|skills_list)$/.test(t)) return 'research'
  if (t.startsWith('browser_')) return 'research'
  if (/^(todo|memory|send_message|cronjob|clarify|skill_manage)$/.test(t)) return 'content'
  return 'thinking'
}

/** Majority work kind across a session's recent tool calls. */
export function dominantKind(tools: (string | null | undefined)[]): WorkKind {
  const tally = new Map<WorkKind, number>()
  for (const t of tools) {
    if (!t) continue
    const k = workKindForTool(t)
    tally.set(k, (tally.get(k) ?? 0) + 1)
  }
  let best: WorkKind = 'thinking'
  let n = 0
  for (const [k, c] of tally) if (c > n) { best = k; n = c }
  return best
}

/**
 * True if `epoch` falls inside the liveness window ending at `now`.
 * Accepts seconds or milliseconds. Recency — not `sessions.ended_at IS NULL` —
 * decides liveness: the store is full of open-but-abandoned sessions.
 */
export function isLive(epoch: number | null | undefined, now: number, windowMs = LIVE_WINDOW_MS): boolean {
  if (!epoch || !Number.isFinite(epoch)) return false
  const ms = epoch > 1e12 ? epoch : epoch * 1000
  return now - ms <= windowMs && ms <= now + 60_000 // tolerate small clock skew
}
