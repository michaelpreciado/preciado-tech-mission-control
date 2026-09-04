'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SystemHealthData } from '@/lib/types'
import { SkeletonPanel } from './ui'

const POLL_MS = 20_000

/** Compact relative age for the panel-level `generatedAt` staleness signal. */
function ago(iso?: string): string {
  if (!iso) return ''
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.max(1, s)}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

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
  // Panel-level probe age — poll is 20s, so older than ~2 min is stale (amber).
  const generatedAt = data?.generatedAt
  const healthStale = !!generatedAt && Date.now() - new Date(generatedAt).getTime() > 120_000

  return (
    <div className="mc-window mc-health">
      <div className={`mc-tcol-head ${problems ? 'alert' : ''}`}>
        <span className="mc-tcol-glyph">⚡</span>
        <span>SYSTEM HEALTH</span>
        <span className="mc-tcol-count">{problems ? `${problems} ISSUE${problems > 1 ? 'S' : ''}` : 'ALL UP'}</span>
        {generatedAt && (
          <span
            className={`mc-hl-sync${healthStale ? ' is-stale' : ''}`}
            style={healthStale ? { color: 'var(--pt-warn-ink)' } : undefined}
            title={`System probed ${new Date(generatedAt).toLocaleString()}`}
            aria-label={healthStale ? `System health is stale, ${ago(generatedAt)}` : `System health updated ${ago(generatedAt)}`}
          >
            {healthStale ? `· STALE · ${ago(generatedAt)}` : `· ${ago(generatedAt)}`}
          </span>
        )}
      </div>
      <div className="mc-health-body">
        {error && <div className="mc-pipe-error">⚠ {error}</div>}
        {services.length === 0 && !error ? (
          <div className="mc-empty is-compact">
            <div className="mc-empty-glyph">⚡</div>
            <div className="mc-empty-title">NO SERVICES</div>
            <p className="mc-empty-desc">Service status will appear here once the system probe responds.</p>
          </div>
        ) : (
          services.map(svc => (
            <div key={svc.id} className="mc-health-row">
              <span className={`mc-led ${svc.status === 'up' ? 'green' : svc.status === 'warn' ? 'amber' : 'red'}`} />
              <span className="mc-health-name" title={svc.name}>{svc.name}</span>
              <span className="mc-health-detail" title={svc.detail}>{svc.detail}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
