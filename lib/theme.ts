/**
 * Accent theming — derives the full neon token set from one configurable
 * accent color and emits a CSS override block injected by the root layout.
 * All accent styling in globals.css resolves through these tokens, so one
 * hex in /setup recolors the whole dashboard.
 */

export const DEFAULT_ACCENT = '#ff10f0'

export const ACCENT_PRESETS = [
  { name: 'Neon pink', hex: '#ff10f0' },
  { name: 'Dodger blue', hex: '#1e90ff' },
  { name: 'Matrix green', hex: '#39ff14' },
  { name: 'Amber CRT', hex: '#ffb000' },
  { name: 'Ice cyan', hex: '#00e5ff' },
  { name: 'Blood orange', hex: '#ff4d00' },
] as const

export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v)
}

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

/** Mix a color toward a target (0 = color, 1 = target). */
function mix(rgb: [number, number, number], target: [number, number, number], t: number): [number, number, number] {
  return rgb.map((v, i) => v + (target[i] - v) * t) as [number, number, number]
}

const WHITE: [number, number, number] = [255, 255, 255]
const BLACK: [number, number, number] = [0, 0, 0]

/**
 * CSS override block for a custom accent. Returns '' for the default accent
 * (the stylesheet already carries it).
 */
export function buildAccentCss(accent: string): string {
  const hex = accent.toLowerCase()
  if (!isHexColor(hex) || hex === DEFAULT_ACCENT) return ''
  const rgb = hexToRgb(hex)
  const bright = mix(rgb, WHITE, 0.45)
  const deep = mix(rgb, BLACK, 0.3)
  const text = mix(rgb, WHITE, 0.78)
  const textHigh = mix(rgb, WHITE, 0.93)
  const bgTint = mix(rgb, BLACK, 0.86)
  const vars = [
    `--pt-neon-rgb: ${rgb.map(Math.round).join(',')}`,
    `--pt-neon-bright-rgb: ${bright.map(Math.round).join(',')}`,
    `--pt-text-rgb: ${text.map(Math.round).join(',')}`,
    `--pt-neon: ${hex}`,
    `--pt-neon-bright: ${rgbToHex(bright)}`,
    `--pt-neon-deep: ${rgbToHex(deep)}`,
    `--pt-text: ${rgbToHex(text)}`,
    `--pt-text-high: ${rgbToHex(textHigh)}`,
    `--pt-text-dim: rgba(${text.map(Math.round).join(',')},0.55)`,
    `--pt-text-mute: rgba(${text.map(Math.round).join(',')},0.32)`,
    `--pt-bg-tint: ${rgbToHex(bgTint)}`,
  ].join('; ')
  return `:root, html[data-theme="friday"] { ${vars}; }`
}
