/**
 * lib/tokens.ts — the SINGLE source of truth for the Mission Control design
 * system. Nothing color/type/spacing/motion/border/surface is hardcoded
 * outside this module (CSS consumes the emitted custom properties; components
 * consume the JS token tree for inline styles).
 *
 * The module emits `buildTokenCss()`, a `:root { … }` block injected by the
 * root layout alongside the runtime accent override (`buildAccentCss`). Because
 * globals.css no longer defines these values, this module is authoritative.
 *
 * Design rules enforced here (Phase 1 contract):
 *  - TYPE · three roles only:
 *      display  = mono, variable, for numerals & big values
 *      micro    = mono, UPPERCASE, letter-spaced, for section headers & labels
 *      ui       = monospace, for all prose, body & card content
 *    Mono is the terminal identity for IDs, paths, cron, numbers, labels, and
 *    prose on the Blue Matrix Glass home surface.
 *  - COLOR · one accent + four semantic states (info=action blue, warn=amber,
 *    error=red, ok=green). Red is ALWAYS semantic, never decorative.
 *  - SPACING · 8px scale. One radius. One border color. Two surfaces.
 *    Two glow intensities max per page.
 *  - MOTION · durations/easings declared here (consumed by Phase 2).
 */

/** ── Raw token values (the canonical numbers) ─────────────────────── */

/* Brand periwinkle — the personal-site accent (michael-preciado.com). Borders,
   headings, active nav, brand rims. Keep ACCENT_RGB in sync. */
export const ACCENT_DEFAULT = '#9db4ec'
/* Action blue — links, focus rings, primary buttons. */
export const ACTION_DEFAULT = '#75b9ff'
export const ACTION_RGB = '117,185,255'
/* Dodger blue — glows, halos, the rain, live/streaming indicators ONLY. */
export const NEON_DEFAULT = '#1e90ff'

/* Semantic status palette — the four states, reserved meaning. never reused
   as a categorical slot, never decorative. */
export const SEMANTIC = {
  ok:    { hex: '#28c840', ink: '#2be36b' },   // green
  warn:  { hex: '#febc2e', ink: '#ffc857' },   // amber
  error: { hex: '#ff5f57', ink: '#ff8a83' },   // red — semantic ONLY
  info:  { hex: '#75b9ff', ink: '#a9d2ff' },   // action blue
} as const

/* Categorical chart palette — fixed, never cycled, validated against the dark
   surface. Slot 1 is the brand accent so charts read as part of the UI.
   These are NOT status colors; do not use them for ok/warn/error/info. */
export const CATEGORICAL = {
  cat1: '#1e90ff', cat2: '#db2777', cat3: '#65a30d', cat4: '#7c3aed',
  cat5: '#6366f1', cat6: '#c2410c', cat7: '#0d9488', cat8: '#e11d48',
  seq1: '#bae0ff', seq2: '#7cc0ff', seq3: '#3b9dff', seq4: '#1e90ff',
  seq5: '#0b7fe8', seq6: '#0369a1', seq7: '#075985',
} as const

/* Accent RGB triplets (for rgba() use). Keep in sync with ACCENT_DEFAULT. */
export const ACCENT_RGB = '157,180,236'
export const ACCENT_BRIGHT_RGB = '196,210,245'
export const NEON_RGB = '30,144,255'
/* Dodger ramp for the friday theme's bright/deep accent variants. */
export const MX_NEON_BRIGHT = '#7cc0ff'
export const MX_NEON_BRIGHT_RGB = '124,192,255'
export const MX_NEON_DEEP = '#0b5fb8'

/* Widget palette — measured from the 2026-11-09 launcher captures
   (docs/widget-theme-reference.md). The friday theme IS this look: pure black
   page, flat navy cards, one slate hairline, dodger-blue ink. No glow, no
   gradient, no blur. Cyan is ONE highlight per card, never structure. */
export const WIDGET = {
  bg: '#000000', bgSoft: '#050505',
  card: '#0A0F1A', card2: '#111827',          // card, nested/raised row
  line: '#1E293B', lineDim: '#152033', lineStrong: '#334155',
  accent: '#3B82F6', accentBright: '#60A5FA', accentDeep: '#1D4ED8',
  cyan: '#00A3FF',                             // ONE highlight per card, never structure
  text: '#FFFFFF', text2: '#94A3B8', text3: '#64748B', textSoft: '#CBD5E1',
  segOff: '#111C33',                           // unfilled chart segment
  iconBg: '#13273F',                           // circular icon wells
} as const
export const WIDGET_RGB = { accent: '59,130,246', accentBright: '96,165,250', card: '10,15,26', line: '30,41,59', cyan: '0,163,255', text: '255,255,255' } as const
export const WIDGET_SEMANTIC = {
  ok:    { hex: '#22C55E', ink: '#4ADE80' },   // "all clear" only
  warn:  { hex: '#F59E0B', ink: '#FBBF24' },   // high usage (mem 86%, disk 87%)
  error: { hex: '#EF4444', ink: '#F87171' },
  info:  { hex: '#3B82F6', ink: '#60A5FA' },
} as const
export const WIDGET_RADIUS = { card: '16px', row: '10px', btn: '10px', input: '10px', pill: '999px', sm: '4px' } as const

/* ── Type roles ───────────────────────────────────────────────────── */
export const FONT = {
  display: 'var(--pt-font-sans)',
  /* Sans is reserved for verdict numerals ("3% this week", "4", "71°"). */
  verdict: 'var(--pt-font-sans)',
  /* --mbg-font-* are the next/font variables set on <html> in app/layout.tsx;
     the literal family names never match a self-hosted next/font face. */
  mono: 'var(--mbg-font-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace',
  ui: 'var(--mbg-font-sans), "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif',
} as const

export const TYPE_SCALE = {
  display: 'clamp(25px, 4vw, 55px)',
  h2:      'clamp(23px, 3.1vw, 40px)',
  h3:      'clamp(16px, 1.35vw, 19px)',
  body:    '1rem',
  sm:      '0.875rem',
  xs:      '0.78125rem',
  '2xs':   '0.71875rem',
  kicker:  '0.75rem',
  verdict: 'clamp(28px, 4vw, 44px)',
} as const

export const LINE_HEIGHT = { tight: 1.08, snug: 1.2, body: 1.65, ui: 1.5 } as const
export const LETTER_SPACING = { tight: '-0.02em', bodyMono: '-0.01em', kicker: '0.22em', prompt: '0.02em' } as const

/* ── Spacing — 8px scale ────────────────────────────────────────────
   s-1..s-16 are multiples of 0.25rem (4px) matching the visual 8px rhythm. */
export const SPACING = {
  s1: '0.25rem', s2: '0.5rem', s3: '0.75rem', s4: '1rem',
  s5: '1.25rem', s6: '1.5rem', s8: '2rem', s10: '2.5rem',
  s12: '3rem', s16: '4rem', s20: '5rem',
} as const

/* ── Radius — ONE of each is favored; terminals crisp, corners modest. */
export const RADIUS = { sm: '4px', md: '8px', lg: '12px', pill: '999px' } as const

/* ── Borders — one color family (accent-derived). */
export const BORDER = { dim: 0.15, base: 0.35, strong: 0.7, rule: 0.22 } as const

/* ── Surfaces — PT cinematic near-black ramp. */
export const SURFACE = {
  bg:         '#000000',
  bgSoft:     '#050505',
  surface:    'rgba(16,19,24,0.82)',
  surface2:   'rgba(16,19,24,0.9)',
  terminal:   'rgba(14,17,23,0.78)',
  glassProse: 'rgba(14,17,23,0.96)',
} as const

/* ── Glow — two intensities max on any page (sm for interactive, md for hero). */
export const GLOW = {
  sm: '0 0 6px rgba(var(--pt-glow-rgb),0.45)',
  md: '0 0 14px rgba(var(--pt-glow-rgb),0.5), 0 0 2px rgba(var(--pt-glow-rgb),0.8)',
  text: '0 0 6px rgba(var(--pt-neon-bright-rgb),0.5), 0 0 14px rgba(var(--pt-glow-rgb),0.4)',
} as const

/* ── Motion — declared now, consumed by Phase 2. Never linear except loops. */
export const MOTION = {
  durMicro: '140ms',   // hover / button feedback
  durStd:   '220ms',   // standard transitions
  durComplex: '380ms', // panel / card / kanban
  durAmbient: '800ms', // ambient loops only, min
  easeEnter: 'cubic-bezier(0.4,0,0.2,1)',
  easeExit:  'cubic-bezier(0.4,0,1,1)',
} as const

/* ── Density — compact and expanded card variants. */
export const DENSITY = {
  compact: { py: '16px', px: '18px', gap: '6px' },
  expanded: { py: '24px', px: '28px', gap: '12px' },
} as const

/* Blue Matrix Glass button material. Keep the fill translucent and the rim
   restrained so the surface reads as glass without becoming a glossy card.
   Dodger is the sole decorative hue; red/green retain their existing
   destructive/confirmation meaning. */
