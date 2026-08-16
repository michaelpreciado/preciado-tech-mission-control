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
 *      ui       = real UI sans (Inter), for all prose, body & card content
 *    Mono is reserved for IDs, paths, cron, numbers, labels — never for prose.
 *  - COLOR · one accent + four semantic states (info=cyan, warn=amber,
 *    error=red, ok=green). Red is ALWAYS semantic, never decorative.
 *  - SPACING · 8px scale. One radius. One border color. Two surfaces.
 *    Two glow intensities max per page.
 *  - MOTION · durations/easings declared here (consumed by Phase 2).
 */

/** ── Raw token values (the canonical numbers) ─────────────────────── */

export const ACCENT_DEFAULT = '#ff10f0'

/* Semantic status palette — the four states, reserved meaning. never reused
   as a categorical slot, never decorative. */
export const SEMANTIC = {
  ok:    { hex: '#28c840', ink: '#2be36b' },   // green
  warn:  { hex: '#febc2e', ink: '#ffc857' },   // amber
  error: { hex: '#ff5f57', ink: '#ff8a83' },   // red — semantic ONLY
  info:  { hex: '#00d4ff', ink: '#7fe9ff' },   // cyan
} as const

/* Categorical chart palette — fixed, never cycled, validated against the dark
   surface. Slot 1 is the brand accent so charts read as part of the UI.
   These are NOT status colors; do not use them for ok/warn/error/info. */
export const CATEGORICAL = {
  cat1: '#1e90ff', cat2: '#db2777', cat3: '#65a30d', cat4: '#7c3aed',
  cat5: '#0d9488', cat6: '#c2410c', cat7: '#0891b2', cat8: '#e11d48',
  seq1: '#bae0ff', seq2: '#7cc0ff', seq3: '#3b9dff', seq4: '#1e90ff',
  seq5: '#0b7fe8', seq6: '#0369a1', seq7: '#075985',
} as const

/* Accent RGB triplets (for rgba() use). Keep in sync with ACCENT_DEFAULT. */
export const ACCENT_RGB = '255,16,240'
export const ACCENT_BRIGHT_RGB = '255,125,248'

/* ── Type roles ───────────────────────────────────────────────────── */
export const FONT = {
  /* Display & numerals — monospace, variable. */
  display: "'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace",
  /* Micro-labels (uppercase), IDs, paths, cron, numbers. */
  mono: "'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace",
  /* UI sans for all prose/body/card content. */
  ui: "var(--pt-font-ui)", // resolved at runtime to the loaded Inter font
} as const

export const TYPE_SCALE = {
  display: 'clamp(2.2rem, 5.5vw, 4.25rem)',
  h2:      'clamp(1.5rem, 3.2vw, 2.15rem)',
  h3:      '1.05rem',
  body:    '0.95rem',
  sm:      '0.85rem',
  xs:      '0.78rem',
  kicker:  '0.75rem',
} as const

export const LINE_HEIGHT = { tight: 1.08, snug: 1.2, body: 1.65, ui: 1.5 } as const
export const LETTER_SPACING = { tight: '-0.02em', kicker: '0.22em', prompt: '0.02em' } as const

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
export const BORDER = { dim: 0.15, base: 0.35, strong: 0.65, rule: 0.22 } as const

/* ── Surfaces — two elevations only. */
export const SURFACE = {
  bg:         '#000000',
  bgSoft:     '#070109',
  surface:    'rgba(16,6,20,0.6)',
  surface2:   'rgba(24,10,30,0.72)',
  terminal:   'rgba(10,2,12,0.78)',
  glassProse: 'rgba(13,2,18,0.96)',
} as const

/* ── Glow — two intensities max on any page (sm for interactive, md for hero). */
export const GLOW = {
  sm: '0 0 6px rgba(var(--pt-neon-rgb),0.45)',
  md: '0 0 14px rgba(var(--pt-neon-rgb),0.55), 0 0 2px rgba(var(--pt-neon-rgb),0.9)',
  text: '0 0 6px rgba(var(--pt-neon-bright-rgb),0.65), 0 0 14px rgba(var(--pt-neon-rgb),0.45)',
} as const

