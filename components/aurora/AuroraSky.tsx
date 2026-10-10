'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import { LEVELS, capSpans, clock, failMarks, laneStats, span, spanLevels, strandPaths } from '@/lib/sky-geometry'
import styles from './aurora.module.css'

export type AuroraSkyRow = { agent: string; spans: { start: number; end: number; failed?: boolean; n?: number }[] }

type Props = {
  rows: AuroraSkyRow[]
  /** Hour of the range at which "now" sits (0..rangeHours). */
  nowHour: number
  rangeHours?: number
  /** Short weekday for the day boundary at the left edge, e.g. "Sat". */
  dayLabel?: string
}

/** viewBox width for the whole range. The SVG stretches to the plot (preserveAspectRatio
 *  none), so it only ever holds horizontal strands with non-scaling strokes; anything that
 *  must keep its shape (diamonds, cursor, labels) is HTML placed by percentage. */
const W = 1000
/** Lane pitch and the strand's height inside it (px). Mirrored as --sky-lane / --sky-strand in CSS. */
const LANE = 46
const STRAND_Y = 30
/** A one-message burst still draws as a tick this wide (viewBox units, ≈ 7 min). */
const MIN_W = 5
/** On a phone the plot shows this many hours at once and pans for the rest. */
const WINDOW_H = 6
/** "Now" opens this far across the visible window. Mirrored by the snap anchor in CSS. */
const NOW_AT = 0.85

/** Stroke stack per intensity level: outer bloom, inner bloom, core — widths in px (non-scaling).
 *  The bloom is stacked strokes at falling opacity, never an SVG blur filter. */
const STACK: [outer: number, inner: number, core: number][] = [[10, 5, 1.5], [14, 6.5, 2.25], [20, 9, 3.25]]
const LAYER = ['bloomOuter', 'bloomInner', 'core'] as const

const pct = (h: number, range: number) => `${(Math.min(range, Math.max(0, h)) / range) * 100}%`

/** Per-agent activity timeline. Each agent is a lane: busy bursts glow as strands whose weight
 *  follows message density, silence is a dotted baseline, failures are diamonds, and a "now"
 *  cursor splits the day from the hatched future. */