export const BUTTON_GLASS = {
  'fill': 'rgba(10,12,14,0.68)',
  'fill-hover': 'rgba(10,12,14,0.78)',
  'fill-disabled': 'rgba(10,12,14,0.84)',
  'neutral-top': 'rgba(190,215,255,0.05)',
  'neutral-bottom': 'rgba(190,215,255,0.012)',
  'primary-top': 'rgba(117,185,255,0.30)',
  'primary-bottom': 'rgba(117,185,255,0.12)',
  'danger-top': 'rgba(255,95,87,0.18)',
  'danger-bottom': 'rgba(255,95,87,0.06)',
  'confirm-top': 'rgba(40,200,64,0.18)',
  'confirm-bottom': 'rgba(40,200,64,0.06)',
  'ink': '#f4f7fb',
  'ink-danger': '#ffd4d1',
  'ink-confirm': '#ccf5d2',
  'ink-disabled': '#a5afbd',
  'line-subtle': 'rgba(255,255,255,0.08)',
  'line-base': 'rgba(255,255,255,0.12)',
  'line-strong': 'rgba(255,255,255,0.18)',
  'rim': 'inset 0 1px 0 rgba(190,215,255,0.18), inset 0 -1px 0 rgba(255,255,255,0.04)',
  'rim-lit': 'inset 0 1px 0 rgba(190,215,255,0.32), inset 0 -1px 0 rgba(255,255,255,0.06)',
  'shadow': '0 5px 14px rgba(0,0,0,0.22)',
  'bloom': '0 0 16px rgba(30,144,255,0.08)',
  'press-shadow': 'inset 0 2px 5px rgba(0,0,0,0.24)',
  'blur': 'blur(10px) saturate(115%)',
  'focus': '#75b9ff',
  'ease': 'cubic-bezier(0.4,0,0.2,1)',
  /* Comparison-only materials; the installed recipe is Edge Light. */
  'frost-fill': 'rgba(10,12,14,0.84)',
  'frost-sheen': 'linear-gradient(180deg, rgba(190,215,255,0.16), rgba(190,215,255,0.035) 48%, transparent)',
  'frost-rim': 'inset 0 2px 0 rgba(190,215,255,0.30), inset 0 -1px 0 rgba(255,255,255,0.06)',
  'frost-shadow': '0 8px 24px rgba(0,0,0,0.32)',
  'frost-blur': 'blur(18px) saturate(120%)',
  'liquid-fill': 'rgba(10,12,14,0.82)',
  'liquid-primary-top': 'rgba(30,144,255,0.42)',
  'liquid-primary-bottom': 'rgba(30,144,255,0.14)',
  'liquid-sheen': 'linear-gradient(115deg, rgba(190,215,255,0.14), transparent 35%, rgba(190,215,255,0.07) 65%, transparent)',
  'liquid-rim': 'inset 0 1px 0 rgba(190,215,255,0.12), inset 0 -1px 0 rgba(255,255,255,0.04)',
  'liquid-blur': 'blur(8px) saturate(120%)',
} as const

/* ── Blue Matrix Glass (Phase A) — the environment and glass vocabulary.
   Emitted as --pt-mx-*. Rain tones are deliberately near-black teal: the data
   streams should register subconsciously, never as bright Matrix green. */
export const MATRIX = {
  'void': '#050506',
  'graphite': '#07090b',
  'carbon': '#0a0a0b',
  'rain-1': '#0b2633',
  'rain-2': '#102e3c',
  'rain-3': '#173744',
  'grid-line': 'rgba(56,189,248,0.035)',
  'neural-line': 'rgba(30,144,255,0.11)',
  'cyan': '#00e5ff',
  'sky': '#38bdf8',
  'cyan-deep': '#082f49',
  /* glass material */
  'glass': 'rgba(10,12,14,0.72)',
  'glass-hi': 'rgba(13,16,20,0.80)',
  'glass-chrome': 'rgba(6,8,10,0.84)',
  'glass-sheen': 'linear-gradient(180deg, rgba(255,255,255,0.032), rgba(255,255,255,0) 38%)',
  'glass-edge': 'linear-gradient(90deg, rgba(0,229,255,0) 0%, rgba(0,229,255,0.38) 22%, rgba(30,144,255,0.18) 60%, rgba(30,144,255,0) 100%)',
  'glass-rim': 'inset 0 1px 0 rgba(255,255,255,0.045)',
  'glass-shadow': '0 18px 48px -24px rgba(0,0,0,0.85), 0 0 30px rgba(0,229,255,0.05)',
  'glass-shadow-hi': '0 22px 56px -22px rgba(0,0,0,0.9), 0 0 34px rgba(0,229,255,0.09)',
  'glass-reflect': 'rgba(30,144,255,0.085)',
  /* hairlines — three tiers, no fourth. strong is interactive-only. */
  'line-subtle': 'rgba(255,255,255,0.06)',
  'line': 'rgba(255,255,255,0.10)',
  'line-strong': 'rgba(255,255,255,0.18)',
  /* ink */
  'ink-head': '#f2f2f2',
  'ink': '#e5e7eb',
  'ink-2': '#94a3b8',
  /* #64748b (spec) measures ~4.2:1 on the void; lifted one step to clear 4.5:1 for 11px metadata. */
  'ink-meta': '#718096',
  'head-glow': '0 0 18px rgba(0,229,255,0.25)',
  /* motion */
  'lift': '-2px',
} as const

export type DesignToken = typeof designTokens
export const designTokens = { semantic: SEMANTIC, categorical: CATEGORICAL, font: FONT, typeScale: TYPE_SCALE, spacing: SPACING, radius: RADIUS, border: BORDER, surface: SURFACE, glow: GLOW, motion: MOTION, density: DENSITY, buttonGlass: BUTTON_GLASS, matrix: MATRIX }

/**
 * Emit the canonical `:root { … }` custom-property block. This replaces the
 * value block that used to live at the top of globals.css, so the tokens
 * module is the one place they're declared.
 */
