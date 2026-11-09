/** Blue Matrix Glass, approved 2026-10-03. Shared by future MC/native adapters. */
export const THEME_TOKENS = Object.freeze({
  'bg.void': '#05060a',
  'accent.blue': '#00d4ff',
  'accent.blue.deep': '#0092d6',
  'text.primary': '#e8f4ff',
  'text.muted': '#7e9fbc',
  'glass.fill': 'rgba(10,20,34,0.72)',
  'glass.border': 'rgba(0,212,255,0.45)',
  'glass.border.width': '1px',
  'font.sans': '"Geist", sans-serif',
  'font.mono': '"JetBrains Mono", monospace',
} as const)

/**
 * CSS consumer hooks for the web adapters (pipeline radar, deliverables, revenue).
 *
 * Web never re-declares the palette or the font stack: the design tokens in
 * `lib/tokens.ts` own `--pt-font-*` (next/font faces) and every colour, so the
 * native-only values above (Geist, literal JetBrains Mono, #00d4ff) must not
 * leak into the cascade. The `--pt-launcher-*` names are the only hooks these
 * surfaces read; they resolve to the widget tokens.
 */
export const THEME_CSS_VARIABLES: Readonly<Record<string, string>> = Object.freeze({
  '--pt-launcher-glass': 'var(--pt-card-bg)',
  '--pt-launcher-line': 'var(--pt-border)',
  '--pt-launcher-well': 'var(--pt-bg)',
  '--pt-launcher-text': 'var(--pt-text)',
  '--pt-launcher-text-dim': 'var(--pt-text-dim)',
  '--pt-launcher-accent': 'var(--pt-neon)',
})
