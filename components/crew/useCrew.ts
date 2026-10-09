'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-base'
import { CADENCE, type E } from '@/lib/pt/contract'
import type { CrewProjection, CrewRow } from '@/lib/pt/crew'
import { crewDisplay, compatibleCrewEnvelope } from '@/lib/pt/crew-display.mjs'

export type CrewView = Omit<ReturnType<typeof crewDisplay>, 'rows' | 'counts'> & { rows: (Omit<CrewRow, 'tasks' | 'lastMessageAt' | 'currentTask'> & { currentTask: Pick<NonNullable<CrewRow['currentTask']>, 'id' | 'title' | 'status'> | null })[]; counts: CrewProjection['counts'] | null }
export function useCrew(): CrewView {
  const [snapshot, setSnapshot] = useState<E<CrewProjection> | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const controller = new AbortController()
    let busy = false
    const poll = async () => {
      if (busy) return
      busy = true
      try {
        const response = await apiFetch('/api/crew', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw Error([401, 403].includes(response.status) ? 'access_denied' : 'source_unavailable')
        const body = await response.json()
        if (!compatibleCrewEnvelope(body) || body.data === null) throw Error('invalid_snapshot')
        if (!controller.signal.aborted) { setSnapshot(body); setFailure(null) }
      } catch (error) { if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : 'transport_failed') }
      finally { busy = false }
    }
    void poll()
    const refresh = window.setInterval(() => { if (document.visibilityState === 'visible') void poll() }, CADENCE.crew.pollMs)
    const clock = window.setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()) }, 1000)
    return () => { controller.abort(); window.clearInterval(refresh); window.clearInterval(clock) }
  }, [])
  return crewDisplay(snapshot, now, failure !== null, failure) as CrewView
}