export function buildTokenCss(): string {
  return `:root {
  /* Shared glass button material (also inherited by the Friday theme). */
${Object.entries(BUTTON_GLASS).map(([name, value]) => `  --pt-btn-glass-${name}: ${value};`).join('\n')}

  /* Blue Matrix Glass environment + glass material */
${Object.entries(MATRIX).map(([name, value]) => `  --pt-mx-${name}: ${value};`).join('\n')}

  /* gutter */
  --mc-gutter: 36px;

  /* categorical chart palette */
  --mc-cat-1: ${CATEGORICAL.cat1}; --mc-cat-2: ${CATEGORICAL.cat2};
  --mc-cat-3: ${CATEGORICAL.cat3}; --mc-cat-4: ${CATEGORICAL.cat4};
  --mc-cat-5: ${CATEGORICAL.cat5}; --mc-cat-6: ${CATEGORICAL.cat6};
  --mc-cat-7: ${CATEGORICAL.cat7}; --mc-cat-8: ${CATEGORICAL.cat8};
  --mc-seq-1: ${CATEGORICAL.seq1}; --mc-seq-2: ${CATEGORICAL.seq2};
  --mc-seq-3: ${CATEGORICAL.seq3}; --mc-seq-4: ${CATEGORICAL.seq4};
  --mc-seq-5: ${CATEGORICAL.seq5}; --mc-seq-6: ${CATEGORICAL.seq6};
  --mc-seq-7: ${CATEGORICAL.seq7};

  /* chart language — every graph reads from these: one grid colour, one axis
     ink, one emphasis colour (the current/latest mark), one quiet tone for the
     rest of the series. Identity hues stay in --mc-cat-*; this is structure. */
  --mc-chart-grid: var(--pt-mx-line-subtle);
  --mc-chart-axis: var(--pt-mx-ink-meta);
  --mc-chart-ink: var(--pt-mx-ink-2);
  --mc-chart-emph: var(--pt-dodger);
  --mc-chart-quiet: rgba(var(--pt-dodger-rgb),0.5);
  --mc-chart-empty: rgba(255,255,255,0.08);
  --mc-chart-glow: 0 0 10px rgba(var(--pt-dodger-rgb),0.5);

  /* widget primitives (.mc-segbar / .mc-hist / .mc-glyph) — palette-relative
     fallbacks; the friday block pins them to the WIDGET values. */
  --mc-seg-on: var(--mc-chart-emph); --mc-seg-off: var(--mc-chart-empty);
  --mc-seg-warn: var(--pt-warn); --mc-seg-crit: var(--pt-error); --mc-seg-cyan: var(--pt-mx-cyan);
  --pt-fs-verdict: ${TYPE_SCALE.verdict};

  /* status (reserved meaning, never categorical) */
  --mc-ok: ${SEMANTIC.ok.hex}; --mc-warn: ${SEMANTIC.warn.hex}; --mc-crit: ${SEMANTIC.error.hex};

  /* semantic states — single source */
  --pt-ok: var(--mc-ok);        --pt-ok-ink: ${SEMANTIC.ok.ink};
  --pt-warn: var(--mc-warn);    --pt-warn-ink: ${SEMANTIC.warn.ink};
  --pt-error: var(--mc-crit);   --pt-error-ink: ${SEMANTIC.error.ink};
  --pt-info: ${SEMANTIC.info.hex}; --pt-info-ink: ${SEMANTIC.info.ink};

  --pt-neon-rgb: ${ACCENT_RGB}; --pt-neon-bright-rgb: ${ACCENT_BRIGHT_RGB};
  /* dodger blue: glows/halos/rain/live only. Borders+text use the periwinkle accent. */
  --pt-glow-rgb: ${NEON_RGB};
  --pt-action: ${ACTION_DEFAULT}; --pt-action-rgb: ${ACTION_RGB};
  --pt-dodger: ${NEON_DEFAULT}; --pt-dodger-rgb: ${NEON_RGB};
  --pt-text-rgb: 244,247,251;
  --pt-bg-tint: #0a0d16;
  /* rgb triplets for rgba() fills (scrims, translucent cards) */
  --pt-bg-rgb: 0,0,0; --pt-card-rgb: 16,19,24;

  /* core surfaces — two elevations */
  --pt-bg: ${SURFACE.bg};
  --pt-bg-soft: ${SURFACE.bgSoft};
  --pt-surface: ${SURFACE.surface};
  --pt-surface-2: ${SURFACE.surface2};
  --pt-bg-terminal: ${SURFACE.terminal};
  --pt-bg-terminal-solid: #0e1117;

  /* text */
  --pt-text: #f4f7fb;
  --pt-text-high: #ffffff;
  --pt-text-dim: #99a3b2;   /* site ink-mute, 7:1 on bg */
  --pt-text-mute: #7f8998;  /* >=4.5:1 on card; site ink-faint #6f7886 is meta-only (--mp-ink-faint) */

  /* accent (overridden at runtime by buildAccentCss when custom) */
  --pt-neon: ${ACCENT_DEFAULT};
  --pt-neon-bright: #c4d2f5;
  --pt-neon-deep: #4f6bb0;
  --pt-neon-glow: rgba(var(--pt-glow-rgb),0.55);
  --pt-neon-glow-soft: rgba(var(--pt-glow-rgb),0.18);
  --pt-neon-wash: rgba(var(--pt-neon-rgb),0.08);

  /* ── mc-* aliases (DESIGN-SPEC §2) — stable names the tab lanes (V1/V2/V3)
     read from their own per-lane stylesheets. Mapped onto the pt-* values
     above so there is one source of truth. */
  --mc-bg: ${SURFACE.bg};
  --mc-bg-2: ${SURFACE.bgSoft};
  --mc-surface: #101318;
  --mc-panel: #0e1117;
  --mc-surface-2: #161b22;
  --mc-ink: var(--pt-text);
  --mc-ink-dim: #c7ced8;
  --mc-ink-mute: #99a3b2;
  --mc-ink-faint: #6f7886;
  --mc-line: rgba(255,255,255,0.08);
  --mc-line-2: rgba(255,255,255,0.16);
  --mc-neon: var(--pt-neon);
  --mc-neon-bright: var(--pt-neon-bright);
  --mc-neon-2: #75b9ff;
  --mc-neon-deep: var(--pt-neon-deep);
  --mc-neon-rgb: var(--pt-neon-rgb);
  --mc-bg-tint: var(--pt-bg-tint);
  --mc-glass: rgba(var(--pt-neon-rgb),0.06);
  --mc-glass-line: rgba(var(--pt-neon-rgb),0.16);

  /* terminal traffic lights (legacy aliases) */
  --pt-tl-red: ${SEMANTIC.error.hex};
  --pt-tl-yellow: ${SEMANTIC.warn.hex};
  --pt-tl-green: ${SEMANTIC.ok.hex};

  /* lines, borders — one color family */
  --pt-border: rgba(var(--pt-neon-rgb),${BORDER.base});
  --pt-border-strong: rgba(var(--pt-neon-rgb),${BORDER.strong});
  --pt-border-dim: rgba(var(--pt-neon-rgb),${BORDER.dim});
  --pt-rule: rgba(var(--pt-neon-rgb),${BORDER.rule});
  --pt-card-border: rgba(255,255,255,0.08);
  --pt-card-bg: rgba(16,19,24,0.82);

  /* glow / shadow — two intensities + text */
  --pt-glow-sm: ${GLOW.sm};
  --pt-glow-md: ${GLOW.md};
  --pt-glow-lg: 0 0 28px rgba(var(--pt-glow-rgb),0.5), 0 0 6px rgba(var(--pt-glow-rgb),0.7), inset 0 0 18px rgba(var(--pt-glow-rgb),0.08);
  --pt-glow-text: ${GLOW.text};
  --pt-shadow-window: 0 24px 80px rgba(0,0,0,0.8), 0 0 24px rgba(var(--pt-glow-rgb),0.3);

  /* bg gradient */
  --pt-bg-gradient:
    radial-gradient(ellipse at top, rgba(var(--pt-glow-rgb),0.1), transparent 55%),
    linear-gradient(180deg, #07080b 0%, #0b0d12 100%);

  /* radii — one family */
  --pt-r-sm: ${RADIUS.sm}; --pt-r-md: ${RADIUS.md}; --pt-r-lg: ${RADIUS.lg}; --pt-r-pill: ${RADIUS.pill};

  /* spacing — 8px scale */
  --pt-s-1: ${SPACING.s1}; --pt-s-2: ${SPACING.s2}; --pt-s-3: ${SPACING.s3};
  --pt-s-4: ${SPACING.s4}; --pt-s-5: ${SPACING.s5}; --pt-s-6: ${SPACING.s6};
  --pt-s-8: ${SPACING.s8}; --pt-s-10: ${SPACING.s10}; --pt-s-12: ${SPACING.s12};
  --pt-s-16: ${SPACING.s16}; --pt-s-20: ${SPACING.s20};

  /* type — three roles */
  --pt-font-mono: ${FONT.mono};
  --pt-font-display: ${FONT.display};
  /* System UI stack avoids font downloads and fallback metric shifts. */
  --pt-font-sans: ${FONT.ui};
  --pt-font-ui: var(--pt-font-sans);
  --mc-font-jp: var(--pt-font-sans);

  /* type scale */
  --pt-fs-display: ${TYPE_SCALE.display};
  --pt-fs-h2: ${TYPE_SCALE.h2}; --pt-fs-h3: ${TYPE_SCALE.h3};
  --pt-fs-body: ${TYPE_SCALE.body}; --pt-fs-sm: ${TYPE_SCALE.sm};
  --pt-fs-xs: ${TYPE_SCALE.xs}; --pt-fs-2xs: ${TYPE_SCALE['2xs']}; --pt-fs-kicker: ${TYPE_SCALE.kicker};

  /* personal-site (michael-preciado.com) aliases — mapped onto the pt/mc system */
  --mp-bg: ${SURFACE.bg}; --mp-raised: ${SURFACE.bgSoft}; --mp-card: #101318;
  --mp-ink: #f4f7fb; --mp-ink-dim: #c7ced8; --mp-ink-mute: #99a3b2; --mp-ink-faint: #6f7886;
  --mp-line: rgba(255,255,255,0.08); --mp-line-2: rgba(255,255,255,0.16);
  --mp-accent: ${ACCENT_DEFAULT}; --mp-accent-rgb: ${ACCENT_RGB};

  --pt-lh-tight: ${LINE_HEIGHT.tight}; --pt-lh-snug: ${LINE_HEIGHT.snug};
  --pt-lh-body: ${LINE_HEIGHT.body}; --pt-lh-ui: ${LINE_HEIGHT.ui};

  --pt-ls-tight: ${LETTER_SPACING.tight}; --pt-ls-body-mono: ${LETTER_SPACING.bodyMono};
  --pt-ls-kicker: ${LETTER_SPACING.kicker};
  --pt-ls-prompt: ${LETTER_SPACING.prompt};

  /* motion */
  --pt-ease: cubic-bezier(0.4,0,0.2,1);
  --pt-dur-slow: 380ms;
  --pt-dur-fast: ${MOTION.durMicro};
  --pt-dur-med: ${MOTION.durStd};
  /* Full MOTION token set (lib/tokens.ts) — durations named after their role
     plus the enter/exit easing curves. Phase 2 (.mc-btn) is the first
     consumer; new interactive/motion CSS should read from these, not repeat
     magic numbers. */
  --pt-dur-micro: ${MOTION.durMicro};
  --pt-dur-std: ${MOTION.durStd};
  --pt-dur-complex: ${MOTION.durComplex};
  --pt-dur-ambient: ${MOTION.durAmbient};
  --pt-ease-enter: ${MOTION.easeEnter};
  --pt-ease-exit: ${MOTION.easeExit};

  /* density — compact/expanded card padding+gap (Setup → UI CUSTOMIZATION).
     Compact is the default here; buildDensityCss() below overrides these to
     DENSITY.expanded under html[data-density="expanded"]. */
  --mc-density-py: ${DENSITY.compact.py};
  --mc-density-px: ${DENSITY.compact.px};
  --mc-density-gap: ${DENSITY.compact.gap};

  /* site scanlines — apply at ~.35 opacity on hero/brand surfaces only */
  --pt-scanline: repeating-linear-gradient(to bottom, rgba(0,0,0,.22) 0 1px, transparent 1px 3px);
  --pt-scanline-opacity: .35;
}
`
}

