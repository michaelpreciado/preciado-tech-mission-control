'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { MissionData } from '@/lib/types'

type LiveCtx = {
  data: MissionData | null
  isLive: boolean
  isLoading: boolean
  error: string | null
  lastUpdated: number | null
  refresh: () => Promise<void>
}

export type OrbActivitySignal = {
  lastEventAt: number | null
  runningTaskCount: number
  now: number
}

const Ctx = createContext<LiveCtx>({ data: null, isLive: false, isLoading: true, error: null, lastUpdated: null, refresh: async () => {} })
const OrbActivityCtx = createContext<OrbActivitySignal>({ lastEventAt: null, runningTaskCount: 0, now: 0 })

// Module-level deduplication: store the parsed JSON promise (not the Response)
// to avoid the body-already-consumed bug when multiple callers await the same promise.
let pendingJsonPromise: Promise<MissionData | null> | null = null
const dataCache: { data: MissionData | null; ts: number } = { data: null, ts: 0 }
const STALE_WHILE_REVALIDATE_MS = 15_000

export function LiveDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<MissionData | null>(dataCache.data)
  const [isLive, setIsLive] = useState(false)
  const [isLoading, setIsLoading] = useState(!dataCache.data)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const rafId = useRef<number | null>(null)
  const lastSseEventRef = useRef<number | null>(null)
  const [activityClock, setActivityClock] = useState(0)

  const refresh = useCallback(async () => {
    // Use cached data if still fresh (SWR pattern)
    if (dataCache.data && Date.now() - dataCache.ts < STALE_WHILE_REVALIDATE_MS) {
      // Sync local state with cache if needed (e.g. after hot reload)
      if (!data && dataCache.data) {
        setData(dataCache.data)
        setIsLive(true)
        setIsLoading(false)
      }
      return
    }

    // Deduplicate concurrent requests by sharing the parsed JSON promise
    if (pendingJsonPromise) {
      try {
        const json = await pendingJsonPromise
        if (json) {
          setData(json)
          setIsLive(true)
          setError(null)
          setLastUpdated(Date.now())
        }
      } catch {
        // Error handled by the originating caller
      }
      return
    }

    if (inFlight.current) inFlight.current.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setIsLoading(true)

    const jsonPromise = fetch('/api/mission-control', {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json) throw new Error('Empty response')
      return json as MissionData
    })

    pendingJsonPromise = jsonPromise

    try {
      const json = await jsonPromise
      setData(json)
      dataCache.data = json
      dataCache.ts = Date.now()
      setIsLive(true)
      setError(null)
      setLastUpdated(Date.now())
    } catch (caught) {
      const err = caught as Error
      if (err.name !== 'AbortError') {
        // warn, not error: "Failed to fetch" here is usually just a fetch
        // cancelled by navigation, and offline states are surfaced in the UI
        console.warn('[LiveData]', err.message)
        setIsLive(false)
        setError(err.message || 'Could not refresh live data.')
      }
    } finally {
      if (inFlight.current === controller) inFlight.current = null
      pendingJsonPromise = null
      setIsLoading(false)
    }
  }, [data])

  // Throttle refresh using requestAnimationFrame to avoid layout thrashing
  const refreshThrottled = useCallback(() => {
    if (rafId.current) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null
      void refresh()
    })
  }, [refresh])

  useEffect(() => {
    void refresh()

    // Check network conditions for adaptive polling
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; downlink?: number } })?.connection
    const isSlow = connection?.saveData || /(^2g$|^slow-2g$)/.test(connection?.effectiveType || '')
    const downlink = connection?.downlink ?? 10
    const intervalMs = isSlow ? 120_000 : downlink < 1 ? 60_000 : 30_000

    const tick = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void refreshThrottled()
      }
    }
    const timer = window.setInterval(tick, intervalMs)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshThrottled()
        const last = lastSseEventRef.current
        if (last != null && Date.now() - last <= 20_000) setActivityClock(Date.now())
      }
    }
    const onOnline = () => void refreshThrottled()
    const onOffline = () => {
      setIsLive(false)
      setError('Network disconnected. Data may be stale.')
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Live refresh: subscribe to the same-origin /api/events SSE firehose and
    // refresh when agent activity flows, so cost/leaderboard data updates in
    // near-real-time instead of only on the poll interval. Debounced to avoid
    // flooding the API (EventSource auto-reconnects, so onerror is a no-op).
    let es: EventSource | null = null
    let lastEvt = 0
    const onBusEvent = () => {
      const now = Date.now()
      lastSseEventRef.current = now
      if (document.visibilityState === 'visible') setActivityClock(now)
      if (now - lastEvt < 6000) return
      lastEvt = now
      if (document.visibilityState === 'visible' && navigator.onLine) void refreshThrottled()
    }
    try {
      es = new EventSource('/api/events')
      es.onmessage = onBusEvent
      es.onerror = () => { /* EventSource reconnects on its own */ }
    } catch { /* noop */ }

    // Only tick while an SSE event can still affect the orb. This makes the
    // 20-second active expiry timely without a permanent provider heartbeat.
    const activityTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const last = lastSseEventRef.current
      if (last != null && Date.now() - last <= 20_000) setActivityClock(Date.now())
    }, 1_000)

    return () => {
      clearInterval(timer)
      clearInterval(activityTimer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      es?.close()
      inFlight.current?.abort()
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [refresh, refreshThrottled])

  const contextValue = useMemo(() => ({
    data, isLive, isLoading, error, lastUpdated, refresh
  }), [data, isLive, isLoading, error, lastUpdated, refresh])

  const orbActivity = useMemo<OrbActivitySignal>(() => ({
    lastEventAt: lastSseEventRef.current,
    runningTaskCount: data?.kanban?.runningTasks ?? 0,
    now: activityClock,
  }), [activityClock, data?.kanban?.runningTasks])

  return (
    <Ctx.Provider value={contextValue}>
      <OrbActivityCtx.Provider value={orbActivity}>{children}</OrbActivityCtx.Provider>
    </Ctx.Provider>
  )
}

export function useLiveData() {
  return useContext(Ctx)
}

export function useOrbActivity() {
  return useContext(OrbActivityCtx)
}
