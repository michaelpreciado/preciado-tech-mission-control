/**
 * TickTick Open API client for the weekly ASCII calendar.
 *
 * Auth: TickTick's Open API is OAuth2 — this reads a bearer token you've
 * already obtained (keys.ticktickToken / TICKTICK_API_TOKEN), it does not
 * perform the authorize/token exchange itself. No token = disabled, degrades
 * to an empty week rather than erroring.
 *
 * Docs: https://developer.ticktick.com/docs#/openapi
 */
import { getConfig } from './config'
import type { TickTickTask, TickTickWeekData } from './types'

const BASE = 'https://api.ticktick.com/open/v1'

type RawProject = { id: string; name?: string }
type RawTask = {
  id: string
  title?: string
  startDate?: string
  dueDate?: string
  isAllDay?: boolean
  status?: number
  priority?: number
}
type RawProjectData = { tasks?: RawTask[] }

async function ttFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`TickTick API ${path} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** All incomplete tasks across every TickTick project. '' token = disabled. */
export async function fetchTickTickWeek(): Promise<TickTickWeekData> {
  const token = getConfig().keys.ticktickToken
  if (!token) return { configured: false, tasks: [] }

  try {
    const projects = await ttFetch<RawProject[]>('/project', token)
    const perProject = await Promise.all(
      projects.map(async p => {
        try {
          const data = await ttFetch<RawProjectData>(`/project/${p.id}/data`, token)
          return (data.tasks ?? [])
            .map((t): TickTickTask | null => {
              const date = t.startDate ?? t.dueDate
              if (!date) return null
              return {
                id: t.id,
                title: t.title ?? '(untitled)',
                date,
                isAllDay: t.isAllDay,
                status: t.status,
                priority: t.priority,
                projectName: p.name,
              }
            })
            .filter((t): t is TickTickTask => t !== null)
        } catch {
          return [] // one bad project shouldn't sink the whole week
        }
      }),
    )
    return { configured: true, tasks: perProject.flat() }
  } catch (err) {
    return { configured: true, tasks: [], error: (err as Error).message }
  }
}