/** Emit the `html[data-density="expanded"]` override — the only other place
 * DENSITY values may legally appear in CSS. `html[data-density]` itself is
 * stamped server-side in app/layout.tsx from Setup → UI CUSTOMIZATION. */
export function buildDensityCss(): string {
  return `html[data-density="expanded"] {
  --mc-density-py: ${DENSITY.expanded.py};
  --mc-density-px: ${DENSITY.expanded.px};
  --mc-density-gap: ${DENSITY.expanded.gap};
}
`
}

/** Emit the FRIDAY theme block — the launcher widget look (§1.1 of
 * docs/polish-plan-2026-11-09.md). Every effect token resolves to none /
 * transparent so the legacy rule blocks that still read them paint flat. The
 * Launcher/Omarchy palettes ride data-palette at higher specificity and
 * re-declare what they need; a custom /setup accent still overrides the accent. */
export function buildFridayThemeCss(): string {
  const w = WIDGET
  const r = WIDGET_RGB
  const s = WIDGET_SEMANTIC
  const rad = WIDGET_RADIUS
  return `html[data-theme="friday"] {
  color-scheme: dark;
  /* accent */
  --pt-neon: ${w.accent}; --pt-neon-rgb: ${r.accent}; --pt-neon-bright: ${w.accentBright}; --pt-neon-bright-rgb: ${r.accentBright};
  --pt-neon-deep: ${w.accentDeep}; --pt-action: ${w.accent}; --pt-action-rgb: ${r.accent};
  --pt-dodger: ${w.accent}; --pt-dodger-rgb: ${r.accent}; --pt-glow-rgb: ${r.accent};
  --pt-neon-glow: transparent; --pt-neon-glow-soft: transparent; --pt-neon-wash: rgba(${r.accent},0.08);
  /* surfaces */
  --pt-bg: ${w.bg}; --pt-bg-soft: ${w.bgSoft}; --pt-bg-tint: ${w.bg}; --pt-bg-rgb: 0,0,0; --pt-card-rgb: ${r.card};
  --pt-surface: ${w.card}; --pt-surface-2: ${w.card2}; --pt-card-bg: ${w.card};
  --pt-bg-terminal: ${w.card}; --pt-bg-terminal-solid: ${w.card};
  --pt-bg-gradient: none;
  /* text */
  --pt-text: ${w.text}; --pt-text-high: ${w.text}; --pt-text-rgb: ${r.text};
  --pt-text-dim: ${w.text2}; --pt-text-mute: ${w.text3};
  /* lines — slate paints structure, accent never does */
  --pt-border: ${w.line}; --pt-border-strong: ${w.lineStrong}; --pt-border-dim: ${w.lineDim}; --pt-rule: ${w.line};
  --pt-card-border: ${w.line}; --pt-card-rim: none;
  /* effects — all off */
  --pt-glow-sm: none; --pt-glow-md: none; --pt-glow-lg: none; --pt-glow-text: none; --pt-glow-live: none;
  --pt-shadow-window: none; --pt-scanline: none; --pt-scanline-opacity: 0;
  /* radii */
  --pt-r-sm: ${rad.sm}; --pt-r-md: ${rad.row}; --pt-r-lg: ${rad.card}; --pt-r-pill: ${rad.pill};
  --pt-radius-card: ${rad.card}; --pt-radius-row: ${rad.row}; --pt-radius-btn: ${rad.btn}; --pt-radius-input: ${rad.input}; --pt-radius-pill: ${rad.pill};
  --ob-radius-card: ${rad.card}; --ob-radius-control: ${rad.btn};
  /* semantic */
  --mc-ok: ${s.ok.hex}; --mc-warn: ${s.warn.hex}; --mc-crit: ${s.error.hex};
  --pt-ok: ${s.ok.hex}; --pt-ok-ink: ${s.ok.ink}; --pt-warn: ${s.warn.hex}; --pt-warn-ink: ${s.warn.ink};
  --pt-error: ${s.error.hex}; --pt-error-ink: ${s.error.ink}; --pt-info: ${s.info.hex}; --pt-info-ink: ${s.info.ink};
  --pt-tl-red: ${s.error.hex}; --pt-tl-yellow: ${s.warn.hex}; --pt-tl-green: ${s.ok.hex};
  /* mc-* / mp-* aliases */
  --mc-bg: ${w.bg}; --mc-bg-2: ${w.bgSoft}; --mc-surface: ${w.card}; --mc-panel: ${w.card}; --mc-surface-2: ${w.card2};
  --mc-ink: ${w.text}; --mc-ink-dim: ${w.textSoft}; --mc-ink-mute: ${w.text2}; --mc-ink-faint: ${w.text3};
  --mc-line: ${w.line}; --mc-line-2: ${w.lineStrong}; --mc-neon: ${w.accent}; --mc-neon-bright: ${w.accentBright}; --mc-neon-2: ${w.accent};
  --mc-neon-deep: ${w.accentDeep}; --mc-neon-rgb: ${r.accent}; --mc-bg-tint: ${w.bg}; --mc-glass: ${w.card}; --mc-glass-line: ${w.line};
  --mp-bg: ${w.bg}; --mp-raised: ${w.bgSoft}; --mp-card: ${w.card}; --mp-ink: ${w.text}; --mp-ink-dim: ${w.textSoft};
  --mp-ink-mute: ${w.text2}; --mp-ink-faint: ${w.text3}; --mp-line: ${w.line}; --mp-line-2: ${w.lineStrong};
  --mp-accent: ${w.accent}; --mp-accent-rgb: ${r.accent};
  /* chart language — var()-relative so the opt-in palettes keep their own hue */
  --mc-chart-grid: ${w.lineDim}; --mc-chart-axis: var(--pt-text-mute); --mc-chart-ink: var(--pt-text-dim);
  --mc-chart-emph: var(--pt-dodger); --mc-chart-quiet: var(--pt-neon-deep); --mc-chart-empty: ${w.segOff}; --mc-chart-glow: none;
  /* glass vocabulary (--pt-mx-*) collapses to flat */
  --pt-mx-void: ${w.bg}; --pt-mx-graphite: ${w.bg}; --pt-mx-carbon: ${w.bgSoft};
  --pt-mx-cyan: ${w.cyan}; --pt-mx-sky: ${w.accent}; --pt-mx-cyan-deep: ${w.lineDim};
  --pt-mx-glass: ${w.card}; --pt-mx-glass-hi: ${w.card2}; --pt-mx-glass-chrome: ${w.bg};
  --pt-mx-glass-sheen: none; --pt-mx-glass-edge: none; --pt-mx-glass-rim: none;
  --pt-mx-glass-shadow: none; --pt-mx-glass-shadow-hi: none; --pt-mx-glass-reflect: transparent;
  --pt-mx-line-subtle: ${w.lineDim}; --pt-mx-line: ${w.line}; --pt-mx-line-strong: ${w.lineStrong};
  --pt-mx-ink-head: ${w.text}; --pt-mx-ink: ${w.text}; --pt-mx-ink-2: ${w.text2}; --pt-mx-ink-meta: ${w.text3};
  --pt-mx-head-glow: none; --pt-mx-grid-line: transparent; --pt-mx-neural-line: transparent;
  /* matrix-blue.css (--mbg-*) and aurora.css (--aur-*) layers */
  --mbg-void: ${w.bg}; --mbg-deck: ${w.card}; --mbg-deck-2: ${w.card2}; --mbg-rule: ${w.line}; --mbg-rule-strong: ${w.lineStrong};
  --mbg-ink: ${w.text}; --mbg-ink-2: ${w.text2}; --mbg-ink-3: ${w.text3}; --mbg-dodger-ink: ${w.accentBright};
  --mbg-amber: ${s.warn.hex}; --mbg-red: ${s.error.hex}; --mbg-green: ${s.ok.hex}; --mbg-cyan: ${w.cyan};
  --mbg-edge: ${w.line}; --mbg-edge-hi: ${w.lineStrong}; --mbg-sheen: none; --mbg-inset: none;
  --mbg-glass-1: ${w.card}; --mbg-glass-1-hover: ${w.card2}; --mbg-glass-2: ${w.card}; --mbg-glass-3: ${w.card}; --mbg-solid-3: ${w.card};
  --aur-ink-0: ${w.bg}; --aur-ink-1: ${w.bgSoft}; --aur-ink-2: ${w.card}; --aur-ink-3: ${w.card2}; --aur-ink-4: ${w.lineDim};
  --aur-bg: ${w.bg}; --aur-surface-hover: ${w.card2}; --aur-accent-strong: ${w.accentBright}; --aur-accent-deep: ${w.accentDeep};
  --aur-accent-ink: ${w.bg}; --aur-accent-wash: rgba(${r.accent},0.08); --aur-accent-glow: transparent;
  --aur-ok: ${s.ok.hex}; --aur-warn: ${s.warn.hex}; --aur-error: ${s.error.hex}; --aur-error-wash: rgba(239,68,68,0.10); --aur-stale: ${w.text3};
  --aur-bloom-1: transparent; --aur-bloom-2: transparent; --aur-glass-bg: ${w.card}; --aur-glass-border: ${w.line};
  --aur-highlight: none; --aur-fill-faint: rgba(${r.accent},0.06); --aur-now: ${w.text};
  --aur-radius-sm: ${rad.row}; --aur-radius-md: ${rad.card}; --aur-radius-lg: ${rad.card};
  /* globals.css --ob-* / --glass-* / --vg-* */
  --ob-bg-0: ${w.bg}; --ob-bg-1: ${w.bgSoft}; --ob-glass: ${w.card}; --ob-border: ${w.line}; --ob-glow: none;
  --ob-surface-highlight: none; --ob-page-ambience: none; --ob-text: ${w.text}; --ob-text-2: ${w.textSoft}; --ob-text-3: ${w.text2}; --ob-text-4: ${w.text3};
  --glass-1-fill: ${w.bg}; --glass-1-rim: ${w.line}; --glass-1-shadow: none; --glass-1-sheen: none; --glass-1-blur: none;
  --glass-2-fill: ${w.card}; --glass-2-rim: ${w.line}; --glass-2-shadow: none; --glass-2-sheen: none; --glass-2-blur: none;
  --glass-3-fill: ${w.card}; --glass-3-rim: ${w.lineStrong}; --glass-3-shadow: none; --glass-3-sheen: none; --glass-3-blur: none; --glass-3-scrim-blur: none;
  --vg-electric-glow: transparent; --vg-violet-glow: transparent;
  --vg-ok-glow: transparent; --vg-warn-glow: transparent; --vg-danger-glow: transparent; --vg-info-glow: transparent; --vg-money-glow: transparent;
  /* buttons: flat */
  --pt-btn-glass-fill: ${w.card}; --pt-btn-glass-fill-hover: ${w.card2}; --pt-btn-glass-fill-disabled: ${w.bgSoft};
  --pt-btn-glass-neutral-top: transparent; --pt-btn-glass-neutral-bottom: transparent;
  --pt-btn-glass-primary-top: ${w.accent}; --pt-btn-glass-primary-bottom: ${w.accent};
  --pt-btn-glass-ink: ${w.text}; --pt-btn-glass-ink-disabled: ${w.text3};
  --pt-btn-glass-line-subtle: ${w.lineDim}; --pt-btn-glass-line-base: ${w.line}; --pt-btn-glass-line-strong: ${w.lineStrong};
  --pt-btn-glass-rim: none; --pt-btn-glass-rim-lit: none; --pt-btn-glass-shadow: none; --pt-btn-glass-bloom: none;
  --pt-btn-glass-press-shadow: none; --pt-btn-glass-blur: none; --pt-btn-glass-focus: ${w.accent};
  --pt-btn-glass-ink-danger: ${s.error.ink}; --pt-btn-glass-ink-confirm: ${w.accentBright};
  /* compat alias for the undefined var still read by CostsPanel (Lane B removes the usages) */
  --font-mono: var(--pt-font-mono);
  /* type */
  --pt-fs-verdict: ${TYPE_SCALE.verdict};
  --pt-ls-kicker: 0.08em;   /* widgets are lowercase mono; kickers are quiet */
  font-feature-settings: "ss01","zero";
}
`
}

