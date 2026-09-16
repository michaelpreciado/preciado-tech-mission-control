'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { apiFetch } from '@/lib/api-base'

type LaunchData = {
  crew?: unknown[]
  kanban?: { openTasks?: unknown }
  counts?: { openTasks?: unknown }
  costs?: {
    meteredCostUsd?: unknown
    daily?: ({ cost?: unknown; usd?: unknown; total?: unknown } | null)[]
  }
}

function normalizeChart(series: number[]) {
  if (series.length < 2) return { chartPoints: '', last: { x: 0, y: 0 } }
  const min = Math.min(...series)
  const max = Math.max(...series)
  const points = series.map((v, i) => ({
    x: i / (series.length - 1) * 312 + 4,
    y: 60 - (v - min) / (max - min || 1) * 52,
  }))
  return {
    chartPoints: points.map(({ x, y }) => `${x},${y}`).join(' '),
    last: points[points.length - 1],
  }
}

export function LaunchFilm() {
  const [data, setData] = useState<LaunchData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    async function load() {
      try {
        const response = await apiFetch('/api/mission-control', { signal })
        if (!response.ok) {
          if (!signal.aborted) setFailed(true)
          return
        }
        const d: LaunchData | null = await response.json()
        if (!signal.aborted) setData(d)
      } catch {
        if (!signal.aborted) setFailed(true)
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  const d = data
  const crewCount = Array.isArray(d?.crew) ? d.crew.length : 0
  const openTasks = Number(d?.kanban?.openTasks ?? d?.counts?.openTasks ?? 0)
  const metered = typeof d?.costs?.meteredCostUsd === 'number' ? d.costs.meteredCostUsd : null
  const series = (Array.isArray(d?.costs?.daily) ? d.costs.daily : [])
    .map(p => Number(p?.cost ?? p?.usd ?? p?.total ?? 0)).filter(Number.isFinite).slice(-30)
  const { chartPoints, last } = normalizeChart(series)

  return (
    <div className="launch-film" role="status" aria-label="Mission Control launch sequence">
      <div className="launch-seam" aria-hidden="true" />
      <svg className="boot-draw launch-mark" viewBox="0 0 140 44" aria-hidden="true">
        <path className="boot-draw-path" d="M4 30 H136" />
        <path className="boot-draw-path" d="M14 30 C 45 6, 95 6, 126 30" />
        <path className="boot-draw-path" d="M45 30 V18 M95 30 V18" />
      </svg>
      <span className="launch-ring" aria-hidden="true" />
      <div className="launch-word">
        <div className="launch-brand">{'PRECIADO TECH'.split('').map((ch, i) => ch === ' ' ? <span key={i} className="launch-letter is-space"> </span> : <span key={i} className="launch-letter" style={{ '--i': i } as CSSProperties}>{ch}</span>)}</div>
        <div className="launch-sub">MISSION CONTROL</div>
        <div className="launch-meta">MC-072 · LAUNCH FILM · {failed ? 'LOCAL BUS' : 'LIVE DATA'}</div>
      </div>
      <div className="launch-data">
        <div className="launch-stat"><b>{failed ? '—' : crewCount}</b><span>AGENTS</span></div>
        <div className="launch-stat"><b>{failed ? '—' : openTasks}</b><span>OPEN TASKS</span></div>
        <div className="launch-stat"><b>{failed || metered == null ? '—' : `$${metered.toFixed(2)}`}</b><span>METERED</span></div>
        {chartPoints && <svg className="launch-chart" viewBox="0 0 320 64" aria-hidden="true">
          <polyline className="launch-chart-line" pathLength={1} points={chartPoints} />
          <circle className="launch-chart-dot" cx={last.x} cy={last.y} r={3} />
        </svg>}
      </div>
      <div className="launch-final">HANDSHAKE COMPLETE</div>
    </div>
  )
}
