'use client'

import { useEffect, useId, useRef } from 'react'
import styles from './aurora.module.css'

export type AuroraSkyRow = { agent: string; spans: { start: number; end: number; failed?: boolean }[] }

type Props = {
  rows: AuroraSkyRow[]
  /** Hour of the range at which "now" sits (0..rangeHours). */
  nowHour: number
  rangeHours?: number
}

const W = 1560
const ROW = 24
const TOP = 20
const MIN_BAR = 4

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const hh = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:00`

/** Per-agent activity timeline: one glowing strand per span, red dots for failures, a "now" line, hatched future. */
export function AuroraSky({ rows, nowHour, rangeHours = 24 }: Props) {
  // Ids carry the colon-free useId so url(#…) references stay valid and unique.
  const uid = useId().replace(/:/g, '')
  const scroller = useRef<HTMLDivElement>(null)
  const glow = `aur-glow-${uid}`, strand = `aur-strand-${uid}`, future = `aur-future-${uid}`

  // Narrow screens scroll the chart sideways: open it with "now" near the right edge.
  useEffect(() => {
    const el = scroller.current
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (nowHour / rangeHours) * el.scrollWidth - el.clientWidth * 0.85
  }, [nowHour, rangeHours, rows.length])

  if (rows.length === 0) {
    return (
      <div className={styles.skyEmpty} role="status">
        <strong>No agent activity recorded yet</strong>
        Nothing has been logged by any agent today. Spans appear here as agents work.
      </div>
    )
  }

  const gridBottom = TOP + 2 + ROW * rows.length
  const H = gridBottom + 22
  const x = (hour: number) => (clamp(hour, 0, rangeHours) / rangeHours) * W
  const step = rangeHours > 12 ? 3 : 1
  const ticks = Array.from({ length: Math.floor(rangeHours / step) + 1 }, (_, i) => i * step)
  const nowX = x(nowHour)
  const label = `Agent activity, ${rangeHours} hours: ${rows.map(r => `${r.agent} ${r.spans.filter(s => !s.failed).length} spans`).join(', ')}`

  return (
    <div className={styles.skyWrap}>
      <div className={styles.skyLabels} aria-hidden="true">
        {rows.map(r => <span key={r.agent} title={r.agent}>{r.agent}</span>)}
      </div>
      <div className={styles.skyScroll} ref={scroller}>
        <svg className={styles.sky} style={{ height: H }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
          <defs>
            <filter id={glow} filterUnits="userSpaceOnUse" x={-60} y={-60} width={W + 120} height={H + 120}><feGaussianBlur stdDeviation="6" /></filter>
            <linearGradient id={strand} x1="0" x2="1">
              <stop offset="0" style={{ stopColor: 'var(--aur-accent)', stopOpacity: 0.25 }} />
              <stop offset=".5" style={{ stopColor: 'var(--aur-accent-strong)', stopOpacity: 0.95 }} />
              <stop offset="1" style={{ stopColor: 'var(--aur-accent)', stopOpacity: 0.35 }} />
            </linearGradient>
            <pattern id={future} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: 'var(--aur-line-subtle)' }} strokeWidth="2" />
            </pattern>
          </defs>

          {ticks.map(h => (
            <g key={h}>
              <line className={styles.hr} x1={x(h)} x2={x(h)} y1={8} y2={gridBottom} />
              {h < rangeHours && <text className={styles.hl} x={x(h) + 4} y={gridBottom + 16}>{hh(h)}</text>}
            </g>
          ))}
          {nowX < W && <rect x={nowX} y={8} width={W - nowX} height={gridBottom - 8} fill={`url(#${future})`} />}

          {rows.map((row, i) => {
            const y = TOP + ROW * i
            return (
              <g key={row.agent}>
                {row.spans.filter(s => !s.failed).map((s, j) => {
                  const x0 = x(s.start)
                  const w = Math.max(MIN_BAR, x(s.end) - x0)
                  return (
                    <g key={j}>
                      <rect className={styles.halo} filter={`url(#${glow})`} x={x0} y={y} width={w} height={9} rx={4.5} />
                      <rect x={x0} y={y + 2} width={w} height={4} rx={2} fill={`url(#${strand})`} />
                    </g>
                  )
                })}
                {row.spans.filter(s => s.failed).map((s, j) => (
                  <g key={`f${j}`}>
                    <circle className={styles.failHalo} cx={x(s.end)} cy={y + 4} r={9} filter={`url(#${glow})`} />
                    <circle className={styles.fail} cx={x(s.end)} cy={y + 4} r={3.2} />
                  </g>
                ))}
              </g>
            )
          })}

          <line className={styles.now} x1={nowX} x2={nowX} y1={4} y2={gridBottom} />
          <circle className={styles.nowDot} cx={nowX} cy={4} r={3} />
        </svg>
      </div>
    </div>
  )
}