/* ── Omarchy (Preciado Tech) palette ────────────────────────────────
   Verbatim from /usr/share/omarchy/themes/lumon/colors.toml. Surfaces, text,
   accent and chrome adopt these EXACTLY; ok/warn/error are the one deliberate
   exception (see OMARCHY_SEMANTIC). */
export const OMARCHY = {
  accent: '#8bc9eb', selection: '#243d56', muted: '#304860',
  background: '#16242d', darkBackground: '#101b21', darkerBackground: '#0b1216', lighterBackground: '#1b2d40',
  foreground: '#d6e2ee', darkForeground: '#4d86b0', lightForeground: '#d6e2ee', brightForeground: '#f2fcff',
  activeBorder: '#f2fcff', activeTab: '#6fb8e3',
  red: '#4d86b0', yellow: '#6fa4c9', orange: '#8bc9eb', green: '#5e95bc', cyan: '#b4e4f6',
  blue: '#6fb8e3', magenta: '#8bc9eb', brown: '#456475',
  brightRed: '#73a6cb', brightYellow: '#9dcae5', brightGreen: '#86b7d8', brightCyan: '#d1eef8',
  brightBlue: '#f2fcff', brightMagenta: '#b1d8ee',
} as const

export const OMARCHY_ACCENT = OMARCHY.accent
/* Triplets for rgba(). Keep in sync with OMARCHY above. */
const OMARCHY_RGB = {
  accent: '139,201,235', bright: '242,252,255', text: '214,226,238', muted: '48,72,96',
  dim: '77,134,176', action: '111,184,227', bg: '11,18,22', soft: '16,27,33', raised: '22,36,45', raised2: '27,45,64',
} as const

/* Lumon's red/green are blues, which would make error/warn/ok
   indistinguishable. `adaptive` (default) keeps three distinguishable hues,
   desaturated to sit calmly on #101b21; `purist` is the literal palette. */
export const OMARCHY_SEMANTIC = {
  adaptive: {
    ok:    { hex: '#6dbf8b', ink: '#8fd3a8' },
    warn:  { hex: '#d9b25f', ink: '#e6c981' },
    error: { hex: '#d9726c', ink: '#e89a95' },
    info:  { hex: OMARCHY.blue, ink: OMARCHY.cyan },
  },
  purist: {
    ok:    { hex: OMARCHY.green, ink: OMARCHY.brightGreen },
    warn:  { hex: OMARCHY.yellow, ink: OMARCHY.brightYellow },
    error: { hex: OMARCHY.red, ink: OMARCHY.brightRed },
    info:  { hex: OMARCHY.blue, ink: OMARCHY.cyan },
  },
} as const

function omarchySemanticVars(mode: keyof typeof OMARCHY_SEMANTIC): string {
  const s = OMARCHY_SEMANTIC[mode]
  return `  --mc-ok: ${s.ok.hex}; --mc-warn: ${s.warn.hex}; --mc-crit: ${s.error.hex};
  --pt-ok: ${s.ok.hex};       --pt-ok-ink: ${s.ok.ink};
  --pt-warn: ${s.warn.hex};   --pt-warn-ink: ${s.warn.ink};
  --pt-error: ${s.error.hex}; --pt-error-ink: ${s.error.ink};
  --pt-info: ${s.info.hex};   --pt-info-ink: ${s.info.ink};
  --pt-tl-red: ${s.error.hex}; --pt-tl-yellow: ${s.warn.hex}; --pt-tl-green: ${s.ok.hex};
  --pt-btn-glass-confirm-top: ${s.ok.hex}2e; --pt-btn-glass-confirm-bottom: ${s.ok.hex}0f;
  --pt-btn-glass-danger-top: ${s.error.hex}2e; --pt-btn-glass-danger-bottom: ${s.error.hex}0f;
  --pt-btn-glass-ink-danger: ${s.error.ink}; --pt-btn-glass-ink-confirm: ${s.ok.ink};
`
}

/**
 * Emit the OMARCHY theme block. Selectors:
 *  - `html[data-theme="omarchy"]`            literal theme switch
 *  - `html[data-theme][data-palette=…]`      what the root layout stamps. The
 *    structural theme stays `friday` (112+ globals.css rules key on it), so the
 *    palette rides a second attribute at higher specificity.
 *  - `[data-palette="omarchy"]`              any wrapper element (styleguide
 *    side-by-side). Custom properties that were var()-resolved at :root are
 *    re-declared here so they re-resolve against the new values.
 * Switch: `--pt-semantic-mode: adaptive | purist` (one line, below).
 */