/* ── Motion — declared now, consumed by Phase 2. Never linear except loops. */
export const MOTION = {
  durMicro: '120ms',   // hover / button feedback
  durStd:   '200ms',   // standard transitions
  durComplex: '320ms', // panel / card / kanban
  durAmbient: '800ms', // ambient loops only, min
  easeEnter: 'cubic-bezier(0.2,0,0,1)',
  easeExit:  'cubic-bezier(0.4,0,1,1)',
} as const

/* ── Density — compact and expanded card variants. */
export const DENSITY = {
  compact: { py: '16px', px: '18px', gap: '6px' },
  expanded: { py: '24px', px: '28px', gap: '12px' },
} as const

export type DesignToken = typeof designTokens
export const designTokens = { semantic: SEMANTIC, categorical: CATEGORICAL, font: FONT, typeScale: TYPE_SCALE, spacing: SPACING, radius: RADIUS, border: BORDER, surface: SURFACE, glow: GLOW, motion: MOTION, density: DENSITY }

/**
 * Emit the canonical `:root { … }` custom-property block. This replaces the
 * value block that used to live at the top of globals.css, so the tokens
 * module is the one place they're declared.
 */
export function buildTokenCss(): string {
  return `:root {
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
  --pt-text-rgb: 248,236,247;
  --pt-bg-tint: #1f0526;

  /* core surfaces — two elevations */
  --pt-bg: ${SURFACE.bg};
  --pt-bg-soft: ${SURFACE.bgSoft};
  --pt-surface: ${SURFACE.surface};
  --pt-surface-2: ${SURFACE.surface2};
  --pt-bg-terminal: ${SURFACE.terminal};
  --pt-bg-terminal-solid: #0b0110;

  /* text */
  --pt-text: #f8ecf7;
  --pt-text-high: #ffffff;
  --pt-text-dim: rgba(var(--pt-text-rgb),0.55);
  --pt-text-mute: rgba(var(--pt-text-rgb),0.35);

  /* accent (overridden at runtime by buildAccentCss when custom) */
  --pt-neon: ${ACCENT_DEFAULT};
  --pt-neon-bright: #ff7df8;
  --pt-neon-deep: #c400ba;
  --pt-neon-glow: rgba(var(--pt-neon-rgb),0.55);
  --pt-neon-glow-soft: rgba(var(--pt-neon-rgb),0.18);
  --pt-neon-wash: rgba(var(--pt-neon-rgb),0.08);

  /* terminal traffic lights (legacy aliases) */
  --pt-tl-red: ${SEMANTIC.error.hex};
  --pt-tl-yellow: ${SEMANTIC.warn.hex};
  --pt-tl-green: ${SEMANTIC.ok.hex};

  /* lines, borders — one color family */
  --pt-border: rgba(var(--pt-neon-rgb),${BORDER.base});
  --pt-border-strong: rgba(var(--pt-neon-rgb),${BORDER.strong});
  --pt-border-dim: rgba(var(--pt-neon-rgb),${BORDER.dim});
  --pt-rule: rgba(var(--pt-neon-rgb),${BORDER.rule});

  /* glow / shadow — two intensities + text */
  --pt-glow-sm: ${GLOW.sm};
  --pt-glow-md: ${GLOW.md};
  --pt-glow-lg: 0 0 28px rgba(var(--pt-neon-rgb),0.55), 0 0 6px rgba(var(--pt-neon-rgb),0.75), inset 0 0 18px rgba(var(--pt-neon-rgb),0.08);
  --pt-glow-text: ${GLOW.text};
  --pt-shadow-window: 0 24px 80px rgba(0,0,0,0.8), 0 0 24px rgba(var(--pt-neon-rgb),0.35);

  /* bg gradient */
  --pt-bg-gradient:
    radial-gradient(ellipse at top, rgba(var(--pt-neon-rgb),0.1), transparent 55%),
    linear-gradient(180deg, #000000 0%, #060009 100%);

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
  /* UI sans for prose. --pt-font-ui is set on <body> by the loaded Inter
     font's next/font variable class; the fallback keeps this token valid
     at :root (custom props can't see body-scoped vars from the cascade). */
  --pt-font-sans: var(--pt-font-ui, 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);

  /* type scale */
  --pt-fs-display: ${TYPE_SCALE.display};
  --pt-fs-h2: ${TYPE_SCALE.h2}; --pt-fs-h3: ${TYPE_SCALE.h3};
  --pt-fs-body: ${TYPE_SCALE.body}; --pt-fs-sm: ${TYPE_SCALE.sm};
  --pt-fs-xs: ${TYPE_SCALE.xs}; --pt-fs-kicker: ${TYPE_SCALE.kicker};

  --pt-lh-tight: ${LINE_HEIGHT.tight}; --pt-lh-snug: ${LINE_HEIGHT.snug};
  --pt-lh-body: ${LINE_HEIGHT.body}; --pt-lh-ui: ${LINE_HEIGHT.ui};

  --pt-ls-tight: ${LETTER_SPACING.tight}; --pt-ls-kicker: ${LETTER_SPACING.kicker};
  --pt-ls-prompt: ${LETTER_SPACING.prompt};

  /* motion */
  --pt-ease: cubic-bezier(0.2,0.7,0.2,1);
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

  --pt-scanline:
    repeating-linear-gradient(to bottom,
      rgba(var(--pt-neon-rgb),0.04) 0px, rgba(var(--pt-neon-rgb),0.04) 1px,
      transparent 1px, transparent 3px);
}
`
}

