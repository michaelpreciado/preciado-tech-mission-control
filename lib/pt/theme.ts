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

/** CSS consumers generate variables from the same values, without a second palette. */
export const THEME_CSS_VARIABLES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(THEME_TOKENS).map(([key, value]) => [`--pt-${key.replaceAll('.', '-')}`, value])),
)