export function buildOmarchyThemeCss(): string {
  const o = OMARCHY
  const r = OMARCHY_RGB
  return `html[data-theme="omarchy"],
html[data-theme][data-palette="omarchy"],
[data-palette="omarchy"] {
  /* SEMANTIC MODE — adaptive (default): distinguishable green/amber/red.
     purist: literal monochrome lumon values. Flip this one line. */
  --pt-semantic-mode: adaptive;

  /* raw lumon palette (colors.toml) */
  --pt-omarchy-accent: ${o.accent}; --pt-omarchy-selection: ${o.selection}; --pt-omarchy-muted: ${o.muted};
  --pt-omarchy-bg: ${o.background}; --pt-omarchy-bg-dark: ${o.darkBackground};
  --pt-omarchy-bg-darker: ${o.darkerBackground}; --pt-omarchy-bg-lighter: ${o.lighterBackground};
  --pt-omarchy-fg: ${o.foreground}; --pt-omarchy-fg-dark: ${o.darkForeground}; --pt-omarchy-fg-bright: ${o.brightForeground};
  --pt-omarchy-active-border: ${o.activeBorder}; --pt-omarchy-active-tab: ${o.activeTab};
  --pt-selection: ${o.selection}; --pt-muted: ${o.muted};
  --pt-active-tab: ${o.activeTab}; --pt-active-border: ${o.activeBorder};

  /* accent rgb triplets — other rules build rgba() from these */
  --pt-neon-rgb: ${r.accent};
  --pt-glow-rgb: ${r.accent};
  --pt-neon-bright-rgb: ${r.bright};
  --pt-text-rgb: ${r.text};
  --pt-action-rgb: ${r.action};
  --pt-action: ${o.activeTab};
  --pt-dodger: ${o.activeTab}; --pt-dodger-rgb: ${r.action};
  --pt-bg-tint: ${o.darkBackground};

  /* surfaces */
  --pt-bg: ${o.darkerBackground};
  --pt-bg-soft: ${o.darkBackground};
  --pt-surface: rgba(${r.raised},0.82);
  --pt-surface-2: rgba(${r.raised2},0.9);
  --pt-bg-terminal: rgba(${r.soft},0.96);
  --pt-bg-terminal-solid: ${o.darkBackground};
  --pt-card-bg: rgba(${r.raised},0.82);
  --pt-bg-gradient:
    radial-gradient(ellipse at top, rgba(${r.raised2},0.55), transparent 55%),
    linear-gradient(180deg, ${o.darkerBackground} 0%, ${o.darkBackground} 100%);

  /* text */
  --pt-text: ${o.foreground};
  --pt-text-high: ${o.brightForeground};
  --pt-text-dim: ${o.darkForeground};
  --pt-text-mute: ${o.brown};

  /* accent */
  --pt-neon: ${o.accent};
  --pt-neon-bright: ${o.brightForeground};
  --pt-neon-deep: ${o.activeTab};
  --pt-neon-glow: rgba(var(--pt-glow-rgb),0.45);
  --pt-neon-glow-soft: rgba(var(--pt-glow-rgb),0.14);
  --pt-neon-wash: rgba(var(--pt-neon-rgb),0.08);

  /* hairlines derive from muted ${o.muted}; accent never paints structure */
  --pt-border: rgba(${r.muted},0.85);
  --pt-border-strong: rgba(${r.dim},0.6);
  --pt-border-dim: rgba(${r.muted},0.45);
  --pt-rule: rgba(${r.muted},0.6);
  --pt-card-border: rgba(${r.muted},0.7);

  /* glow / shadow — re-declared so they re-resolve against the rgb above */
  --pt-glow-sm: 0 0 6px rgba(var(--pt-glow-rgb),0.4);
  --pt-glow-md: 0 0 14px rgba(var(--pt-glow-rgb),0.4), 0 0 2px rgba(var(--pt-glow-rgb),0.7);
  --pt-glow-lg: 0 0 28px rgba(var(--pt-glow-rgb),0.4), 0 0 6px rgba(var(--pt-glow-rgb),0.6), inset 0 0 18px rgba(var(--pt-glow-rgb),0.06);
  --pt-glow-text: 0 0 6px rgba(var(--pt-neon-bright-rgb),0.4), 0 0 14px rgba(var(--pt-glow-rgb),0.3);
  --pt-shadow-window: 0 24px 80px rgba(0,0,0,0.8), 0 0 24px rgba(var(--pt-glow-rgb),0.2);

  /* mc-* / mp-* aliases (var()-resolved at :root, so re-declared) */
  --mc-bg: ${o.darkerBackground}; --mc-bg-2: ${o.darkBackground};
  --mc-surface: ${o.background}; --mc-panel: ${o.darkBackground}; --mc-surface-2: ${o.lighterBackground};
  --mc-ink: ${o.foreground}; --mc-ink-dim: rgba(${r.text},0.72);
  --mc-ink-mute: ${o.darkForeground}; --mc-ink-faint: ${o.brown};
  --mc-line: rgba(${r.muted},0.7); --mc-line-2: ${o.muted};
  --mc-neon: ${o.accent}; --mc-neon-bright: ${o.brightForeground}; --mc-neon-2: ${o.activeTab};
  --mc-neon-deep: ${o.activeTab}; --mc-neon-rgb: ${r.accent}; --mc-bg-tint: ${o.darkBackground};
  --mc-glass: rgba(${r.accent},0.06); --mc-glass-line: rgba(${r.muted},0.9);
  --mp-bg: ${o.darkerBackground}; --mp-raised: ${o.darkBackground}; --mp-card: ${o.background};
  --mp-ink: ${o.foreground}; --mp-ink-dim: rgba(${r.text},0.72); --mp-ink-mute: ${o.darkForeground}; --mp-ink-faint: ${o.brown};
  --mp-line: rgba(${r.muted},0.7); --mp-line-2: ${o.muted};
  --mp-accent: ${o.accent}; --mp-accent-rgb: ${r.accent};

  /* glass button material */
  --pt-btn-glass-fill: rgba(${r.bg},0.68); --pt-btn-glass-fill-hover: rgba(${r.bg},0.78); --pt-btn-glass-fill-disabled: rgba(${r.bg},0.84);
  --pt-btn-glass-neutral-top: rgba(${r.text},0.05); --pt-btn-glass-neutral-bottom: rgba(${r.text},0.012);
  --pt-btn-glass-primary-top: rgba(${r.action},0.30); --pt-btn-glass-primary-bottom: rgba(${r.action},0.12);
  --pt-btn-glass-ink: ${o.brightForeground}; --pt-btn-glass-ink-disabled: ${o.darkForeground};
  --pt-btn-glass-line-subtle: rgba(${r.muted},0.5); --pt-btn-glass-line-base: rgba(${r.muted},0.8); --pt-btn-glass-line-strong: rgba(${r.dim},0.6);
  --pt-btn-glass-rim: inset 0 1px 0 rgba(${r.text},0.16), inset 0 -1px 0 rgba(${r.text},0.04);
  --pt-btn-glass-rim-lit: inset 0 1px 0 rgba(${r.text},0.3), inset 0 -1px 0 rgba(${r.text},0.06);
  --pt-btn-glass-bloom: 0 0 16px rgba(${r.accent},0.08);
  --pt-btn-glass-focus: ${o.accent};

  /* glass / environment */
  --pt-mx-void: ${o.darkerBackground}; --pt-mx-graphite: ${o.darkerBackground}; --pt-mx-carbon: ${o.darkBackground};
  --pt-mx-cyan: ${o.brightCyan}; --pt-mx-sky: ${o.accent}; --pt-mx-cyan-deep: ${o.selection};
  --pt-mx-glass: rgba(${r.soft},0.72); --pt-mx-glass-hi: rgba(${r.raised},0.8); --pt-mx-glass-chrome: rgba(${r.bg},0.84);
  --pt-mx-glass-edge: linear-gradient(90deg, rgba(${r.accent},0) 0%, rgba(${r.accent},0.38) 22%, rgba(${r.action},0.18) 60%, rgba(${r.action},0) 100%);
  --pt-mx-glass-reflect: rgba(${r.action},0.085);
  --pt-mx-glass-shadow: 0 18px 48px -24px rgba(0,0,0,0.85), 0 0 30px rgba(${r.accent},0.04);
  --pt-mx-glass-shadow-hi: 0 22px 56px -22px rgba(0,0,0,0.9), 0 0 34px rgba(${r.accent},0.07);
  --pt-mx-line-subtle: rgba(${r.muted},0.45); --pt-mx-line: rgba(${r.muted},0.7); --pt-mx-line-strong: rgba(${r.dim},0.6);
  --pt-mx-ink-head: ${o.brightForeground}; --pt-mx-ink: ${o.foreground}; --pt-mx-ink-2: ${o.darkForeground}; --pt-mx-ink-meta: ${o.darkForeground};
  --pt-mx-head-glow: 0 0 18px rgba(${r.accent},0.18);
  --pt-mx-grid-line: rgba(${r.accent},0.035); --pt-mx-neural-line: rgba(${r.action},0.11);
  --pt-mx-rain-1: ${o.darkBackground}; --pt-mx-rain-2: ${o.background}; --pt-mx-rain-3: ${o.lighterBackground};

${omarchySemanticVars('adaptive')}}

/* purist: style query on the switch above. A style query matches the nearest
   ancestor's computed value, so it is applied one level down (body, or an
   element marked data-pt-semantic-root inside a [data-palette] wrapper). */
@container style(--pt-semantic-mode: purist) {
  body, [data-pt-semantic-root] {
${omarchySemanticVars('purist')}  }
}
`
}

/* ── OmaLauncher (phone home screen) palette ────────────────────────
   Measured from Michael's OmaLauncher footage (720x1562 frames,
   artifacts/launcher-theme/reference/). Slate glass, cyan structure: unlike
   friday, accent DOES paint borders here. Signal cyan is glow/live only. */
