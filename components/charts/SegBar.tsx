/**
 * SegBar — the launcher widget's segmented bar (`cpu [■■■■■□□□□□] 44%`).
 * Flat blocks only: filled = round(value / max * segments), filled in the
 * accent (or a tone), unfilled in --mc-seg-off. CSS lives in globals.css
 * (`.mc-segbar`), so any route can emit the same markup.
 *
 *   <SegBar value={86} autoTone />                → amber at ≥85, red at ≥95
 *   <SegBar value={3} max={100} thin />           → 4px progress line
 *   <SegBar value={64} tone="cyan" label="gpu" /> → the card's one cyan mark
 */
export type SegTone = 'accent' | 'warn' | 'crit' | 'cyan'

export type SegBarProps = {
  value: number
  max?: number
  segments?: number
  tone?: SegTone
  thin?: boolean
  /** Pick warn/crit from the percentage. `true` = { warn: 85, crit: 95 }. */
  autoTone?: boolean | { warn: number; crit: number }
  /** Accessible name; the bar is a meter. */
  label?: string
  className?: string
}

const DEFAULT_THRESHOLDS = { warn: 85, crit: 95 }

export function segFilled(value: number, max: number, segments: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || segments <= 0) return 0
  const ratio = Math.max(0, Math.min(1, value / max))
  return Math.round(ratio * segments)
}

export function segTone(pct: number, tone: SegTone | undefined, autoTone: SegBarProps['autoTone']): SegTone {
  if (autoTone && Number.isFinite(pct)) {
    const t = autoTone === true ? DEFAULT_THRESHOLDS : autoTone
    if (pct >= t.crit) return 'crit'
    if (pct >= t.warn) return 'warn'
  }
  return tone ?? 'accent'
}

export function SegBar({ value, max = 100, segments = 20, tone, thin = false, autoTone, label, className = '' }: SegBarProps) {
  const n = Math.max(1, Math.round(segments))
  const on = segFilled(value, max, n)
  const pct = max > 0 ? (value / max) * 100 : 0
  const resolved = segTone(pct, tone, autoTone)
  return (
    <div
      className={['mc-segbar', thin ? 'mc-segbar--thin' : '', className].filter(Boolean).join(' ')}
      data-tone={resolved === 'accent' ? undefined : resolved}
      style={{ '--n': n } as React.CSSProperties}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0}
    >
      {Array.from({ length: n }, (_, i) => <i key={i} className={i < on ? 'on' : undefined} />)}
    </div>
  )
}
