/**
 * MiniHist — the launcher widget's mini histogram (`14d ▁▃▂▅█▁`), drawn as
 * flat CSS bars (`.mc-hist` in globals.css). Values are scaled to the series
 * peak; zeros render as an unfilled 2px stub, never as a bar.
 *
 *   <MiniHist values={completionsPerDay} />          → last 14 slots
 *   <MiniHist values={hourCoverage} days={24} />     → 24 hourly slots
 *
 * `days` is the slot count: the series is right-aligned (the newest value is
 * the last slot) and left-padded with zeros when shorter.
 */
export type MiniHistProps = {
  values: number[]
  days?: number
  /** Accessible summary, e.g. "completions, last 14 days". */
  label?: string
  className?: string
}

export function histSlots(values: number[], days: number): number[] {
  const n = Math.max(1, Math.round(days))
  const clean = values.map(v => (Number.isFinite(v) && v > 0 ? v : 0)).slice(-n)
  return [...Array(n - clean.length).fill(0), ...clean]
}

export function MiniHist({ values, days = 14, label, className = '' }: MiniHistProps) {
  const slots = histSlots(values, days)
  const peak = Math.max(0, ...slots)
  return (
    <div
      className={['mc-hist', className].filter(Boolean).join(' ')}
      style={{ '--n': slots.length } as React.CSSProperties}
      role="img"
      aria-label={label ?? `${slots.length} slots, peak ${peak}`}
    >
      {slots.map((v, i) => v > 0 && peak > 0
        ? <i key={i} style={{ '--v': (v / peak).toFixed(3) } as React.CSSProperties} />
        : <i key={i} data-zero="" />)}
    </div>
  )
}
