'use client'

/**
 * BurnLandscape — daily token burn, LAST 14 DAYS, as a 2D stacked bar chart.
 *
 * History: this was an axonometric (isometric) SVG "landscape" — visually
 * distinct, but the 3D rake made day-over-day comparison and value reads
 * slower than a flat chart, and Michael asked for simple-and-readable over
 * clever (2026-09-01). The 2D rewrite keeps everything that mattered:
 *   - calendar-true 14-day window (a sparse slice used to stretch it)
 *   - per-mode segmentation in fixed SEG_ORDER, never summed across modes
 *   - "nice" axis ticks that round UP past the max (no bar escaping its scale)
 *   - zero days rendered as flat markers, not silent gaps
 *   - hover readout that never reflows the chart
 * Colors are the shared CATEGORICAL palette (lib/chart-colors) so the chart
 * reads as part of Mission Control, not a one-off.
 */

import { useMemo, useState } from 'react'
import { CATEGORICAL } from '@/lib/chart-colors'
import type { CostDashboard, BillingMode } from '@/lib/types'
import { billingMode } from '@/lib/collectors/costs-usage'

const SEG_ORDER: BillingMode[] = ['metered', 'subscription', 'local', 'cloud-routed']
const SEG_COLOR: Record<BillingMode, string> = {
  metered: CATEGORICAL[0],        // blue — brand accent
  subscription: CATEGORICAL[3],   // violet
  local: CATEGORICAL[2],          // lime
  'cloud-routed': CATEGORICAL[5], // orange
}
const SEG_LABEL: Record<BillingMode, string> = {
  metered: 'METERED', subscription: 'SUBSCRIPTION', local: 'LOCAL', 'cloud-routed': 'CLOUD-ROUTED',
}

function tok(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

/** "Nice" axis ticks — 1/2/5 × 10ⁿ, top tick rounds UP past the max so the
 *  tallest bar can never escape its own scale. (Unit-tested semantics kept
 *  from the axonometric version.) */
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
    for (const d of costs.codexUsage?.daily ?? []) {
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
  }, [costs.daily, costs.claudeUsage?.daily, costs.codexUsage?.daily, costs.models])

  const max = Math.max(...days.map(d => d.total), 1)
  const axis = ticks(max)
  const axisMax = axis[axis.length - 1]

  const hovered = hover != null ? days[hover] : null

  return (
    <div className="cp-burn2d">
      <svg viewBox="0 0 720 240" role="img"
        aria-label={`Daily token burn over the last ${DAYS} days, by billing mode`}>
        {/* ── Horizontal gridlines + value ticks ── */}
        {axis.map(v => {
          const y = 210 - (v / axisMax) * 190
          return (
            <g key={v}>
              <line x1={44} y1={y} x2={706} y2={y}
                stroke="var(--pt-border-dim)" strokeWidth={1}
                strokeDasharray={v === 0 ? undefined : '2 4'} />
              <text x={38} y={y + 3} textAnchor="end" className="cp-burn2d-tick">{tok(v)}</text>
            </g>
          )
        })}

        {/* ── Bars: stacked by mode in SEG_ORDER, back-to-front = bottom-to-top ── */}
        {days.map((d, i) => {
          const x = 48 + i * 46
          const dim = hover !== null && hover !== i
          const w = 30
          let y = 210
          const rects = SEG_ORDER.filter(k => d.segs[k] > 0).map(k => {
            const h = (d.segs[k] / axisMax) * 190
            y -= h
            return <rect key={k} x={x} y={y} width={w} height={Math.max(h, 0.5)}
              fill={SEG_COLOR[k]} opacity={dim ? 0.28 : 1} rx={1.5} />
          })
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'crosshair' }}>
              {/* Zero days: flat marker, never a silent gap */}
              {d.total === 0 && (
                <rect x={x} y={209} width={w} height={2} fill="rgba(255,255,255,0.12)"
                  stroke="var(--pt-border-dim)" strokeWidth={0.5} opacity={dim ? 0.3 : 1} rx={1} />
              )}
              {rects}
              {/* Full-height hit target so thin/zero columns stay hoverable */}
              <rect x={x - 4} y={12} width={w + 8} height={200} fill="transparent" />
              <text x={x + w / 2} y={224} textAnchor="middle"
                className={`cp-burn2d-day${hover === i ? ' is-on' : ''}`}>{d.date.slice(5)}</text>
            </g>
          )
        })}
      </svg>

      {/* ── Readout. Reserved height — hover must not reflow the chart. ── */}
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
          <span className="cp-iso-hint">hover a bar for that day&apos;s split · axis in tokens processed</span>
        )}
      </div>

      <div className="cp-iso-legend">
        {SEG_ORDER.filter(k => days.some(d => d.segs[k] > 0)).map(k => (
          <span key={k}><i style={{ background: SEG_COLOR[k] }} />{SEG_LABEL[k]}</span>
        ))}
        <span className="cp-iso-proj">2D STACKED · TOKENS PROCESSED PER DAY</span>
      </div>
    </div>
  )
}
