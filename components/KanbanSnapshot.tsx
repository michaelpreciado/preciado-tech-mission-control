'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { HermesTask } from '@/lib/types'
import { apiFetch } from '@/lib/api-base'
import { summarizeKanban, type KanbanSummary } from '@/lib/flight-strip'

const POLL_MS = 30_000

export type KanbanSnapshotValue = {
  tasks: HermesTask[]
  /** null until the first successful read; never a guessed number. */
  summary: KanbanSummary | null
  loading: boolean
  error: string | null
  lastUpdated: number | null
  now: number
  refresh: () => void
}

const EMPTY: KanbanSnapshotValue = {
  tasks: [], summary: null, loading: true, error: null, lastUpdated: null, now: 0, refresh: () => {},
}

const Ctx = createContext<KanbanSnapshotValue>(EMPTY)

/** One shared, read-only poll of /api/kanban for the nav badge, Home brief and Crew roster. */
export function KanbanSnapshotProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<HermesTask[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await apiFetch('/api/kanban', { cache: 'no-store', signal })
      if (!res.ok) throw new Error(`Task board returned ${res.status}`)
      const body = await res.json()
      if (body?.available === false) throw new Error('Task board source is unavailable')
      setTasks(Array.isArray(body?.tasks) ? body.tasks : [])
      setLoaded(true)
      setError(null)
      const at = Date.now()
      setLastUpdated(at)
      setNow(at)
    } catch (e) {
      if (signal?.aborted) return
      setError(e instanceof Error ? e.message : 'Task board unavailable')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(controller.signal)
    }, POLL_MS)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [load])

  const summary = useMemo(() => (loaded ? summarizeKanban(tasks, now) : null), [loaded, tasks, now])
  const value = useMemo<KanbanSnapshotValue>(
    () => ({ tasks, summary, loading, error, lastUpdated, now, refresh: () => { void load() } }),
    [tasks, summary, loading, error, lastUpdated, now, load],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useKanbanSnapshot() {
  return useContext(Ctx)
}
