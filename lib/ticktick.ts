/** Read-only TickTick Open API calendar collector (including Inbox).
 * Docs: https://developer.ticktick.com/docs/index.html#/openapi
 */
import { getConfig } from './config'
import type { TickTickTask, TickTickWeekData } from './types'

const BASE = 'https://api.ticktick.com/open/v1'
const LIMIT = 200
const DAY = 86400000
const MAX_FILTER_REQUESTS = 64

type RawProject = { id: string; name?: string; color?: string }
type RawTask = {
  id: string
  projectId: string
  title?: string
  startDate?: string
  dueDate?: string
  isAllDay?: boolean
  timeZone?: string
  status?: number
  priority?: number
}

// Only our own messages reach the browser; transport/JSON errors can contain
// response bodies, request headers, or other sensitive upstream details.
class TickTickError extends Error {}

async function ttFetch(path: string, token: string, body?: object): Promise<unknown> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new TickTickError(`TickTick API ${path} → HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    if (err instanceof TickTickError) throw err
    throw new TickTickError(`TickTick API ${path} could not be read`)
  }
}

function records(value: unknown, path: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some(v => !v || typeof v !== 'object' || typeof v.id !== 'string')) {
    throw new TickTickError(`TickTick API ${path} returned an invalid response`)
  }
  return value
}

function calendarDate(task: RawTask): string | undefined {
  const date = task.startDate || task.dueDate
  if (!date) return undefined
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(date)) {
    throw new TickTickError('TickTick returned an invalid task date')
  }
  const day = date.slice(0, 10)
  // Date.parse otherwise silently rolls dates such as February 30 forward.
  const midnight = new Date(`${day}T00:00:00Z`)
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== day || !Number.isFinite(Date.parse(date))) {
    throw new TickTickError('TickTick returned an invalid task date')
  }
  // The existing UI uses new Date(date) in the viewer's zone. A floating local
  // midnight preserves date-only values, unlike JavaScript's UTC date parsing.
  if (date.length === 10) return `${day}T00:00:00`
  if (task.isAllDay) {
    let localDay = day
    if (task.timeZone) {
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: task.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(new Date(date))
        const part = (type: string) => parts.find(p => p.type === type)!.value
        localDay = `${part('year')}-${part('month')}-${part('day')}`
      } catch {
        throw new TickTickError('TickTick returned an invalid task time zone')
      }
    }
    return `${localDay}T00:00:00`
  }
  return date // Timed events retain their offset/instant for local rendering.
}

/** Historical name: return all calendar dates because navigation is client-side. */
export async function fetchTickTickWeek(): Promise<TickTickWeekData> {
  const tasks = new Map<string, TickTickTask>()
  const errors = new Set<string>()
  try {
    const token = getConfig().keys.ticktickToken
    if (!token) return { configured: false, tasks: [] }

    let projects: RawProject[] = []
    try {
      projects = records(await ttFetch('/project', token), '/project') as RawProject[]
    } catch (err) {
      errors.add((err as TickTickError).message)
    }
    const projectById = new Map(projects.map(p => [p.id, p]))
    let requests = 0
    const stamp = (ms: number) => new Date(ms).toISOString().replace('.000Z', '+0000')

    async function collect(start?: number, end?: number): Promise<void> {
      if (++requests > MAX_FILTER_REQUESTS) {
        throw new TickTickError('TickTick calendar is incomplete: date-range request limit reached')
      }
      // POST is the documented read-only filter operation. Omitting projectIds
      // is essential: Inbox is not necessarily present in GET /project.
      const raw = records(await ttFetch('/task/filter', token, {
        status: [0],
        ...(start !== undefined && { startDate: stamp(start) }),
        ...(end !== undefined && { endDate: stamp(end) }),
      }), '/task/filter') as RawTask[]
      for (const t of raw) {
        if (t.status === 2) continue
        if (typeof t.projectId !== 'string') throw new TickTickError('TickTick returned an invalid task project')
        const date = calendarDate(t)
        if (!date) continue
        const project = projectById.get(t.projectId)
        tasks.set(t.id, {
          id: t.id, title: t.title ?? '(untitled)', date,
          isAllDay: t.isAllDay || (t.startDate || t.dueDate)?.length === 10,
          status: t.status, priority: t.priority, projectId: t.projectId,
          projectName: project?.name, projectColor: project?.color,
        })
      }
      if (raw.length < LIMIT) return

      // The API has no documented pagination. Bisect saturated ranges with an
      // inclusive shared boundary, then dedupe IDs. Keep outer bounds open so
      // previous/next month navigation has no arbitrary retrieval horizon.
      // Filtering uses startDate: a capped unbounded response cannot prove that
      // due-only tasks were all returned, even after every dated slice succeeds.
      errors.add('TickTick calendar may be incomplete: the 200-task filter limit was reached; tasks without start dates may be missing')
      const low = start ?? Date.parse('0001-01-01T00:00:00Z')
      const high = end ?? Date.parse('9999-12-31T00:00:00Z')
      if (high - low <= DAY) {
        throw new TickTickError('TickTick calendar is incomplete: at least 200 tasks share a date range')
      }
      const middle = start === undefined && end === undefined
        ? Math.floor(Date.now() / DAY) * DAY
        : Math.floor((low + (high - low) / 2) / DAY) * DAY
      // Sequential traversal bounds load on TickTick; retain tasks already read
      // and always expose failures rather than claiming an empty/successful load.
      await collect(start, middle)
      await collect(middle, end)
    }
    await collect()
  } catch (err) {
    errors.add(err instanceof TickTickError ? err.message : 'TickTick calendar could not be loaded')
  }
  return { configured: true, tasks: [...tasks.values()], ...(errors.size && { error: [...errors].join('; ') }) }
}