/** Emit the FRIDAY theme override block (accent-consistent CRT emphasis). */
export function buildFridayThemeCss(): string {
  return `html[data-theme="friday"] {
  --pt-neon-rgb: ${ACCENT_RGB};
  --pt-neon-bright-rgb: ${ACCENT_BRIGHT_RGB};
  --pt-text-rgb: 244,205,240;
  --pt-bg-tint: #1f0526;
  --pt-text: #f4cdf0;
  --pt-text-high: #ffe9fc;
  --pt-neon: ${ACCENT_DEFAULT};
  --pt-neon-bright: #ff7df8;
  --pt-neon-deep: #c400ba;
  --pt-neon-glow: rgba(var(--pt-neon-rgb),0.6);
  --pt-neon-glow-soft: rgba(var(--pt-neon-rgb),0.2);
  --pt-neon-wash: rgba(var(--pt-neon-rgb),0.08);
  --pt-border: rgba(var(--pt-neon-rgb),0.55);
  --pt-border-strong: rgba(var(--pt-neon-rgb),0.85);
  --pt-border-dim: rgba(var(--pt-neon-rgb),0.28);
  --pt-rule: rgba(var(--pt-neon-rgb),0.35);
  --pt-bg: #0d0212;
  --pt-bg-soft: #150322;
  --pt-bg-terminal: rgba(13,2,18,0.96);
  --pt-glow-sm: 0 0 6px rgba(var(--pt-neon-rgb),0.65);
  --pt-glow-md: 0 0 14px rgba(var(--pt-neon-rgb),0.6), 0 0 2px rgba(var(--pt-neon-rgb),0.95);
  --pt-glow-text: 0 0 6px rgba(var(--pt-neon-bright-rgb),0.75), 0 0 14px rgba(var(--pt-neon-rgb),0.55);
  --pt-scanline:
    repeating-linear-gradient(to bottom,
      rgba(var(--pt-neon-rgb),0.10) 0px, rgba(var(--pt-neon-rgb),0.10) 1px,
      transparent 1px, transparent 3px);
  font-feature-settings: "ss01","zero";
}
`
}