export const OMALAUNCHER = {
  bg: '#16222b', deep: '#101a22', deepest: '#0b1216',
  card: '#253340', raisedHover: '#1f3240',
  accent: '#6fb8e3', bright: '#b4e4f6', accentDeep: '#4d86b0', signal: '#4fe3ff',
  text: '#d6e2ee', textHigh: '#f2fcff', dim: '#4d86b0', mute: '#304860',
  /* Measured dim/mute fall under 4.5:1 as copy on cards (3.6 / 1.5), so text
     tokens use these lifted steps of the same hue; dim/mute stay structural. */
  textDim: '#7aa3c4', textMute: '#6a9cc2',
} as const

/* Triplets for rgba(). Keep in sync with OMALAUNCHER above. */
export const OMALAUNCHER_RGB = {
  bg: '22,34,43', deep: '16,26,34', deepest: '11,18,22',
  card: '37,51,64', raisedHover: '31,50,64', control: '70,110,140',
  accent: '111,184,227', bright: '180,228,246', accentDeep: '77,134,176', signal: '79,227,255',
  text: '214,226,238', textHigh: '242,252,255', mute: '48,72,96',
} as const

export const OMALAUNCHER_SEMANTIC = {
  ok:    { hex: '#4fd6a0', ink: '#8ce8c1' },
  warn:  { hex: '#e8b45a', ink: '#f2cd8a' },
  error: { hex: '#ff6b6b', ink: '#ff9d9d' },
  info:  { hex: OMALAUNCHER.accent, ink: OMALAUNCHER.bright },
} as const

/* Shape: cards 14, rows/chips/buttons/inputs 10, pills 999. */
export const OMALAUNCHER_RADIUS = { card: '14px', row: '10px', btn: '10px', input: '10px', pill: '999px', sm: '8px' } as const

/**
 * Emit the LAUNCHER theme block. Same selector shape as buildOmarchyThemeCss():
 * the structural theme stays `friday`; the palette rides data-palette at higher
 * specificity, and any [data-palette="launcher"] wrapper re-scopes it (styleguide).
 * Re-declares the --mbg-* (matrix-blue.css) and --aur-* (aurora.css) layers too,
 * since their :root values are literals, not var()s.
 */
