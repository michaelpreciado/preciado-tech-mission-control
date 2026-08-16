'use client'

import { useEffect, useRef, useState } from 'react'
import { useLiveData } from '../LiveDataProvider'
import { useBrand } from '../Shell'
import type { SystemHealthData } from '@/lib/types'

/* ── Cockpit (stat header) ────────────────────────────── */

// Recency threshold for the LIVE badge — a poll older than this is stale, not
// live. Mirrors the crew staleness window in lib/collectors/crew.ts (SYS-07).
const STALE_MS = 1000 * 60 * 60 * 24 // 24h

export function CommandHeader() {
  const { data, isLive, refresh, lastUpdated } = useLiveData()
  const { appName } = useBrand()
  const [spinning, setSpinning] = useState(false)
  const [health, setHealth] = useState<SystemHealthData | null>(null)
  const cockpitRef = useRef<HTMLDivElement>(null)

  // Service health isn't part of the mission-control poll, so the header pulls
  // it itself. Failures leave the chip at its last known value rather than
  // flashing a scary zero.
  useEffect(() => {
    let alive = true
    const load = () => {
      fetch('/api/system', { cache: 'no-store' })
        .then(r => r.json())
        .then((j: SystemHealthData) => { if (alive && Array.isArray(j.services)) setHealth(j) })
        .catch(() => {})
    }
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // Publish the header's live height so sticky column heads further down the
  // page offset below it instead of hiding behind it. Below 820px the cockpit
  // is position:static (it scrolls away to save vertical space), so publish 0 —
  // this is an inline style and would otherwise beat the stylesheet's override.
  useEffect(() => {
    const el = cockpitRef.current
    if (!el) return
    const publish = () => {
      const sticky = getComputedStyle(el).position === 'sticky'
      document.documentElement.style.setProperty('--mc-header-h', sticky ? `${el.offsetHeight}px` : '0px')
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    window.addEventListener('resize', publish)
    return () => { ro.disconnect(); window.removeEventListener('resize', publish) }
  }, [])

  const allTasks = data?.tasks ?? []
  const cron = data?.cron ?? []

  // SYS-07: degrade the LIVE badge when the last successful poll is itself stale.
  const updatedAgoMs = lastUpdated ? Date.now() - lastUpdated : data ? Date.now() - Date.parse(data.generatedAt) : null
  const dataStale = updatedAgoMs !== null && updatedAgoMs > STALE_MS
  const liveState = !isLive ? 'offline' : dataStale ? 'stale' : 'live'

  // Every chip is something you might act on. `alert` flips it amber, so a
  // glance at the colour is enough — you only read the numbers if one is lit.
  const attention = allTasks.filter(t => t.status === 'attention').length
  const active = allTasks.filter(t => t.status === 'active').length
  // Only FAILING ENABLED jobs are real failures — disabled/dormant jobs just
  // sit parked and shouldn't keep the header red (matches the Home tile + sidebar).
  const cronLive = cron.filter(c => c.enabled !== false).length
  const cronFailing = cron.filter(c => c.enabled !== false && c.lastRunStatus === 'error').length
  const servicesUp = health ? health.services.filter(s => s.status === 'up').length : 0
  const servicesTotal = health?.services.length ?? 0

  const stats = data ? [
    { key: 'attention', label: 'Attention', value: attention, glyph: '⚠', alert: attention > 0 },
    { key: 'active', label: 'Active', value: active, glyph: '▶', alert: false },
    { key: 'cron_fail', label: 'Cron fail', value: cronLive ? `${cronFailing}/${cronLive}` : '—', glyph: '○', alert: cronFailing > 0 },
    { key: 'sys', label: 'Sys', value: servicesTotal ? `${servicesUp}/${servicesTotal}` : '—', glyph: '■', alert: Boolean(health && health.problems > 0) },
  ] : []

  return (
    <div className="mc-cockpit" ref={cockpitRef}>
      <span className="mc-cockpit-corner tl" />
      <span className="mc-cockpit-corner tr" />
      <span className="mc-cockpit-corner bl" />
      <span className="mc-cockpit-corner br" />
      <div className="mc-cockpit-row">
        <h1 className="mc-hero-brand">{appName}</h1>
        <div className="mc-stats">
          {stats.map(s => (
            <div key={s.key} className={`mc-stat ${s.alert ? 'is-alert' : ''}`} title={s.label}>
              <span className="mc-stat-corner tl" />
              <span className="mc-stat-corner tr" />
              <span className="mc-stat-corner bl" />
              <span className="mc-stat-corner br" />
              <span className="mc-stat-glyph">{s.glyph}</span>
              <span className="mc-stat-val">{s.value}</span>
            </div>
          ))}
          <div className="mc-live-badge" data-state={liveState}>
            <span className={`mc-led ${liveState === 'live' ? 'green' : liveState === 'stale' ? 'amber' : ''}`} />
            {liveState === 'live' ? 'LIVE' : liveState === 'stale' ? 'STALE' : 'OFFLINE'}
          </div>
          <button
            className={`mc-refresh-btn ${spinning ? 'spin' : ''}`}
            onClick={() => { setSpinning(true); refresh(); setTimeout(() => setSpinning(false), 800) }}
          >
            ↻
          </button>
        </div>
        {data?.warnings?.length ? (
          <div className="mc-cockpit-warn">⚠ {data.warnings[0]}</div>
        ) : null}
      </div>
    </div>
  )
}
