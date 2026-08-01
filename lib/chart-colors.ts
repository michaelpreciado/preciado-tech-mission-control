/**
 * Chart palette — single source of truth for every series color.
 *
 * The hexes live in app/globals.css as --mc-cat-* / --mc-seq-* / status tokens;
 * these constants mirror them for the many places that need a raw value for an
 * inline style, an SVG stroke, or a drop-shadow. Keep the two in sync.
 *
 * Validated against the dark chart surface (#0a020c) with the dataviz six
 * checks — lightness band, chroma floor, CVD separation (worst adjacent ΔE 11.3
 * under deuteranopia), normal-vision floor (27.1), contrast — all PASS.
 *
 * Rules that keep it valid:
 *   - Assign CATEGORICAL in fixed order, never cycled. A 9th series folds into
 *     "Other" rather than inventing a hue.
 *   - Only the first three slots are all-pairs safe. Any form where arbitrary
 *     marks can end up adjacent (treemap, scatter) must use SEQUENTIAL, where
 *     the label carries identity and the shade carries magnitude.
 *   - STATUS colors are reserved; never reuse one as "series 4".
 */

/** Categorical identity. Slot 1 is the brand accent. */
export const CATEGORICAL = [
  '#1e90ff', // blue — brand
  '#db2777', // magenta
  '#65a30d', // lime
  '#7c3aed', // violet
  '#0d9488', // teal
  '#c2410c', // orange
  '#0891b2', // sky
  '#e11d48', // red
] as const

/** Magnitude, light → dark. */
export const SEQUENTIAL = [
  '#bae0ff', '#7cc0ff', '#3b9dff', '#1e90ff', '#0b7fe8', '#0369a1', '#075985',
] as const

/** Reserved state colors — always paired with an icon or label, never color alone. */
export const STATUS = { ok: '#28c840', warn: '#febc2e', crit: '#ff5f57' } as const

/** Nth categorical slot, clamped — callers must not cycle past the end. */
export function catColor(i: number): string {
  return CATEGORICAL[Math.min(Math.max(i, 0), CATEGORICAL.length - 1)]
}

/**
 * Sequential step for a 0..1 magnitude. Used where identity comes from a label
 * (treemap tiles, usage bars) so hue is free to encode "how much".
 */
export function seqColor(t: number): string {
  if (!Number.isFinite(t)) return SEQUENTIAL[3]
  const i = Math.round(Math.min(Math.max(t, 0), 1) * (SEQUENTIAL.length - 1))
  return SEQUENTIAL[i]
}

/** Soft glow companion for a mark color. */
export function glow(hex: string, alpha = 0.55): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r},${g},${b},${alpha})`
}