export function AuroraSky({ rows, nowHour, rangeHours = 24, dayLabel }: Props) {
  const scroller = useRef<HTMLDivElement>(null)

  // Narrow screens pan the chart sideways: open it with "now" near the right edge of the window.
  useEffect(() => {
    const el = scroller.current
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (nowHour / rangeHours) * el.scrollWidth - el.clientWidth * NOW_AT
  }, [nowHour, rangeHours, rows.length])

  if (rows.length === 0) {
    return (
      <div className={styles.skyEmpty} role="status">
        <strong>No agent activity recorded yet</strong>
        Nothing has been logged by any agent today. Spans appear here as agents work.
      </div>
    )
  }

  const x = (h: number) => (Math.min(rangeHours, Math.max(0, h)) / rangeHours) * W
  const level = spanLevels(rows)
  const lanes = rows.map(row => ({ row, stats: laneStats(row, nowHour), spans: capSpans(row.spans), fails: failMarks(row.spans) }))
  const H = LANE * rows.length
  const now = pct(nowHour, rangeHours)
  const ticks = Array.from({ length: rangeHours / 3 }, (_, i) => i * 3)
  const label = `Agent activity today, 00:00 to now ${clock(nowHour)}: ${lanes.map(({ row, stats: s }) =>
    `${row.agent} ${s.bursts ? `${s.bursts} burst${s.bursts === 1 ? '' : 's'}, ${span(s.busyHours)} busy` : 'no activity logged'}${s.fails ? `, ${s.fails} failed run${s.fails === 1 ? '' : 's'}` : ''}${s.live ? ', working now' : ''}`).join('; ')}`

  return (
    <div className={styles.skyWrap} style={{ '--sky-lanes': rows.length, '--sky-window': rangeHours / WINDOW_H } as CSSProperties}>
      <ul className={styles.skyLabels} aria-hidden="true">
        {lanes.map(({ row, stats: s }) => (
          <li key={row.agent} className={styles.lane} title={`${row.agent}: ${s.bursts} work burst${s.bursts === 1 ? '' : 's'}, ${span(s.busyHours)} busy (${Math.round(s.share * 100)}% of the day so far)${s.fails ? `, ${s.fails} failed run${s.fails === 1 ? '' : 's'}` : ''}`}>
            <span className={styles.callsign}>{s.live && <i className={styles.liveDot} />}{row.agent}</span>
            <span className={styles.chips}>
              {s.bursts > 0
                ? <><span><b>{s.bursts}</b> burst{s.bursts === 1 ? '' : 's'}</span><span><b>{Math.round(s.share * 100)}%</b> busy</span></>
                : <span>no activity logged</span>}
              {s.fails > 0 && <span className={styles.failChip}><i />{s.fails} failed</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.skyScroll} ref={scroller} data-sky-scroll="">
        <div className={styles.skyPlot}>
          <div className={styles.axis} aria-hidden="true">
            {/* Ticks just behind the cursor give way to its clock label: within 2h on the full
                day, within 1h on the panning phone window (CSS picks which applies). */}
            {ticks.map(h => {
              const behind = nowHour - h
              const near = h > 0 && behind > -0.4 && behind < 2 ? (behind < 1.1 ? styles.nearTight : styles.nearWide) : ''
              return (
              <span key={h} className={`${h % 6 === 0 ? styles.tickMajor : styles.tick} ${near}`} style={{ left: pct(h, rangeHours) }}>
                {h === 0 && dayLabel ? <><b>{dayLabel}</b> 00</> : String(h).padStart(2, '0')}
              </span>
              )
            })}
            <span className={styles.nowTag} style={{ left: now }}>{clock(nowHour)}</span>
          </div>
          <div className={styles.field} style={{ height: H }}>
            <div className={styles.future} style={{ left: now }} aria-hidden="true" />
            <div className={styles.trail} style={{ right: `calc(100% - ${now})` }} aria-hidden="true"><i /></div>
            {lanes.map(({ row }, i) => (
              <i key={row.agent} className={styles.baseline} style={{ top: i * LANE + STRAND_Y, width: now }} aria-hidden="true" />
            ))}
            <svg className={styles.sky} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
              {lanes.map(({ row, spans }, i) => {
                const d = strandPaths(spans, level, x, i * LANE + STRAND_Y, MIN_W)
                return (
                  <g key={row.agent}>
                    {d.map((path, lv) => path ? (
                      <g key={lv} className={styles[`lv${lv}`]}>
                        {LAYER.map((layer, k) => <path key={layer} className={styles[layer]} d={path} strokeWidth={STACK[lv][k]} />)}
                        {lv === LEVELS - 1 && <path className={styles.filament} d={path} strokeWidth={1} />}
                      </g>
                    ) : null)}
                  </g>
                )
              })}
            </svg>
            <div className={styles.nowLine} style={{ left: now }} aria-hidden="true"><i /></div>
            {lanes.map(({ row, stats }, i) => stats.live && (
              <i key={row.agent} className={styles.liveHead} style={{ left: now, top: i * LANE + STRAND_Y }} aria-hidden="true" />
            ))}
            {lanes.map(({ row, fails }, i) => fails.map(f => (
              <button
                key={`${row.agent}-${f.at}`} type="button" className={styles.failMark}
                style={{ left: pct(f.at, rangeHours), top: i * LANE + STRAND_Y }}
                aria-label={`${row.agent}: ${f.count > 1 ? `${f.count} failed runs` : 'failed run'} at ${clock(f.at)}`}
              >
                <i className={styles.diamond} />
                {f.count > 1 && <b className={styles.failCount}>×{f.count}</b>}
                <span className={styles.failTip} aria-hidden="true">{clock(f.at)} · {f.count > 1 ? `${f.count} failed runs` : 'run failed'}</span>
              </button>
            )))}
          </div>
          {/* Pan stops: every three hours, plus the "now near the right edge" opening position. */}
          {ticks.map(h => <i key={h} className={styles.snap} style={{ left: pct(h, rangeHours) }} aria-hidden="true" />)}
          <i className={styles.snapNow} style={{ left: now }} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
