'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-base'
import type { PipelineData } from '@/lib/types'
import { useLiveData } from './LiveDataProvider'
import { Card, Chip } from './ui'
import styles from './ui.module.css'

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
    <Card className={styles.bridgeStrip} role="status" aria-live="polite">
      <span className={styles.bridgeDot} aria-hidden="true" />
      {data ? (
        <>
          <Chip tone="neutral"><b>{data.kanban.runningTasks}</b> RUNNING</Chip>
          <Chip tone="neutral"><b>{data.kanban.openTasks}</b> OPEN</Chip>
          {warningCount > 0 && <Chip tone="warn"><b>{warningCount}</b> WARN</Chip>}
          {followups && (followups.overdue > 0 ? (
            <Chip tone="bad"><b>{followups.overdue}</b> FOLLOW-UP{followups.overdue === 1 ? '' : 'S'} OVERDUE</Chip>
          ) : followups.upcoming > 0 ? (
            <Chip tone="info"><b>{followups.upcoming}</b> FOLLOW-UPS{followups.nextDue && <> · NEXT <b>{followups.nextDue.slice(5, 10)}</b></>}</Chip>
          ) : null)}
        </>
      ) : <Chip tone="neutral">CONNECTING</Chip>}
    </Card>
  )
}
