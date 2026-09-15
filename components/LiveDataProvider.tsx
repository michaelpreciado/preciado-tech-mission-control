'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { MissionData } from '@/lib/types'
import { apiFetch, apiUrl } from '@/lib/api-base'
import type { BusEvent } from '@/lib/telemetry-types'
import { ORB_OVERLAY_COOLDOWN_MS, parseOrbOverlayEvent, type OrbOverlay } from '@/lib/orb-overlay'

const BUS_EVENT_NAMES = [
  'task.created', 'task.assigned', 'task.progress', 'task.done', 'task.failed', 'task.completed', 'task.closed', 'task.merge', 'task.merged',
  'task.sync', 'task.synced', 'task.synchronize', 'task.synchronized', 'merge', 'merged', 'sync', 'synced',
  'synchronize', 'synchronized', 'agent.status', 'message',
] as const
const MAX_LIVE_EVENTS = 40
type EventStreamState = 'connecting' | 'live' | 'stale'

type LiveCtx = {
  data: MissionData | null
  isLive: boolean
  isLoading: boolean
  error: string | null
  lastUpdated: number | null
  events: BusEvent[]
  eventStream: EventStreamState
  refresh: () => Promise<void>
}

export type OrbActivitySignal = {
  lastEventAt: number | null
  runningTaskCount: number
  now: number
  overlay: OrbOverlay | null
}

const Ctx = createContext<LiveCtx>({ data: null, isLive: false, isLoading: true, error: null, lastUpdated: null, events: [], eventStream: 'connecting', refresh: async () => {} })
const OrbActivityCtx = createContext<OrbActivitySignal>({ lastEventAt: null, runningTaskCount: 0, now: 0, overlay: null })

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
  const seenEventIdsRef = useRef<Set<number>>(new Set())
  const [events, setEvents] = useState<BusEvent[]>([])
  const [eventStream, setEventStream] = useState<EventStreamState>('connecting')
  const [activityClock, setActivityClock] = useState(0)
  const [orbOverlay, setOrbOverlay] = useState<OrbOverlay | null>(null)
  const lastOrbOverlayAtRef = useRef<number | null>(null)
  const orbOverlayTimerRef = useRef<number | null>(null)

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

    const jsonPromise = apiFetch('/api/mission-control', {
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
    // flooding the API; EventSource reconnects after transient errors.
    let es: EventSource | null = null
    let lastEvt = 0
    const onBusEvent = (message: MessageEvent<string>) => {
      const now = Date.now()
      lastSseEventRef.current = now
      if (document.visibilityState === 'visible') setActivityClock(now)
      try {
        const event = JSON.parse(message.data) as BusEvent
        if (typeof event.id === 'number' && !seenEventIdsRef.current.has(event.id)) {
          seenEventIdsRef.current.add(event.id)
          if (seenEventIdsRef.current.size > MAX_LIVE_EVENTS * 2) {
            const oldest = [...seenEventIdsRef.current].sort((a, b) => a - b)[0]
            if (oldest !== undefined) seenEventIdsRef.current.delete(oldest)
          }
          setEvents(previous => [event, ...previous].slice(0, MAX_LIVE_EVENTS))

          const parsedOverlay = parseOrbOverlayEvent(event, now)
          const lastOverlayAt = lastOrbOverlayAtRef.current
          if (parsedOverlay && (lastOverlayAt == null || now - lastOverlayAt >= ORB_OVERLAY_COOLDOWN_MS)) {
            lastOrbOverlayAtRef.current = now
            setOrbOverlay(parsedOverlay)
            if (orbOverlayTimerRef.current != null) window.clearTimeout(orbOverlayTimerRef.current)
            orbOverlayTimerRef.current = window.setTimeout(() => {
              setOrbOverlay(null)
              orbOverlayTimerRef.current = null
            }, parsedOverlay.until - now)
          }
        }
      } catch {
        // Keepalive frames and non-JSON bus messages still count as stream activity.
      }
      if (now - lastEvt < 6000) return
      lastEvt = now
      if (document.visibilityState === 'visible' && navigator.onLine) void refreshThrottled()
    }
    try {
      es = new EventSource(apiUrl('/api/events'))
      es.onmessage = onBusEvent
      for (const eventName of BUS_EVENT_NAMES) es.addEventListener(eventName, onBusEvent as EventListener)
      es.onopen = () => setEventStream('live')
      es.onerror = () => setEventStream('stale')
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
      if (orbOverlayTimerRef.current != null) window.clearTimeout(orbOverlayTimerRef.current)
    }
  }, [refresh, refreshThrottled])

  const contextValue = useMemo(() => ({
    data, isLive, isLoading, error, lastUpdated, events, eventStream, refresh
  }), [data, isLive, isLoading, error, lastUpdated, events, eventStream, refresh])

  const orbActivity = useMemo<OrbActivitySignal>(() => ({
    lastEventAt: lastSseEventRef.current,
    runningTaskCount: data?.kanban?.runningTasks ?? 0,
    now: activityClock,
    overlay: orbOverlay,
  }), [activityClock, data?.kanban?.runningTasks, orbOverlay])

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
