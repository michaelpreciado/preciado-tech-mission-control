/** Pure series helpers behind the text charts in components/ascii-viz.tsx. */

export type HourSpan = { start: number; end: number; failed?: boolean }

/** Busy fraction (0..1) of each hour in [0, hours) covered by spans; failure marks excluded. */
export function hourCoverage(spans: HourSpan[], hours = 24): number[] {
  const out = new Array<number>(hours).fill(0)
  for (const s of spans) {
    if (s.failed || !(s.end > s.start)) continue
    for (let h = Math.max(0, Math.floor(s.start)); h < Math.min(hours, Math.ceil(s.end)); h++) {
      out[h] += Math.max(0, Math.min(s.end, h + 1) - Math.max(s.start, h))
    }
  }
  return out.map(v => Math.min(1, v))
}

const SPARK = '▁▂▃▄▅▆▇█'

/** Zero-anchored glyph run. A true zero renders as · so it never reads as a small value. */
export function sparkGlyphs(values: number[]): string {
  const max = Math.max(0, ...values.filter(Number.isFinite))
  return values.map(v => (!Number.isFinite(v) || v <= 0 || max <= 0 ? '·' : SPARK[Math.max(0, Math.min(7, Math.ceil((v / max) * 8) - 1))])).join('')
}
