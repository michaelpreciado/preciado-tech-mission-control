'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-base'
import type { PipelineData } from '@/lib/types'
import { useLiveData } from './LiveDataProvider'

export function BridgeStrip() {
  const { data } = useLiveData()
  const [followups, setFollowups] = useState<PipelineData['followups']>(undefined)

  useEffect(() => {
    let inFlight: AbortController | null = null
    const refresh = async () => {
      inFlight?.abort()
      const controller = new AbortController()
      inFlight = controller
      try {
        const response = await apiFetch('/api/pipeline', { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const pipeline: Pick<PipelineData, 'followups'> = await response.json()
        if (!controller.signal.aborted) setFollowups(pipeline.followups)
      } catch {
        if (!controller.signal.aborted) setFollowups(undefined)
      }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 60_000)
    return () => {
      window.clearInterval(timer)
      inFlight?.abort()
    }
  }, [])

  const warningCount = data ? data.warnings.length + Object.keys(data.collectorErrors ?? {}).length : 0

  return (
    <div className="mc-bridge" role="status" aria-live="polite">
      <span className="mc-bridge-dot" aria-hidden="true" />
      {data ? (
        <>
          <span className="mc-bridge-seg"><b>{data.kanban.runningTasks}</b> RUNNING</span>
          <span className="mc-bridge-seg"><b>{data.kanban.openTasks}</b> OPEN</span>
          {warningCount > 0 && <span className="mc-bridge-seg is-warn"><b>{warningCount}</b> WARN</span>}
          {followups && (followups.overdue > 0 ? (
            <span className="mc-bridge-seg is-overdue"><b>{followups.overdue}</b> FOLLOW-UP{followups.overdue === 1 ? '' : 'S'} OVERDUE</span>
          ) : followups.upcoming > 0 ? (
            <span className="mc-bridge-seg is-due"><b>{followups.upcoming}</b> FOLLOW-UPS{followups.nextDue && <> · NEXT <b>{followups.nextDue.slice(5, 10)}</b></>}</span>
          ) : null)}
        </>
      ) : <span className="mc-bridge-seg is-quiet">CONNECTING</span>}
    </div>
  )
}
