'use client'

import { useEffect, useRef, useState } from 'react'
import { useLiveData } from '../LiveDataProvider'
import { useBrand } from '../Shell'
import type { SystemHealthData } from '@/lib/types'

/* ── Cockpit (stat header) ────────────────────────────── */

export function CommandHeader() {
  const { data, isLive, refresh } = useLiveData()
  const { appName, appTagline } = useBrand()
  const [now, setNow] = useState(() => new Date())
  const [spinning, setSpinning] = useState(false)
  const [approvals, setApprovals] = useState<number | null>(null)
  const [health, setHealth] = useState<SystemHealthData | null>(null)
  const cockpitRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Approvals + service health aren't part of the mission-control poll, so the
  // header pulls them itself. Failures leave the chip at its last known value
  // rather than flashing a scary zero.
  useEffect(() => {
    let alive = true
    const load = () => {
      fetch('/api/approvals?count=1', { cache: 'no-store' })
        .then(r => r.json())
        .then(j => { if (alive && typeof j.pending === 'number') setApprovals(j.pending) })
        .catch(() => {})
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

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  const allTasks = data?.tasks ?? []
  const cron = data?.cron ?? []

  // Every chip is something you might act on. `alert` flips it amber, so a
  // glance at the colour is enough — you only read the numbers if one is lit.
  const attention = allTasks.filter(t => t.status === 'attention').length
  const active = allTasks.filter(t => t.status === 'active').length
  // enabledCronJobs was always 0 here and read as "nothing scheduled"; what
  // actually matters is how many jobs errored on their last run.
  const cronFailing = cron.filter(c => c.lastRunStatus === 'error').length
  const servicesUp = health ? health.services.filter(s => s.status === 'up').length : 0
  const servicesTotal = health?.services.length ?? 0

  const stats = data ? [
    { key: 'needs_you', label: 'Needs you', value: approvals ?? 0, glyph: '◆', alert: (approvals ?? 0) > 0 },
    { key: 'attention', label: 'Attention', value: attention, glyph: '⚠', alert: attention > 0 },
    { key: 'active', label: 'Active', value: active, glyph: '▶', alert: false },
    { key: 'cron_fail', label: 'Cron fail', value: `${cronFailing}/${cron.length}`, glyph: '○', alert: cronFailing > 0 },
    { key: 'sys', label: 'Sys', value: servicesTotal ? `${servicesUp}/${servicesTotal}` : '—', glyph: '■', alert: Boolean(health && health.problems > 0) },
  ] : []

  return (
    <div className="mc-cockpit" ref={cockpitRef}>
      <span className="mc-cockpit-corner tl" />
      <span className="mc-cockpit-corner tr" />
      <span className="mc-cockpit-corner bl" />
      <span className="mc-cockpit-corner br" />
      <div className="mc-cockpit-row">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1 className="mc-hero-brand">{appName}</h1>
          <div className="mc-stats">
            {stats.map(s => (
              <div key={s.key} className={`mc-stat ${s.alert ? 'is-alert' : ''}`}>
                <span className="mc-stat-corner tl" />
                <span className="mc-stat-corner tr" />
                <span className="mc-stat-corner bl" />
                <span className="mc-stat-corner br" />
                <div className="mc-stat-head">
                  <span className="mc-stat-glyph">{s.glyph}</span>
                  <span>{s.label}</span>
                </div>
                <div className="mc-stat-val">{s.value}</div>
              </div>
            ))}
            <div className="mc-live-badge">
              <span className={`mc-led ${isLive ? 'green' : ''}`} /> {isLive ? 'LIVE' : 'OFFLINE'}
              <span style={{ color: 'var(--pt-text-mute)', marginLeft: 6, letterSpacing: '0.06em' }}>
                last&nbsp;{time}
              </span>
            </div>
            <button
              className={`mc-refresh-btn ${spinning ? 'spin' : ''}`}
              onClick={() => { setSpinning(true); refresh(); setTimeout(() => setSpinning(false), 800) }}
            >
              ↻ refresh
            </button>
          </div>
        </div>
        <div className="mc-cockpit-meta">
          <span className="mc-cock-sub" style={{ color: 'var(--pt-neon)', textShadow: 'var(--pt-glow-sm)' }}>
            {appName} / {appTagline}
          </span>
          <span className="mc-cock-sub">// agents: {data?.crew?.length ?? '—'} — {isLive ? 'online' : 'offline'}</span>
          {data?.warnings?.length ? (
            <div className="mc-cockpit-warn">⚠ {data.warnings[0]}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
