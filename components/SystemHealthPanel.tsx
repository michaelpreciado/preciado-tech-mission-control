'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SystemHealthData } from '@/lib/types'
import { SkeletonPanel } from './ui'

const POLL_MS = 20_000

export function SystemHealthPanel() {
  const [data, setData] = useState<SystemHealthData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/system', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  if (!data && !error) return <SkeletonPanel label="probing services" />

  const services = data?.services ?? []
  const problems = data?.problems ?? 0

  return (
    <div className="mc-window mc-health">
      <div className={`mc-tcol-head ${problems ? 'alert' : ''}`}>
        <span className="mc-tcol-glyph">⚡</span>
        <span>SYSTEM HEALTH</span>
        <span className="mc-tcol-count">{problems ? `${problems} ISSUE${problems > 1 ? 'S' : ''}` : 'ALL UP'}</span>
      </div>
      <div className="mc-health-body">
        {error && <div className="mc-pipe-error">⚠ {error}</div>}
        {services.map(svc => (
          <div key={svc.id} className="mc-health-row">
            <span className={`mc-led ${svc.status === 'up' ? 'green' : svc.status === 'warn' ? 'amber' : 'red'}`} />
            <span className="mc-health-name">{svc.name}</span>
            <span className="mc-health-detail">{svc.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
