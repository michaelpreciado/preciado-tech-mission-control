'use client'

/**
 * BurnLandscape — daily token burn as an AXONOMETRIC (isometric) bar landscape.
 *
 * Why not the perspective 3D canvas this replaces: perspective foreshortens.
 * A column near the camera renders taller than an identical column at the back,
 * so the encoding contradicts the data, and a slow auto-orbit meant no bar ever
 * held a stable position long enough to compare against its neighbour. There
 * were also no axes, no ticks and no labels — nothing on screen let you read a
 * value off it.
 *
 * Axonometric projection has no vanishing point: parallel lines stay parallel
 * and a unit of height is the same number of pixels everywhere on the plot. So
 * the landscape look survives while heights become genuinely comparable, and
 * with a value axis, gridlines and per-day labels the chart can actually be
 * read. Pure SVG — no WebGL, no three.js, no canvas, and it renders in SSR.
 */

import { useMemo, useState } from 'react'
import { CATEGORICAL } from '@/lib/chart-colors'
import type { CostDashboard, BillingMode } from '@/lib/types'
import { billingMode } from '@/lib/collectors/costs-usage'

/* Projection — anisotropic axonometric: the two ground axes get DIFFERENT
   angles. True 30/30 isometric sends a 14-column row marching steeply down the
   frame, which wastes most of the canvas on empty diagonal and drives the date
   labels into the tiles. A shallow rake on the day axis keeps the row close to
   horizontal (compact, labels sit flat beneath their column) while the deeper
   z angle still gives each bar a readable top and side.

   This is still a PARALLEL projection: no vanishing point, no foreshortening,
   so equal heights remain equal pixels anywhere in the plot. That property is
   the whole reason for the chart's existence and survives the change. */
const DAY_A = (8 * Math.PI) / 180    // rake of the day axis
const DEPTH_A = (34 * Math.PI) / 180 // depth axis
const DX = Math.cos(DAY_A), DY = Math.sin(DAY_A)
const ZX = Math.cos(DEPTH_A), ZY = Math.sin(DEPTH_A)

/** World → screen. y is the value axis and the ONLY thing whose contribution to
 *  the vertical encodes magnitude. */
function project(x: number, y: number, z: number): [number, number] {
  return [x * DX - z * ZX, x * DY + z * ZY - y]
}

const SEG_ORDER: BillingMode[] = ['metered', 'subscription', 'local', 'cloud-routed']
const SEG_COLOR: Record<BillingMode, string> = {
  metered: CATEGORICAL[0],
  subscription: CATEGORICAL[3],
  local: CATEGORICAL[2],
  'cloud-routed': CATEGORICAL[5],
}
const SEG_LABEL: Record<BillingMode, string> = {
  metered: 'METERED', subscription: 'SUBSCRIPTION', local: 'LOCAL', 'cloud-routed': 'CLOUD-ROUTED',
}

/* Face shading. A single hue per series, three fixed lightnesses — the light
   direction is constant, so brightness reads as orientation and never as a
   fourth data dimension. */
const FACE = { top: 1, right: 0.72, left: 0.48 }

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * k)
  const g = Math.round(((n >> 8) & 255) * k)
  const b = Math.round((n & 255) * k)
  return `rgb(${r},${g},${b})`
}

function tok(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

/**
 * "Nice" axis ticks — 1/2/5 × 10ⁿ, so labels land on round numbers.
 *
 * The top tick is rounded UP past the maximum, never to the last step that
 * still fits under it. Stopping at the largest tick <= max let a 301M day sit
 * above a 300M axis: the tallest bar escaped its own scale and touched the top
 * gridline, which is both wrong and unreadable.
 */
function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag
  const top = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = 0; v <= top + step * 0.001; v += step) out.push(v)
  return out
}

type Day = { date: string; segs: Record<BillingMode, number>; total: number }

const DAYS = 14
const COL_W = 1.05     // footprint width  (x)
const COL_D = 0.85     // footprint depth  (z)
const PITCH = 1.5      // spacing between column centres along x
const H = 5.6          // world height of the tallest column

