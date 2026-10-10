/**
 * MicroBars — the one bar-series presentation Mission Control uses where a full
 * SVG chart is overkill (and everywhere on a phone). HTML, not a scaled SVG, so
 * labels stay at real pixel sizes at every width instead of shrinking with a
 * viewBox.
 *
 * Visual language (tokens in lib/tokens.ts, --mc-chart-*):
 *   - zero-based scale; the peak is printed, never implied
 *   - one grid colour: a baseline, a peak line, a dashed midline
 *   - one emphasis: the latest bar; the rest of the series is the quiet tone
 *   - stacked bars keep their identity hues (--mc-cat-*) and are never summed
 *     across a scale they do not share
 *   - an all-zero series renders the `empty` sentence, not flat bars
 */
import type { CSSProperties } from 'react'
import styles from './charts.module.css'

export type MicroBar = {
  key: string
  value: number
  /** Full readout for this bar (native tooltip). */
  title: string
  segments?: { value: number; color: string }[]
}

export function MicroBars({ bars, label, format, axis, empty, height = 72 }: {
  bars: MicroBar[]
  /** What the series is, e.g. "Local tokens per day, last 14 days". */
  label: string
  format: (n: number) => string
  /** First / middle / last tick under the plot. */
  axis: [string, string, string]
  empty: string
  height?: number
}) {
  const values = bars.map(b => (Number.isFinite(b.value) && b.value > 0 ? b.value : 0))
  const max = Math.max(0, ...values)
  const last = bars.at(-1)
  if (!bars.length || max <= 0) {
    return <p className={styles.empty} role="status"><span aria-hidden="true">∅ </span>{empty}</p>
  }
  return (
    <figure className={styles.mbars} aria-label={`${label}. Peak ${format(max)}, latest ${format(values.at(-1) ?? 0)}.`} role="img">
      <figcaption className={styles.head} aria-hidden="true">
        <span>peak <b>{format(max)}</b></span>
        <span className={styles.latest}>latest <b>{format(values.at(-1) ?? 0)}</b></span>
      </figcaption>
      <div className={styles.plot} style={{ '--n': bars.length, height } as CSSProperties} aria-hidden="true">
        {bars.map((bar, i) => {
          const v = values[i]
          const isLast = bar === last
          const cls = [styles.bar, v === 0 ? styles.zero : '', isLast ? styles.emph : ''].filter(Boolean).join(' ')
          return (
            <i key={bar.key} className={cls} title={bar.title} style={{ '--v': v / max } as CSSProperties}>
              {bar.segments && v > 0 && bar.segments.filter(s => s.value > 0).map((s, j) => (
                <span key={j} style={{ flexGrow: s.value, background: s.color }} />
              ))}
            </i>
          )
        })}
      </div>
      <div className={styles.axis} aria-hidden="true"><span>{axis[0]}</span><span>{axis[1]}</span><span>{axis[2]}</span></div>
    </figure>
  )
}