export function buildLauncherThemeCss(): string {
  const o = OMALAUNCHER
  const r = OMALAUNCHER_RGB
  const s = OMALAUNCHER_SEMANTIC
  const rad = OMALAUNCHER_RADIUS
  const line = { strong: `rgba(${r.accent},0.30)`, base: `rgba(${r.accent},0.18)`, subtle: `rgba(${r.accent},0.10)` }
  const glass = `rgba(${r.card},0.62)`
  const glassHi = `rgba(${r.card},0.72)`
  const glassLo = `rgba(${r.card},0.55)`
  const highlight = `inset 0 1px 0 rgba(${r.bright},0.06)`
  const glow = `0 0 12px rgba(${r.signal},0.35)`
  return `html[data-theme="friday"][data-palette="launcher"],
html[data-theme][data-palette="launcher"],
[data-palette="launcher"] {
  --pt-semantic-mode: adaptive;
  color-scheme: dark;

  /* raw launcher palette (measured) */
  --pt-launcher-bg: ${o.bg}; --pt-launcher-deep: ${o.deep}; --pt-launcher-deepest: ${o.deepest};
  --pt-launcher-card: ${o.card}; --pt-launcher-raised-hover: ${o.raisedHover};
  --pt-launcher-accent: ${o.accent}; --pt-launcher-bright: ${o.bright}; --pt-launcher-accent-deep: ${o.accentDeep};
  --pt-launcher-signal: ${o.signal};
  --pt-launcher-text: ${o.text}; --pt-launcher-text-high: ${o.textHigh};
  --pt-launcher-dim: ${o.dim}; --pt-launcher-mute: ${o.mute};
  --pt-launcher-text-dim: ${o.textDim}; --pt-launcher-text-mute: ${o.textMute};
  /* consumer hooks for lib/pt/theme.ts inline vars (pipeline radar, deliverables) */
  --pt-launcher-page: transparent; --pt-launcher-glass: ${glass}; --pt-launcher-line: ${line.base};
  --pt-launcher-well: rgba(${r.deep},0.6);
  /* rgb hooks: hardcoded literals elsewhere read these with their original
     value as the var() fallback, so friday renders unchanged */
  --pt-launcher-card-rgb: ${r.card}; --pt-launcher-signal-rgb: ${r.signal};
  --pt-launcher-accent-rgb: ${r.accent}; --pt-launcher-bright-rgb: ${r.bright};
  --pt-launcher-control-rgb: ${r.control};
  --pt-launcher-bg-rgb: ${r.bg}; --pt-launcher-deep-rgb: ${r.deep}; --pt-launcher-deepest-rgb: ${r.deepest};
  --pt-selection: rgba(${r.accent},0.24); --pt-muted: ${o.mute};
  --pt-active-tab: ${o.accent}; --pt-active-border: ${o.bright};

  /* shape */
  --pt-radius-card: ${rad.card}; --pt-radius-row: ${rad.row}; --pt-radius-btn: ${rad.btn};
  --pt-radius-input: ${rad.input}; --pt-radius-pill: ${rad.pill};
  --pt-r-sm: ${rad.sm}; --pt-r-md: ${rad.row}; --pt-r-lg: ${rad.card}; --pt-r-pill: ${rad.pill};
  --ob-radius-control: ${rad.btn}; --ob-radius-card: ${rad.card};
  --pt-ls-kicker: 0.14em;
  --cyber-pink: ${o.accent};

  /* accent rgb triplets — other rules build rgba() from these */
  --pt-neon-rgb: ${r.accent};
  --pt-glow-rgb: ${r.signal};
  --pt-neon-bright-rgb: ${r.bright};
  --pt-text-rgb: ${r.text};
  --pt-action-rgb: ${r.accent};
  --pt-action: ${o.accent};
  --pt-dodger: ${o.accent}; --pt-dodger-rgb: ${r.accent};
  --pt-bg-tint: ${o.deep};

  /* surfaces — cards are glass (#253340 at 55–72%), never opaque */
  --pt-bg: ${o.bg};
  --pt-bg-soft: ${o.deep};
  --pt-surface: ${glass};
  --pt-surface-2: ${glassHi};
  --pt-bg-terminal: rgba(${r.deep},0.78);
  --pt-bg-terminal-solid: ${o.deep};
  --pt-card-bg: ${glass};
  --pt-bg-gradient: linear-gradient(180deg, ${o.bg} 0%, ${o.deep} 100%);

  /* text */
  --pt-text: ${o.text};
  --pt-text-high: ${o.textHigh};
  --pt-text-dim: ${o.textDim};
  --pt-text-mute: ${o.textMute};

  /* accent — signal cyan is glow/live only, never copy */
  --pt-neon: ${o.accent};
  --pt-neon-bright: ${o.bright};
  --pt-neon-deep: ${o.accentDeep};
  --pt-neon-glow: rgba(${r.signal},0.35);
  --pt-neon-glow-soft: rgba(${r.signal},0.12);
  --pt-neon-wash: rgba(${r.accent},0.08);

  /* borders — cyan paints structure, three tiers */
  --pt-border: ${line.base};
  --pt-border-strong: ${line.strong};
  --pt-border-dim: ${line.subtle};
  --pt-rule: ${line.subtle};
  --pt-card-border: ${line.base};
  --pt-card-rim: ${highlight};

  /* glow / shadow — glow on live/active only; no black drop shadow on cards */
  --pt-glow-sm: 0 0 6px rgba(${r.signal},0.3);
  --pt-glow-md: ${glow};
  --pt-glow-lg: ${glow};
  --pt-glow-text: none;
  --pt-glow-live: ${glow};
  --pt-shadow-window: ${highlight};
  --pt-scanline: none;

  /* mc-* / mp-* aliases (var()-resolved at :root, so re-declared) */
  --mc-bg: ${o.bg}; --mc-bg-2: ${o.deep};
  --mc-surface: ${glass}; --mc-panel: ${o.deep}; --mc-surface-2: ${glassHi};
  --mc-ink: ${o.text}; --mc-ink-dim: ${o.textDim};
  --mc-ink-mute: ${o.textMute}; --mc-ink-faint: ${o.accentDeep};
  --mc-line: ${line.subtle}; --mc-line-2: ${line.base};
  --mc-neon: ${o.accent}; --mc-neon-bright: ${o.bright}; --mc-neon-2: ${o.accent};
  --mc-neon-deep: ${o.accentDeep}; --mc-neon-rgb: ${r.accent}; --mc-bg-tint: ${o.deep};
  --mc-glass: rgba(${r.accent},0.06); --mc-glass-line: ${line.base};
  --mc-chart-grid: ${line.subtle}; --mc-chart-axis: ${o.textMute}; --mc-chart-ink: ${o.textDim};
  --mc-chart-emph: ${o.accent}; --mc-chart-quiet: rgba(${r.accent},0.5);
  --mc-chart-empty: rgba(${r.accent},0.15); --mc-chart-glow: ${glow};
  --mp-bg: ${o.bg}; --mp-raised: ${o.deep}; --mp-card: ${glass};
  --mp-ink: ${o.text}; --mp-ink-dim: ${o.textDim}; --mp-ink-mute: ${o.textMute}; --mp-ink-faint: ${o.accentDeep};
  --mp-line: ${line.subtle}; --mp-line-2: ${line.base};
  --mp-accent: ${o.accent}; --mp-accent-rgb: ${r.accent};

  /* glass button material — 10px, cyan hairline, no bloom */
  --pt-btn-glass-fill: ${glassLo}; --pt-btn-glass-fill-hover: rgba(${r.raisedHover},0.85); --pt-btn-glass-fill-disabled: rgba(${r.deep},0.7);
  --pt-btn-glass-neutral-top: rgba(${r.bright},0.04); --pt-btn-glass-neutral-bottom: rgba(${r.bright},0.01);
  --pt-btn-glass-primary-top: rgba(${r.accent},0.30); --pt-btn-glass-primary-bottom: rgba(${r.accent},0.14);
  --pt-btn-glass-ink: ${o.textHigh}; --pt-btn-glass-ink-disabled: ${o.textMute};
  --pt-btn-glass-line-subtle: ${line.subtle}; --pt-btn-glass-line-base: ${line.base}; --pt-btn-glass-line-strong: ${line.strong};
  --pt-btn-glass-rim: ${highlight};
  --pt-btn-glass-rim-lit: inset 0 1px 0 rgba(${r.bright},0.14);
  --pt-btn-glass-shadow: none;
  --pt-btn-glass-bloom: none;
  --pt-btn-glass-focus: ${o.accent};

  /* glass / environment (--pt-mx-*) */
  --pt-mx-void: ${o.bg}; --pt-mx-graphite: ${o.deep}; --pt-mx-carbon: ${o.deepest};
  --pt-mx-cyan: ${o.signal}; --pt-mx-sky: ${o.accent}; --pt-mx-cyan-deep: ${o.mute};
  --pt-mx-glass: ${glass}; --pt-mx-glass-hi: ${glassHi}; --pt-mx-glass-chrome: rgba(${r.deep},0.82);
  --pt-mx-glass-sheen: none;
  --pt-mx-glass-rim: ${highlight};
  --pt-mx-glass-edge: none;
  --pt-mx-glass-reflect: transparent;
  --pt-mx-glass-shadow: ${highlight};
  --pt-mx-glass-shadow-hi: ${highlight};
  --pt-mx-line-subtle: ${line.subtle}; --pt-mx-line: ${line.base}; --pt-mx-line-strong: ${line.strong};
  --pt-mx-ink-head: ${o.textHigh}; --pt-mx-ink: ${o.text}; --pt-mx-ink-2: ${o.textDim}; --pt-mx-ink-meta: ${o.textMute};
  --pt-mx-head-glow: none;
  --pt-mx-grid-line: rgba(${r.accent},0.03); --pt-mx-neural-line: rgba(${r.accent},0.07);
  --pt-mx-rain-1: ${o.deep}; --pt-mx-rain-2: ${o.bg}; --pt-mx-rain-3: ${o.raisedHover};

  /* matrix-blue.css layer (--mbg-*) */
  --mbg-void: ${o.bg}; --mbg-deck: ${o.deep}; --mbg-deck-2: ${o.bg};
  --mbg-rule: ${line.subtle}; --mbg-rule-strong: ${line.base};
  --mbg-ink: ${o.text}; --mbg-ink-2: ${o.textDim}; --mbg-ink-3: ${o.textMute};
  --mbg-dodger-ink: ${o.bright};
  --mbg-amber: ${s.warn.hex}; --mbg-red: ${s.error.hex}; --mbg-green: ${s.ok.hex}; --mbg-cyan: ${o.signal};
  --mbg-edge: ${line.base}; --mbg-edge-hi: rgba(${r.signal},0.45);
  --mbg-sheen: none;
  --mbg-glass-1: ${glass}; --mbg-glass-1-hover: rgba(${r.raisedHover},0.82);
  --mbg-glass-2: ${glassLo}; --mbg-glass-3: rgba(${r.deep},0.96); --mbg-solid-3: ${o.deep};
  --mbg-inset: ${highlight};

  /* aurora.css layer (--aur-*) */
  --aur-ink-0: ${o.bg}; --aur-ink-1: ${o.deep}; --aur-ink-2: ${o.deepest}; --aur-ink-3: ${o.raisedHover}; --aur-ink-4: ${o.card};
  --aur-bg: ${o.bg};
  --aur-surface-hover: rgba(${r.raisedHover},0.6);
  --aur-accent-strong: ${o.bright}; --aur-accent-deep: ${o.accentDeep}; --aur-accent-ink: ${o.deepest};
  --aur-accent-wash: rgba(${r.accent},0.07); --aur-accent-glow: rgba(${r.signal},0.35);
  --aur-ok: ${s.ok.hex}; --aur-warn: ${s.warn.hex}; --aur-error: ${s.error.hex};
  --aur-error-wash: rgba(255,107,107,0.09); --aur-stale: ${o.textMute};
  --aur-bloom-1: transparent; --aur-bloom-2: transparent;
  --aur-glass-bg: ${glassLo}; --aur-glass-border: ${line.subtle};
  --aur-highlight: ${highlight};
  --aur-fill-faint: rgba(${r.accent},0.04);
  --aur-now: ${o.bright};
  --aur-radius-sm: ${rad.row}; --aur-radius-md: ${rad.card}; --aur-radius-lg: ${rad.card};

  /* globals.css layers (--vg-* ramp/semantic, --ob-* home, --glass-* tiers) */
  --vg-blue-1: ${o.deepest}; --vg-blue-2: ${o.deep}; --vg-blue-3: ${o.bg}; --vg-blue-4: ${o.raisedHover};
  --vg-blue-5: ${o.card}; --vg-blue-6: ${o.mute}; --vg-blue-7: ${o.accentDeep}; --vg-blue-8: ${o.accent};
  --vg-blue-11: ${o.textHigh};
  --vg-electric-periwinkle: ${o.accent}; --vg-electric-azure: ${o.accent};
  --vg-electric-glow: rgba(${r.signal},0.35);
  --vg-violet: ${o.accent}; --vg-violet-deep: ${o.mute}; --vg-violet-glow: rgba(${r.accent},0.3);
  --vg-text-mute: ${o.textMute}; --vg-text-faint: ${o.textMute};
  --vg-ok-fg: ${s.ok.hex}; --vg-ok-bg: rgba(79,214,160,0.10); --vg-ok-border: rgba(79,214,160,0.34); --vg-ok-glow: rgba(79,214,160,0.35);
  --vg-warn-fg: ${s.warn.hex}; --vg-warn-bg: rgba(232,180,90,0.10); --vg-warn-border: rgba(232,180,90,0.40); --vg-warn-glow: rgba(232,180,90,0.35);
  --vg-danger-fg: ${s.error.hex}; --vg-danger-bg: rgba(255,107,107,0.10); --vg-danger-border: rgba(255,107,107,0.40); --vg-danger-glow: rgba(255,107,107,0.38);
  --mc-rain-head: ${o.bright};
  --ob-bg-0: ${o.deepest}; --ob-bg-1: ${o.deep}; --ob-peak: ${o.textHigh};
  --ob-text: ${o.textHigh}; --ob-text-2: ${o.text}; --ob-text-3: ${o.textDim}; --ob-text-4: ${o.textMute};
  --ob-page-ambience: radial-gradient(ellipse 80% 60% at 50% 30%, rgba(${r.accent},0.05), transparent 65%);
  --glass-1-fill: rgba(${r.deep},0.86); --glass-1-rim: ${line.base}; --glass-1-shadow: ${highlight};
  --glass-2-fill: ${glass}; --glass-2-rim: ${line.base}; --glass-2-shadow: ${highlight};
  --glass-3-fill: rgba(${r.deep},0.96); --glass-3-rim: ${line.strong}; --glass-3-shadow: ${highlight};

  /* semantic — adaptive: ok/warn/error stay distinguishable */
  --mc-ok: ${s.ok.hex}; --mc-warn: ${s.warn.hex}; --mc-crit: ${s.error.hex};
  --pt-ok: ${s.ok.hex};       --pt-ok-ink: ${s.ok.ink};
  --pt-warn: ${s.warn.hex};   --pt-warn-ink: ${s.warn.ink};
  --pt-error: ${s.error.hex}; --pt-error-ink: ${s.error.ink};
  --pt-info: ${s.info.hex};   --pt-info-ink: ${s.info.ink};
  --pt-tl-red: ${s.error.hex}; --pt-tl-yellow: ${s.warn.hex}; --pt-tl-green: ${s.ok.hex};
  --pt-btn-glass-confirm-top: ${s.ok.hex}2e; --pt-btn-glass-confirm-bottom: ${s.ok.hex}0f;
  --pt-btn-glass-danger-top: ${s.error.hex}2e; --pt-btn-glass-danger-bottom: ${s.error.hex}0f;
  --pt-btn-glass-ink-danger: ${s.error.ink}; --pt-btn-glass-ink-confirm: ${s.ok.ink};
}
`
}