export default function BurnLandscape({ costs }: { costs: CostDashboard }) {
  const [hover, setHover] = useState<number | null>(null)

  const days = useMemo<Day[]>(() => {
    const provider = new Map((costs.models ?? []).map(m => [m.model, m.provider]))
    const blank = (): Record<BillingMode, number> => ({ metered: 0, subscription: 0, local: 0, 'cloud-routed': 0 })
    const byDate = new Map<string, Record<BillingMode, number>>()
    for (const d of costs.daily ?? []) {
      const slot = byDate.get(d.date) ?? blank()
      for (const [model, v] of Object.entries(d.byModel ?? {})) {
        slot[billingMode(provider.get(model) ?? '', model)] += (v as { tokens?: number })?.tokens ?? 0
      }
      byDate.set(d.date, slot)
    }
    for (const d of costs.claudeUsage?.daily ?? []) {
      const slot = byDate.get(d.date) ?? blank()
      slot.subscription += d.tokens
      byDate.set(d.date, slot)
    }
    // Calendar days, not "the last 14 days that had traffic" — a sparse slice
    // silently stretched this window across two months while the title said 14.
    const now = new Date()
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    return Array.from({ length: DAYS }, (_, i) => {
      const date = new Date(end - (DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10)
      const segs = byDate.get(date) ?? blank()
      return { date, segs, total: SEG_ORDER.reduce((s, k) => s + segs[k], 0) }
    })
  }, [costs.daily, costs.claudeUsage?.daily, costs.models])

  const max = Math.max(...days.map(d => d.total), 1)
  const axis = ticks(max)
  const axisMax = axis[axis.length - 1]
  const scale = H / axisMax
  const present = SEG_ORDER.filter(k => days.some(d => d.segs[k] > 0))

  // Project every extreme point so the viewBox fits the plot exactly rather
  // than relying on hand-tuned padding that breaks at other aspect ratios.
  const xs: number[] = [], ys: number[] = []
  const X1 = (DAYS - 1) * PITCH + COL_W
  for (const bx of [-0.4, X1 + 0.4]) for (const by of [0, H]) for (const bz of [0, COL_D]) {
    const [px, py] = project(bx, by, bz); xs.push(px); ys.push(py)
  }
  const PAD_L = 3.0, PAD_R = 0.6, PAD_T = 0.4, PAD_B = 2.0
  const minX = Math.min(...xs) - PAD_L, maxX = Math.max(...xs) + PAD_R
  const minY = Math.min(...ys) - PAD_T, maxY = Math.max(...ys) + PAD_B

  const poly = (pts: [number, number][]) => pts.map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`).join(' ')

  /** The three visible faces of one box. Hidden faces are never emitted, so the
   *  SVG carries no geometry the viewer cannot see. */
  function box(x: number, y0: number, y1: number, color: string, dim: boolean, key: string) {
    const x1 = x + COL_W, z1 = COL_D
    const p = (a: number, b: number, c: number) => project(a, b, c)
    const o = dim ? 0.32 : 1
    return (
      <g key={key} opacity={o}>
        {/* left face (z = z1) */}
        <polygon points={poly([p(x, y0, z1), p(x, y1, z1), p(x1, y1, z1), p(x1, y0, z1)])}
          fill={shade(color, FACE.left)} />
        {/* right face (x = x1) */}
        <polygon points={poly([p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, 0), p(x1, y0, 0)])}
          fill={shade(color, FACE.right)} />
        {/* top face */}
        <polygon points={poly([p(x, y1, z1), p(x, y1, 0), p(x1, y1, 0), p(x1, y1, z1)])}
          fill={shade(color, FACE.top)} />
      </g>
    )
  }

  const hovered = hover != null ? days[hover] : null

  return (
    <div className="cp-iso">
      <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img"
        aria-label={`Daily token burn over the last ${DAYS} days, by billing mode`}>
        {/* ── Ground plane ── */}
        <polygon
          points={poly([
            project(-0.4, 0, 0), project((DAYS - 1) * PITCH + COL_W + 0.4, 0, 0),
            project((DAYS - 1) * PITCH + COL_W + 0.4, 0, COL_D), project(-0.4, 0, COL_D),
          ])}
          fill="rgba(255,255,255,0.028)" stroke="var(--pt-border-dim)" strokeWidth={0.018} />

        {/* ── Value gridlines + ticks, drawn on the back edge (z = 0) so they
             never cross in front of a column and misread as data. ── */}
        {axis.map(v => {
          const y = v * scale
          const [ax, ay] = project(-0.4, y, 0)
          const [bx, by] = project((DAYS - 1) * PITCH + COL_W + 0.4, y, 0)
          return (
            <g key={v}>
              <line x1={ax} y1={ay} x2={bx} y2={by}
                stroke="var(--pt-border-dim)" strokeWidth={0.016}
                strokeDasharray={v === 0 ? undefined : '0.09 0.11'} />
              <text x={ax - 0.22} y={ay + 0.13} textAnchor="end" className="cp-iso-tick">{tok(v)}</text>
            </g>
          )
        })}

        {/* ── Columns, painted back-to-front so nearer bars overlap farther ones ── */}
        {days.map((d, i) => {
          const x = i * PITCH
          const dim = hover !== null && hover !== i
          let y = 0
          const parts = SEG_ORDER.filter(k => d.segs[k] > 0).map(k => {
            const h = d.segs[k] * scale
            const el = box(x, y, y + h, SEG_COLOR[k], dim, `${d.date}-${k}`)
            y += h
            return el
          })
          const [hx] = project(x + COL_W / 2, 0, COL_D / 2)
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'crosshair' }}>
              {/* Zero days get a flat marker: an absent column and a day with no
                  logged activity must not look like the same thing. */}
              {d.total === 0 && (
                <polygon points={poly([project(x, 0, COL_D), project(x, 0, 0), project(x + COL_W, 0, 0), project(x + COL_W, 0, COL_D)])}
                  fill="rgba(255,255,255,0.05)" stroke="var(--pt-border-dim)" strokeWidth={0.014} opacity={dim ? 0.3 : 1} />
              )}
              {parts}
              {/* Invisible hit target so thin/zero columns are still hoverable. */}
              <polygon points={poly([project(x, 0, COL_D), project(x, H, COL_D), project(x + COL_W, H, 0), project(x + COL_W, 0, 0)])}
                fill="transparent" />
              {/* Dates sit on ONE flat baseline rather than following the
                  ground rake: raked labels drift apart vertically, collide with
                  their neighbours, and stop reading as a shared axis. */}
              <text x={hx} y={maxY - 0.55} textAnchor="middle"
                className={`cp-iso-day${hover === i ? ' is-on' : ''}`}>{d.date.slice(5)}</text>
              <line x1={hx} y1={maxY - 1.02} x2={hx} y2={maxY - 0.86}
                stroke="var(--pt-border-dim)" strokeWidth={0.016} />
            </g>
          )
        })}
      </svg>

      {/* ── Readout. Fixed height so hovering never reflows the chart. ── */}
      <div className="cp-iso-readout">
        {hovered ? (
          <>
            <span className="cp-iso-date">{hovered.date}</span>
            <span className="cp-iso-total">{hovered.total > 0 ? `${tok(hovered.total)} tokens` : 'no activity'}</span>
            {SEG_ORDER.filter(k => hovered.segs[k] > 0).map(k => (
              <span key={k} className="cp-iso-seg">
                <i style={{ background: SEG_COLOR[k] }} />{SEG_LABEL[k].toLowerCase()} {tok(hovered.segs[k])}
              </span>
            ))}
          </>
        ) : (
          <span className="cp-iso-hint">hover a column for that day&apos;s split · axis in tokens processed</span>
        )}
      </div>

      <div className="cp-iso-legend">
        {present.map(k => (
          <span key={k}><i style={{ background: SEG_COLOR[k] }} />{SEG_LABEL[k]}</span>
        ))}
        <span className="cp-iso-proj">AXONOMETRIC · EQUAL HEIGHTS READ EQUAL AT ANY POSITION</span>
      </div>
    </div>
  )
}
