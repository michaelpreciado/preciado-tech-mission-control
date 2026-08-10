'use client'

/**
 * Sparkline — tiny inline line+area chart for embedding in tiles/cards.
 * Pure SVG, retina-crisp, honors an externally-supplied color (defaults to
 * the accent). Used to turn static metrics into live-at-a-glance series.
 *
 * Props:
 *  - points: numeric series (fewer than 2 points renders a flat baseline)
 *  - color:  stroke/fill color (default var(--pt-neon))
 *  - w/h:    viewBox size (default 96x28)
 *  - fill:   whether to render a soft area gradient under the line
 *  - baseline: if false, the series is NOT normalized so the min sits at the
 *    bottom (pass false to preserve a true zero-anchored view, e.g. money).
 */
export function Sparkline({
  points,
  color = 'var(--pt-neon)',
  w = 96,
  h = 28,
  fill = true,
  baseline = true,
  strokeWidth = 1.5,
}: {
  points: number[]
  color?: string
  w?: number
  h?: number
  fill?: boolean
  baseline?: boolean
  strokeWidth?: number
}) {
  if (!points.length) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const pad = 2 // vertical padding so the line doesn't clip at the edges

  const x = (i: number) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w)
  const y = (v: number) => {
    // baseline=true → normalize min→max across the full band (show shape drift)
    // baseline=false → anchor 0 at the bottom, scale max into the band (true zeros)
    const norm = baseline ? (v - min) / span : (span === 0 ? 0 : (v - 0) / max)
    return h - pad - Math.max(0, Math.min(1, norm)) * (h - pad * 2)
  }

  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
      className="mc-spark"
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={`spark-fill-${color.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#spark-fill-${color.replace(/[^a-zA-Z0-9]/g, '')})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="1.6" fill={color} />
    </svg>
  )
}
