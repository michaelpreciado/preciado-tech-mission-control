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
  cat5: '#6366f1', cat6: '#c2410c', cat7: '#9db4ec', cat8: '#e11d48',
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

/* ── Type roles ───────────────────────────────────────────────────── */
export const FONT = {
  display: 'var(--pt-font-sans)',
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
  bg:         '#07080b',
  bgSoft:     '#0b0d12',
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
  --pt-dodger: ${NEON_DEFAULT};
  --pt-text-rgb: 244,247,251;
  --pt-bg-tint: #0a0d16;

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

/** Emit the FRIDAY theme override block (accent-consistent CRT emphasis). */
export function buildFridayThemeCss(): string {
  /* Mission Control's accent is dodger blue (NEON_DEFAULT). Periwinkle
     (ACCENT_DEFAULT) is the client-site brand and stays the :root fallback for
     non-friday themes only. A custom /setup accent still overrides this block. */
  return `html[data-theme="friday"] {
  --pt-neon-rgb: ${NEON_RGB};
  --pt-glow-rgb: ${NEON_RGB};
  --pt-neon-bright-rgb: ${MX_NEON_BRIGHT_RGB};
  --pt-text-rgb: 244,247,251;
  --pt-bg-tint: #0a0d16;
  --pt-text: #f4f7fb;
  --pt-text-high: #ffffff;
  --pt-neon: ${NEON_DEFAULT};
  --pt-neon-bright: ${MX_NEON_BRIGHT};
  --pt-neon-deep: ${MX_NEON_DEEP};
  --pt-neon-glow: rgba(var(--pt-glow-rgb),0.6);
  --pt-neon-glow-soft: rgba(var(--pt-glow-rgb),0.2);
  --pt-neon-wash: rgba(var(--pt-neon-rgb),0.08);
  /* Hairlines are neutral, three tiers (MATRIX line-*): accent never paints structure. */
  --pt-border: ${MATRIX['line']};
  --pt-border-strong: ${MATRIX['line-strong']};
  --pt-border-dim: ${MATRIX['line-subtle']};
  --pt-rule: ${MATRIX['line-subtle']};
  --pt-card-border: ${MATRIX['line']};
  --pt-bg: #07080b;
  --pt-bg-soft: #0b0d12;
  --pt-bg-terminal: rgba(14,17,23,0.96);
  --pt-glow-sm: 0 0 6px rgba(var(--pt-glow-rgb),0.55);
  --pt-glow-md: 0 0 14px rgba(var(--pt-glow-rgb),0.5), 0 0 2px rgba(var(--pt-glow-rgb),0.85);
  --pt-glow-text: 0 0 6px rgba(var(--pt-neon-bright-rgb),0.6), 0 0 14px rgba(var(--pt-glow-rgb),0.45);
  --pt-scanline: repeating-linear-gradient(to bottom, rgba(0,0,0,.22) 0 1px, transparent 1px 3px);
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
  --pt-dodger: ${o.activeTab};
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
