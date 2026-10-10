/** Text-only charts; safe to render in either server or client components. */
import type { CSSProperties } from 'react'
import { WORDMARKS, type WordmarkId } from '@/lib/wordmarks'
import { hourCoverage, type HourSpan } from '@/lib/glyph-series'

const SPARK = '▁▂▃▄▅▆▇█'
const HEAT = ' .:*#@'
const clamp = (value: number) => Math.max(0, Math.min(1, value))
const columns = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(256, Math.floor(value))) : 0
const format = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, notation: 'compact' }).format(value)

/** Width caps the most recent samples; short series are never fabricated. */
export function AsciiSpark({ data, width = 24 }: { data: number[]; width?: number }) {
  const size = columns(width)
  if (!size || !data.length || data.some(value => !Number.isFinite(value))) return null
  const values = data.slice(-size)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const glyphs = values.map(value => SPARK[Math.round((max > min ? (value - min) / (max - min) : 0) * 7)])
  const last = values[values.length - 1]
  return <span className="asciiviz-spark" role="img" aria-label={`Sparkline: ${values.join(', ')}; latest ${last}`}>
    <span aria-hidden="true">{glyphs.slice(0, -1).join('')}<span className="asciiviz-bright">{glyphs.at(-1)}</span><span className="asciiviz-value">{' '}{format(last)}</span></span>
  </span>
}

export function AsciiMeter({ value, width = 16, label }: { value: number; width?: number; label?: string }) {
  const size = columns(width)
  if (!size || !Number.isFinite(value)) return null
  const fraction = clamp(value)
  const filled = Math.round(fraction * size)
  return <span className="asciiviz-meter" role="meter" aria-label={label || 'Usage'} aria-valuemin={0} aria-valuemax={1} aria-valuenow={fraction}>
    <span aria-hidden="true">{label && `${label.toUpperCase()} `}[<span className="asciiviz-bright">{'█'.repeat(filled)}</span><span className="asciiviz-faint">{'░'.repeat(size - filled)}</span>]</span>
  </span>
}

/** Nonnegative density normalized to this series; rows retain input order. */
export function AsciiHeat({ cells, cols = 26 }: { cells: number[]; cols?: number }) {
  const size = columns(cols)
  if (!size || !cells.length || cells.some(value => !Number.isFinite(value))) return null
  const max = Math.max(0, ...cells)
  return <span className="asciiviz-heat" role="img" aria-label={`Density, ${size} columns: ${cells.join(', ')}`}>
    <span aria-hidden="true">{cells.map((value, index) => {
      const level = max > 0 ? Math.ceil(clamp(value / max) * 5) : 0
      return <span key={index} className={`asciiviz-density-${level}`}>{index > 0 && index % size === 0 ? '\n' : ''}{HEAT[level]}</span>
    })}</span>
  </span>
}

export function AsciiBars({ values, max, width = 20 }: { values: number[]; max: number; width?: number }) {
  const size = columns(width)
  if (!size || !values.length || !Number.isFinite(max) || max < 0 || values.some(value => !Number.isFinite(value))) return null
  const labels = values.map(format)
  const labelWidth = Math.max(format(max).length, ...labels.map(label => label.length))
  const rows = values.map((value, index) => {
    const filled = max > 0 ? Math.round(clamp(value / max) * size) : 0
    return `${'▇'.repeat(filled).padEnd(size, ' ')} ${labels[index].padStart(labelWidth, ' ')}`
  })
  return <span className="asciiviz-bars" role="img" aria-label={`Bars, maximum ${max}: ${values.join(', ')}`}><span aria-hidden="true">{rows.join('\n')}</span></span>
}

/** Pre-rendered figlet wordmark (lib/wordmarks.ts). The block scales its font to the
 *  container so the rows never wrap; screen readers get the plain word. */
export function AsciiWordmark({ id, className = '' }: { id: WordmarkId; className?: string }) {
  const mark = WORDMARKS[id]
  return <span className={`asciiviz-wordmark ${className}`} role="img" aria-label={mark.text} style={{ '--wm-cols': mark.cols } as CSSProperties}>
    <span aria-hidden="true">{mark.rows.join('\n')}</span>
  </span>
}

/** One glyph per hour: · = idle, ▁..█ = share of the hour busy, ✕ = a failed run.
 *  Hours after `nowHour` render blank so the future never reads as idle. */
export function AsciiHourRun({ spans, nowHour, hours = 24, label }: { spans: HourSpan[]; nowHour: number; hours?: number; label: string }) {
  const cover = hourCoverage(spans, hours)
  const failed = new Set(spans.filter(s => s.failed).map(s => Math.min(hours - 1, Math.floor(s.start))))
  const busy = cover.filter(v => v > 0).length
  return <span className="asciiviz-hours" role="img" aria-label={`${label}: active in ${busy} of the last ${Math.min(hours, Math.ceil(nowHour))} hours${failed.size ? `, ${failed.size} failed run hour${failed.size === 1 ? '' : 's'}` : ''}`}>
    <span aria-hidden="true">{cover.map((v, h) => {
      if (failed.has(h)) return <span key={h} className="asciiviz-fail">✕</span>
      if (h > nowHour) return <span key={h}> </span>
      if (v <= 0) return <span key={h} className="asciiviz-faint">·</span>
      return <span key={h} className={h === Math.floor(nowHour) ? 'asciiviz-bright' : undefined}>{SPARK[Math.max(0, Math.min(7, Math.ceil(v * 8) - 1))]}</span>
    })}</span>
  </span>
}
