# Mission Control polish plan — widget theme parity (2026-11-09)

Goal: make every Mission Control route, on a 1440px desktop and a 412px phone, read like
Michael's launcher widgets (reference captures listed in `docs/widget-theme-reference.md`).
This document is the plan only. Nothing here has been applied.

Baseline measured today against the live server on :4176 (commit `030e235`):

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm test` | 542 pass / 0 fail, ~181 s |
| Live `<html>` | `data-theme="friday"`, **no `data-palette`**, `data-density="compact"`, `data-motion="full"` |
| Live accent | `data/config.json` → `appearance.accentColor = "#1e90ff"` → `buildAccentCss()` emits a blue-tinted override (text `#cee7ff`, bg-tint `#041424`) |
| Launcher palette | **not active**. It is only the fallback for a fresh config (`lib/config.ts:308`). Its values are slate (`#16222b` / `#253340` / `#6fb8e3`), i.e. the *old* OmaLauncher footage, not the new black/navy widgets |
| `<meta theme-color>` | hardcoded `#16222b` (`app/layout.tsx:82`); `public/manifest.json` says `#00d4ff` / `#010407` |
| Desktop vs phone HTML | byte-identical apart from a nonce. Mobile layout is 100% CSS media queries; no UA branching |
| Playwright | browsers not installed (`npx playwright install chromium` needed before any script in `scripts/` runs) |
| Concurrent edit | while this plan was written, `lib/nav-tabs.ts` lost the `/projects` (Clients) and `/content-creation` nav items (uncommitted). The routes still exist; treat them as de-emphasised in §2 and ask before deleting them |

Audit totals across the 38 stylesheets (14 383 lines): **282** hex literals, **205** `gradient(`,
**342** `box-shadow`, **96** `backdrop-filter`, **57** `text-shadow`, **117** `@keyframes`,
**122** sans-font declarations. `app/globals.css` alone is 9 896 lines and holds 62 % of the hex
literals, 56 % of the gradients and 67 % of the shadows. There are ~75 distinct `@media` queries
with 24 different max-width values (360…1400). The target is flat, so most of this is removal.

---

## 0. Design decision (one paragraph, do not re-litigate)

**The friday theme itself becomes the widget look.** Do not add a fourth `data-palette`. The
friday theme is the structural base for ~98 rule blocks in `globals.css` and every CSS module;
a palette override cannot remove gradients/glows that are written as literals in those blocks.
Omarchy and the slate Launcher palettes stay as opt-in `data-palette` presets exactly as they
are today. The new default accent becomes `#3b82f6`; `buildAccentCss()` must return `''` for it
(it is the stylesheet default, same as `#9db4ec` is today), and `lib/config.ts` falls back to it.
`data/config.json` (gitignored, personal) must be updated to `"accentColor": "#3b82f6"` or set
through `/setup` → the new "Widget (default)" preset.

---

## 1. Shared theme tokens (Lane A owns every value in this section)

### 1.1 `lib/tokens.ts` — new constants + friday block rewrite

```ts
/* Widget palette — measured from the 2026-11-09 launcher captures. */
export const WIDGET = {
  bg: '#000000', bgSoft: '#050505',
  card: '#0A0F1A', card2: '#111827',          // card, nested/raised row
  line: '#1E293B', lineDim: '#152033', lineStrong: '#334155',
  accent: '#3B82F6', accentBright: '#60A5FA', accentDeep: '#1D4ED8',
  cyan: '#00A3FF',                             // ONE highlight per card, never structure
  text: '#FFFFFF', text2: '#94A3B8', text3: '#64748B',
  segOff: '#111C33',                           // unfilled chart segment
  iconBg: '#13273F',                           // circular icon wells
} as const
export const WIDGET_RGB = { accent: '59,130,246', card: '10,15,26', line: '30,41,59', cyan: '0,163,255' } as const
export const WIDGET_SEMANTIC = {
  ok:    { hex: '#22C55E', ink: '#4ADE80' },   // "all clear" only
  warn:  { hex: '#F59E0B', ink: '#FBBF24' },   // high usage (mem 86%, disk 87%)
  error: { hex: '#EF4444', ink: '#F87171' },
  info:  { hex: '#3B82F6', ink: '#60A5FA' },
} as const
export const WIDGET_RADIUS = { card: '16px', row: '10px', btn: '10px', input: '10px', pill: '999px', sm: '4px' } as const
```

Rewrite `buildFridayThemeCss()` (`lib/tokens.ts:552-586`) so `html[data-theme="friday"]` emits
exactly these (every name already exists; only values change):

```css
html[data-theme="friday"] {
  color-scheme: dark;
  /* accent */
  --pt-neon: #3B82F6; --pt-neon-rgb: 59,130,246; --pt-neon-bright: #60A5FA; --pt-neon-bright-rgb: 96,165,250;
  --pt-neon-deep: #1D4ED8; --pt-action: #3B82F6; --pt-action-rgb: 59,130,246;
  --pt-dodger: #3B82F6; --pt-dodger-rgb: 59,130,246; --pt-glow-rgb: 59,130,246;
  --pt-neon-glow: transparent; --pt-neon-glow-soft: transparent; --pt-neon-wash: rgba(59,130,246,0.08);
  /* surfaces */
  --pt-bg: #000000; --pt-bg-soft: #050505; --pt-bg-tint: #000000;
  --pt-surface: #0A0F1A; --pt-surface-2: #111827; --pt-card-bg: #0A0F1A;
  --pt-bg-terminal: #0A0F1A; --pt-bg-terminal-solid: #0A0F1A;
  --pt-bg-gradient: none;
  /* text */
  --pt-text: #FFFFFF; --pt-text-high: #FFFFFF; --pt-text-rgb: 255,255,255;
  --pt-text-dim: #94A3B8; --pt-text-mute: #64748B;
  /* lines — slate paints structure, accent never does */
  --pt-border: #1E293B; --pt-border-strong: #334155; --pt-border-dim: #152033; --pt-rule: #1E293B;
  --pt-card-border: #1E293B; --pt-card-rim: none;
  /* effects — all off */
  --pt-glow-sm: none; --pt-glow-md: none; --pt-glow-lg: none; --pt-glow-text: none; --pt-glow-live: none;
  --pt-shadow-window: none; --pt-scanline: none; --pt-scanline-opacity: 0;
  /* radii */
  --pt-r-sm: 4px; --pt-r-md: 10px; --pt-r-lg: 16px; --pt-r-pill: 999px;
  --pt-radius-card: 16px; --pt-radius-row: 10px; --pt-radius-btn: 10px; --pt-radius-input: 10px;
  --ob-radius-card: 16px; --ob-radius-control: 10px;
  /* semantic */
  --mc-ok: #22C55E; --mc-warn: #F59E0B; --mc-crit: #EF4444;
  --pt-ok: #22C55E; --pt-ok-ink: #4ADE80; --pt-warn: #F59E0B; --pt-warn-ink: #FBBF24;
  --pt-error: #EF4444; --pt-error-ink: #F87171; --pt-info: #3B82F6; --pt-info-ink: #60A5FA;
  --pt-tl-red: #EF4444; --pt-tl-yellow: #F59E0B; --pt-tl-green: #22C55E;
  /* mc-* / mp-* aliases */
  --mc-bg: #000000; --mc-bg-2: #050505; --mc-surface: #0A0F1A; --mc-panel: #0A0F1A; --mc-surface-2: #111827;
  --mc-ink: #FFFFFF; --mc-ink-dim: #CBD5E1; --mc-ink-mute: #94A3B8; --mc-ink-faint: #64748B;
  --mc-line: #1E293B; --mc-line-2: #334155; --mc-neon: #3B82F6; --mc-neon-bright: #60A5FA; --mc-neon-2: #3B82F6;
  --mc-neon-deep: #1D4ED8; --mc-neon-rgb: 59,130,246; --mc-glass: #0A0F1A; --mc-glass-line: #1E293B;
  --mp-bg: #000000; --mp-raised: #050505; --mp-card: #0A0F1A; --mp-ink: #FFFFFF; --mp-ink-dim: #CBD5E1;
  --mp-ink-mute: #94A3B8; --mp-ink-faint: #64748B; --mp-line: #1E293B; --mp-line-2: #334155;
  --mp-accent: #3B82F6; --mp-accent-rgb: 59,130,246;
  /* chart language */
  --mc-chart-grid: #152033; --mc-chart-axis: #64748B; --mc-chart-ink: #94A3B8;
  --mc-chart-emph: #3B82F6; --mc-chart-quiet: #1D4ED8; --mc-chart-empty: #111C33; --mc-chart-glow: none;
  --mc-seg-on: #3B82F6; --mc-seg-off: #111C33; --mc-seg-warn: #F59E0B; --mc-seg-crit: #EF4444; --mc-seg-cyan: #00A3FF;
  /* glass vocabulary (--pt-mx-*) collapses to flat */
  --pt-mx-void: #000000; --pt-mx-graphite: #000000; --pt-mx-carbon: #050505;
  --pt-mx-cyan: #00A3FF; --pt-mx-sky: #3B82F6; --pt-mx-cyan-deep: #152033;
  --pt-mx-glass: #0A0F1A; --pt-mx-glass-hi: #111827; --pt-mx-glass-chrome: #000000;
  --pt-mx-glass-sheen: none; --pt-mx-glass-edge: none; --pt-mx-glass-rim: none;
  --pt-mx-glass-shadow: none; --pt-mx-glass-shadow-hi: none; --pt-mx-glass-reflect: transparent;
  --pt-mx-line-subtle: #152033; --pt-mx-line: #1E293B; --pt-mx-line-strong: #334155;
  --pt-mx-ink-head: #FFFFFF; --pt-mx-ink: #FFFFFF; --pt-mx-ink-2: #94A3B8; --pt-mx-ink-meta: #64748B;
  --pt-mx-head-glow: none; --pt-mx-grid-line: transparent; --pt-mx-neural-line: transparent;
  /* matrix-blue.css (--mbg-*) and aurora.css (--aur-*) layers */
  --mbg-void: #000000; --mbg-deck: #0A0F1A; --mbg-deck-2: #111827; --mbg-rule: #1E293B; --mbg-rule-strong: #334155;
  --mbg-ink: #FFFFFF; --mbg-ink-2: #94A3B8; --mbg-ink-3: #64748B; --mbg-dodger-ink: #60A5FA;
  --mbg-amber: #F59E0B; --mbg-red: #EF4444; --mbg-green: #22C55E; --mbg-cyan: #00A3FF;
  --mbg-edge: #1E293B; --mbg-edge-hi: #334155; --mbg-sheen: none; --mbg-inset: none;
  --mbg-glass-1: #0A0F1A; --mbg-glass-1-hover: #111827; --mbg-glass-2: #0A0F1A; --mbg-glass-3: #0A0F1A; --mbg-solid-3: #0A0F1A;
  --aur-ink-0: #000000; --aur-ink-1: #050505; --aur-ink-2: #0A0F1A; --aur-ink-3: #111827; --aur-ink-4: #152033;
  --aur-bg: #000000; --aur-surface-hover: #111827; --aur-accent-strong: #60A5FA; --aur-accent-deep: #1D4ED8;
  --aur-accent-ink: #000000; --aur-accent-wash: rgba(59,130,246,0.08); --aur-accent-glow: transparent;
  --aur-ok: #22C55E; --aur-warn: #F59E0B; --aur-error: #EF4444; --aur-error-wash: rgba(239,68,68,0.10); --aur-stale: #64748B;
  --aur-bloom-1: transparent; --aur-bloom-2: transparent; --aur-glass-bg: #0A0F1A; --aur-glass-border: #1E293B;
  --aur-highlight: none; --aur-fill-faint: rgba(59,130,246,0.06); --aur-now: #FFFFFF;
  --aur-radius-sm: 10px; --aur-radius-md: 16px; --aur-radius-lg: 16px;
  /* globals.css --ob-* / --glass-* / --vg-* */
  --ob-bg-0: #000000; --ob-bg-1: #050505; --ob-glass: #0A0F1A; --ob-border: #1E293B; --ob-glow: none;
  --ob-surface-highlight: none; --ob-page-ambience: none; --ob-text: #FFFFFF; --ob-text-2: #CBD5E1; --ob-text-3: #94A3B8; --ob-text-4: #64748B;
  --glass-1-fill: #000000; --glass-1-rim: #1E293B; --glass-1-shadow: none;
  --glass-2-fill: #0A0F1A; --glass-2-rim: #1E293B; --glass-2-shadow: none;
  --glass-3-fill: #0A0F1A; --glass-3-rim: #334155; --glass-3-shadow: none; --glass-3-scrim-blur: none;
  --vg-electric-glow: transparent; --vg-violet-glow: transparent;
  --vg-ok-glow: transparent; --vg-warn-glow: transparent; --vg-danger-glow: transparent;
  /* buttons: flat */
  --pt-btn-glass-fill: #0A0F1A; --pt-btn-glass-fill-hover: #111827; --pt-btn-glass-fill-disabled: #050505;
  --pt-btn-glass-neutral-top: transparent; --pt-btn-glass-neutral-bottom: transparent;
  --pt-btn-glass-primary-top: #3B82F6; --pt-btn-glass-primary-bottom: #3B82F6;
  --pt-btn-glass-ink: #FFFFFF; --pt-btn-glass-ink-disabled: #64748B;
  --pt-btn-glass-line-subtle: #152033; --pt-btn-glass-line-base: #1E293B; --pt-btn-glass-line-strong: #334155;
  --pt-btn-glass-rim: none; --pt-btn-glass-rim-lit: none; --pt-btn-glass-shadow: none; --pt-btn-glass-bloom: none;
  --pt-btn-glass-press-shadow: none; --pt-btn-glass-blur: none; --pt-btn-glass-focus: #3B82F6;
  /* compat alias for the undefined var used in CostsPanel/globals (see §1.6) */
  --font-mono: var(--pt-font-mono);
  /* type */
  --pt-fs-verdict: clamp(28px, 4vw, 44px);
  --pt-ls-kicker: 0.08em;   /* widgets are lowercase mono; kickers are quiet */
  font-feature-settings: "ss01","zero";
}
```

Also in `lib/tokens.ts`:
- `FONT.display` → `'var(--pt-font-sans)'` stays (sans is for verdict numerals only); add
  `FONT.verdict = FONT.display` alias so the intent is greppable.
- `TYPE_SCALE.verdict: 'clamp(28px, 4vw, 44px)'` (the "3% this week" / "4" / "71°" size).
- `SURFACE.bg` → `#000000` so the non-friday `:root` fallback isn't lighter than the theme.
- Tailwind: `@tailwindcss/postcss` is installed (`postcss.config.mjs`) but no `.tsx` uses utility
  classes today. Do **not** add a Tailwind layer; if someone does, the `@theme` map is
  `--color-card: #0A0F1A; --color-border: #1E293B; --color-accent: #3B82F6; --radius-card: 16px`.

### 1.2 `lib/theme.ts`

- `DEFAULT_ACCENT` stays `#9db4ec` for `:root`; add `FRIDAY_ACCENT = WIDGET.accent` and make
  `buildAccentCss()` return `''` when `hex === FRIDAY_ACCENT` as well.
- `ACCENT_PRESETS` → `[ {Widget (default) #3b82f6}, {Launcher slate #6fb8e3}, {Omarchy (PT) #8bc9eb}, {Periwinkle #9db4ec}, {Matrix green #39ff14}, {Amber CRT #ffb000}, {Blood orange #ff4d00} ]`.
  Removes the duplicate `'Dodger blue'`/`'Dodger'` pair (both `#1e90ff`) which currently
  produces a duplicate React key in `app/setup/page.tsx:282` (`key={p.hex}`).
- `paletteFor()` unchanged (launcher/omarchy only).

### 1.3 `lib/config.ts:308` → fallback `FRIDAY_ACCENT` instead of `LAUNCHER_ACCENT`.

### 1.4 `app/layout.tsx:82` → `themeColor: '#000000'`; `public/manifest.json` → `theme_color "#000000"`, `background_color "#000000"`.

### 1.5 Structural primitives (new CSS classes in `app/globals.css`, friday-scoped)

These are the pieces the widgets are built from. Lanes B and C emit this markup; Lane A owns the CSS.

```css
/* card */
.mc-widget            { background:#0A0F1A; border:1px solid #1E293B; border-radius:16px; padding:14px 16px; font:400 13px/1.5 var(--pt-font-mono); color:#94A3B8; }
.mc-widget--tight     { padding:10px 12px; }
/* prompt header / footer:  <div class="mc-prompt"><b>desk</b>:~$ <span>kanban</span></div> */
.mc-prompt            { display:flex; gap:.5ch; color:#3B82F6; white-space:nowrap; margin-bottom:8px; }
.mc-prompt b          { font-weight:400; color:#3B82F6; }
.mc-prompt span       { color:#60A5FA; }
.mc-prompt--foot      { margin:10px 0 0; justify-content:space-between; color:#3B82F6; }
.mc-prompt--foot .meta{ color:#64748B; }                                 /* ↻ 29s · up 10d 20h */
/* ascii divider:  <div class="mc-divider" data-label="tasks 3/4"></div> */
.mc-divider           { color:#334155; white-space:nowrap; overflow:hidden; margin:10px 0 6px; }
.mc-divider::before   { content:"-- " attr(data-label) " "; }
.mc-divider::after    { content:"------------------------------------------------"; }
/* verdict numeral:  <div class="mc-verdict">3% this week</div> */
.mc-verdict           { font:500 var(--pt-fs-verdict)/1.05 var(--pt-font-sans); color:#FFFFFF; letter-spacing:-0.02em; }
.mc-verdict small     { font:400 13px/1 var(--pt-font-mono); color:#94A3B8; margin-left:.6ch; vertical-align:middle; }
/* key/value row:  <div class="mc-kv"><span>done</span><span>3 today</span><span>67 wk</span></div> */
.mc-kv                { display:grid; grid-template-columns:7ch 1fr auto; gap:0 1ch; color:#94A3B8; }
.mc-kv > :first-child { color:#64748B; }
.mc-kv > :last-child  { color:#FFFFFF; text-align:right; font-variant-numeric:tabular-nums; }
/* segmented bar:  <div class="mc-segbar" style="--n:20"><i class=on/>…<i/></div>  (filled count = Math.round(value/max*n)) */
.mc-segbar            { display:grid; grid-template-columns:repeat(var(--n,20),1fr); gap:2px; height:12px; }
.mc-segbar > i        { background:#111C33; border-radius:1px; }
.mc-segbar > i.on     { background:#3B82F6; }
.mc-segbar[data-tone="warn"] > i.on { background:#F59E0B; }
.mc-segbar[data-tone="crit"] > i.on { background:#EF4444; }
.mc-segbar[data-tone="cyan"] > i.on { background:#00A3FF; }
.mc-segbar--thin      { height:4px; }                                   /* CLAUDE card progress lines */
/* mini histogram (14d):  <div class="mc-hist" style="--n:14"><i style="--v:.3"/>…</div> */
.mc-hist              { display:grid; grid-template-columns:repeat(var(--n,14),1fr); gap:2px; height:22px; align-items:end; }
.mc-hist > i          { background:#3B82F6; height:max(2px, calc(var(--v,0) * 100%)); border-radius:1px 1px 0 0; }
.mc-hist > i[data-zero]{ background:#111C33; }
/* dot progress (phone capture day/week/month/year rows) */
.mc-dots              { display:flex; gap:3px; }
.mc-dots > i          { width:5px; height:5px; border-radius:50%; background:#1E293B; }
.mc-dots > i.on       { background:#FFFFFF; }
/* status glyph:  <i class="mc-glyph" data-g="run|idle|fail|err|retry|up|down|ok"/> */
.mc-glyph::before     { font-family:var(--pt-font-mono); }
.mc-glyph[data-g="run"]::before   { content:"▶"; color:#3B82F6; }
.mc-glyph[data-g="idle"]::before  { content:"·"; color:#64748B; }
.mc-glyph[data-g="fail"]::before  { content:"×"; color:#F59E0B; }   /* amber × like "× AEGIS…" rows */
.mc-glyph[data-g="err"]::before   { content:"×"; color:#EF4444; }   /* red only for real errors */
.mc-glyph[data-g="retry"]::before { content:"↻"; color:#3B82F6; }
.mc-glyph[data-g="up"]::before    { content:"↑"; color:#3B82F6; }
.mc-glyph[data-g="down"]::before  { content:"↓"; color:#3B82F6; }
.mc-glyph[data-g="ok"]::before    { content:">"; color:#3B82F6; }
/* list row inside a widget:  <div class="mc-wrow"><i class="mc-glyph" data-g="fail"/><span class="t">AEGIS (product)…</span><span class="r">2d</span></div> */
.mc-wrow              { display:grid; grid-template-columns:1.5ch 1fr auto; gap:0 1ch; color:#FFFFFF; line-height:1.7; }
.mc-wrow .t           { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mc-wrow .r           { color:#3B82F6; font-variant-numeric:tabular-nums; }
.mc-wrow.dim          { color:#94A3B8; }
```

React wrappers (Lane A creates, B and C import): `components/charts/SegBar.tsx`
(`{ value, max, segments=20, tone?: 'accent'|'warn'|'crit'|'cyan', thin?: boolean, autoTone?: {warn:85, crit:95} }`),
`components/charts/MiniHist.tsx` (`{ values: number[], days?: 14 }`), and in `components/ui.tsx`:
`Prompt({host:'desk'|'friday'|'phone', cmd, foot?, meta?})`, `Divider({label})`, `Verdict({children, unit?})`,
`Glyph({g})`. Keep `Card` but change its recipe to the `.mc-widget` values and delete the blur.

### 1.6 Typography rule

- Body default → `var(--pt-font-mono)` (flip `app/globals.css:169`, `:514`, `app/styles/matrix-blue.css:180`).
- Sans is allowed on exactly: `.mc-verdict`, `.statValue` (hero/lg), `.hero h1` on home. Everything
  else in `ui.module.css` (`.cardTitle:44`, `.cardSub:53`, `.fieldLabel:78`, `.fieldHint/.fieldError:89`,
  `.input:107`, `.statLabel:242`, `.statSub:257`, `.pageHeaderEyebrow/h1/p:344-346`) → mono.
- Copy case: lowercase labels (`done`, `streak`, `cpu`, `load`); uppercase only for a card's
  proper-noun title in the CLAUDE-style card (`CLAUDE`, `BOT DESK`, `TODAY`, `NEXT`).
- Type floor on phone stays 12px (`scripts/audit-mobile-matrix.mjs` enforces it). Costs currently
  uses 8–9.5px inline (`CostsPanel.tsx:213,214,278,385,744,935,1036,1041-1044,1054`); raise to 12px.
- `var(--font-mono)` is referenced 8× in `CostsPanel.tsx` (e.g. `:209`, `:932`) and in
  `globals.css:4604,4744,4764,4796` but **never defined** → those numbers render in sans today.
  Lane A adds the compat alias (in the block above); Lane B replaces the usages anyway.

### 1.7 Things to delete globally (Lane A, `app/globals.css` + imports)

- `components/atmosphere/*` (matrix rain: 22 columns + constellation + pointer bloom), unmounted
  from `components/Shell.tsx:42-48`. The target has no rain.
- Page gradients: `app/styles/launcher.css:13-17` (scoped, stale), `matrix-blue.css:174-181`,
  `globals.css:230`, `.mc-main::after` screen-blend overlay `globals.css:252-258`, `.mc-bg` `:550-584`.
- `[data-glass]` recipe `globals.css:9842-9853` → `background:#0A0F1A; border:1px solid #1E293B; box-shadow:none;` and
  drop the `--gx/--gy` pointer reflection.
- `.mc-window` `globals.css:1392-1398` (blur) + head gradient `:1408` + friday override `:337` + hover shadow `:6528-6532`
  + traffic-light dots in `components/ui.tsx:209-213` → replace the dots with a `.mc-prompt` header.
- `.mc-led` glow/pulse `globals.css:1324-1338` and the second animation `:6622` → flat 6px dot or a `.mc-glyph`.
- Command palette `globals.css:~6300-6314`: `.cmdp` gradient + 32px glow + `.cmdp-backdrop` blur → flat `#0A0F1A` / `#1E293B`.
- Dead "liquid glass floating tab bar" CSS: `globals.css:1984-2074` (`.mc-mobile-nav*`), `:5903-6066`
  (`.mc-more-*`, `.mc-mobile-pill`), `app/styles/fold.css:19,42-48`. No `.tsx` uses these (~123 rules).
- `app/vf/v1-core.css` (175 lines, imported nowhere); `app/kanban/deck.css` (comment only);
  `components/chat-continuity.css` (comment only); `components/AgentDeck.module.css` (unused; AgentDeck imports Kanban.module.css).
- Legacy shell rules referenced only by dead `MatrixRainBackground`: `.mc-side` (`:630+`), `.mc-cockpit` (`:807+`),
  `.mc-rain`, `.mc-ambient3d`, `.mc-scanlines`, `.mc-vignette`; stale comment at `:8810`.
- **Keyframes rule:** `tests/motion-css.test.mjs:125-128` fails if any `@keyframes` is left unused, and
  `:38-41` requires the blur-kill rule and the `data-motion` fallbacks for `.launch-chart-line` / `.boot-draw-path`.
  Delete keyframes together with the rules that used them; keep the boot/launch rules.
- Breakpoint ladder: collapse to **1400 / 1200 / 980 / 820 / 520** (+ `(pointer: coarse)` and reduced-motion).
  Today Sidebar/MobileChrome switch at 719 while `globals.css` switches at 820, so at 720–820px home
  gets 92px bottom padding for a tab bar that is not there (`globals.css:8478` beats `fold.css:16`).
  Decision: tab bar appears at **≤820px** everywhere; the 64px fold icon rail covers 821–1100px with the
  existing `(max-aspect-ratio: 5/4)` guard.

---

## 2. Per-route fix list (desktop 1440 + phone 412)

Legend: **D** desktop, **M** mobile (412px), both otherwise. Lane letter in brackets.

### `/` Home — `components/aurora/*`, `app/page.tsx` [A]
- Card chrome: `.band` (aurora.module.css:144), `.skyPanel` (:36), `.cell` (:202-206) → `.mc-widget` values; delete `.home::before` blooms (:6-11), `.wordmark` text-shadow (:18), `.hero h1` head-glow (:23), `.cursor` shadow (:28), `.liveDot` ring (:60,:240), `.trail` + `skySweep` (:87-88,:131), `.nowLine` gradient (:99), `.liveHead` glow (:102-103,:132), `.diamond` red glow (:108), `.sky` `skyIgnite` clip animation (:130), `.waiting::after` wash (:161), `.item::before` glow (:171), `.btnPrimary` gradient (:189-190) → solid `#3B82F6` with `#000` text, `.dotErr/.dotInfo` (:194-197) → `.mc-glyph`, `.cell_error` gradient (:216), `.cell_live .cellValue` text-shadow (:218).
- Headers: replace traffic lights + "Agent activity · today" (`AuroraHero.tsx:45-53`) and the figlet `AsciiWordmark` band titles (:154-155) with prompt headers: hero = `desk:~$ status`; needs-you band = `-- needs you 2 ------` divider; broke = `-- broke 0 ------`; moved = `-- moved 7 ------`. Remove the fake `initializing module…` boot swap.
- Status cells: `.cellValue` becomes `.mc-verdict` (sans numeral) with `.cellLabel` mono below; row glyphs via `MOVED_TONE` (`AuroraHome.tsx:18`) → done `>`, failed `×`, started `↻`, created `·`.
- Sky: replace the bloom strands (`bloomOuter/Inner`, `.filament`, :92-96) with one core stroke on a `#152033` grid, or a 24-slot `.mc-hist` of hourly agent activity (data already in `hourCoverage`, `lib/aurora-copy.ts`). **M:** keep the pan-x behaviour; drop the text-halo chips (:235) for solid `#0A0F1A` chips.
- Fonts: `.home` (:5) and `.hero h1/.band h2/.item h3` (:22) set sans → mono, except `.hero h1`; `.cellHint` (:212) → mono.
- **M:** first fold = status strip + NEEDS YOU / BROKE / MOVED already exists (commit `1cca608`); verify no horizontal overflow after removing the halo chips.

### Shell: Sidebar, MobileChrome, PromptBar, PageHeader, CommandPalette [A]
- `components/Sidebar.module.css`: `.sidebar` gradient wash + shadow (:19-24) → `background:#000; border-right:1px solid #1E293B`; delete `::after` edge light (:29-38), `.mark svg` drop-shadow (:44), `.link.active` gradient (:82-87) → `background:#0A0F1A; border:1px solid #1E293B; color:#3B82F6`, delete `.link.active svg` drop-shadow (:93), LED glow (:95-105) → 2px `#3B82F6` bar, `.sysDot` glow (:129,:131). Width bug: rail is 232px (:12,:33) but `globals.css:8803` and `fold.css:57` reserve 236px → make both 232. Badge stays amber (meaningful).
- `components/MobileChrome.module.css`: `.tab[aria-current] svg` drop-shadow (:6), indicator glow (:7) → flat 2px top bar `#3B82F6`; `.scrim` blur (:27) → `rgba(0,0,0,.6)`; `.sheet` shadow (:37) → `border-top:1px solid #1E293B`; `.cell[aria-current]` gradient (:49) → `#0A0F1A`; `.layer` sans (:26) → mono; delete the pointless `@supports not (backdrop-filter)` block (:52-54); fallback colours `#070d17` (:53,:56) → `#000`. **M:** the 5-col `minmax(0,1fr)` grid is overflow-safe; keep.
- `components/atmosphere/PromptBar.tsx` + `.module.css`: keep as the global status line but flatten — `.caret` shadow (:58-64) off, `.dot` glow + ping (:79-98) → `.mc-glyph`, remove traffic lights, remove the `mx-type` typing animation. Text becomes `friday:~$` + current route; right side `↻ 30s · up 145h`. Remove the hardcoded `BUILD = '2026.10'` (duplicated in `Sidebar.tsx`) → `process.env.NEXT_PUBLIC_BUILD ?? ''`. (Move the file out of `atmosphere/` when that directory is deleted: `components/PromptBar.tsx`.)
- `components/PageHeader.tsx` + `ui.module.css:344-346`: render as `<Prompt host="desk" cmd={command} />` + mono title; hide `p` on **M** (today ≤620 → make it ≤820).
- Command palette (`globals.css ~6300`): `.cmdp-layer` sans → mono; flat card; the launcher's bottom pill (`claude ▾ open an app or ask claude…`) is the visual reference for the palette input: `border-radius:999px; border:1px solid #1E293B; background:#0A0F1A; height:48px`.

### `/kanban` — `KanbanBoard.tsx`, `Kanban.module.css`, `AgentDeck.tsx` [B]
- Header: replace the `<h1>Kanban</h1>` toolbar (`KanbanBoard.tsx:648`) with a widget head: `desk:~$ kanban`, then `<Verdict>4<small>open</small></Verdict>` + inline glyph counts `▶0 ×3 ·1` (running / blocked+failed / review), then `.mc-kv` lines `done  3 today  67 wk` and `streak 10d  best 31`, then a 14-day `<MiniHist>` of completions. Data: derive from `HermesTask.completedAt` (`lib/types.ts:584`) client-side; `summarizeKanban()` in `lib/flight-strip.ts:83` only counts lanes today → add `doneToday / doneWeek / streak / best` there (Lane B owns `lib/flight-strip.ts`).
- Lanes: `h2.laneHeader` (`Kanban.module.css:22`) glass-chrome + sheen → `<Divider label="needs you 2" />`; `.laneNeeds .laneHeader` shadow (:113) off; `.taskCard` running glow rail + scanning gradient (:31-36) → left 2px rail only, colours semantic (blocked/failed `#EF4444`; review stays neutral — amber there is decorative today); `.taskTitle` sans (:61) → mono 13px; card radius 10px (row), lane container 16px.
- Rows: `.mc-wrow` with glyph + ellipsised title + age right (`2d`, `5d`) exactly like `× AEGIS (product)…  2d`.
- Footer: `<Prompt host="desk" foot meta="↻ 15s" />`.
- AgentDeck (`AgentDeck.tsx:112`): `<h2>Agent deck</h2>` → `desk:~$ herdr ls`; neutral Chip → `.mc-glyph`. It calls `/api/herdr` every 4s and gets **401** live → show one line `herdr  unauthorized`, stop polling on 401.
- Duplicate work: `KanbanBoard.tsx:551` and `DetailDrawer` (:136) each open their own `EventSource('/api/events')` while `LiveDataProvider` already holds one → subscribe via the provider. `taskSort` exists twice (`KanbanBoard.tsx:369`, `lib/flight-strip.ts:188`) → keep flight-strip's.
- **M:** lanes are already single-column accordions below 900px (`:467`); verify the new head wraps at 412 (`.mc-kv` 7ch column fits). Lane `min-width:170px` (:105-107) is desktop-only.

### `/system` — `components/views/SystemPage.tsx`, `system.module.css` [B]
- Model the page on the `friday:~$ top` widget. One widget: `cpu [segbar] 44% 64°`, `2m [hist] ↑48%`, `load 6.55 20 thr`, `5070 [segbar] 64% 67°`, `3060 [segbar] 24% 45°`, `mem [segbar warn] 86% 40G`, `disk [segbar warn] 87% 119G`, `net ↓38B ↑34B`, `thr [per-core segbar, 2px gaps]`, then `-- top ------` with top processes `▶strata 5.0%`, footer `friday:~$   up 10d 20h`. Data exists in `HostSample` (`lib/host-metrics.ts:60-88`: cpuPct, load1, cores[], cpuTemp, mem, swap, net rx/tx, disk, gpus, procsRunning, uptimeSec, 120s histories) and `telemetry.cpu` (load5/15). Threshold tones: `autoTone {warn:85, crit:95}`.
- Replace `Stat series` sparklines (`ui.tsx:590`; `Sparkline.tsx:58-66` has a gradient area fill) with `<SegBar>` / `<MiniHist>`. Lane A removes the `<linearGradient>` from `Sparkline.tsx`.
- CardHeads → prompts: `friday:~$ top`, `friday:~$ sensors`, `friday:~$ systemctl --user status`, `friday:~$ gateways`, `friday:~$ kanban --health`, `friday:~$ journal -f`. `StatusDot` (`views/shared.tsx:7`, `.mc-led`) → `.mc-glyph` with `ok >` / `warn ×` amber / `bad ×` red.
- Chip tones: `'stopped' | 'unavailable' | 'missing'` all render amber (`SystemPage.tsx:47-58`) → `missing/unavailable` = `·` muted, `stopped` = `×` amber, `down` = `×` red.
- **M:** `CardHead` right slot (`SystemPage.tsx:185`, Freshness chip + Refresh) is `flex:0 0 auto` and squeezes the hostname → stack below 520px. GPU label column ~170px; `.row > :last-child {max-width:45%}` → let the value wrap.

### `/costs` — `components/views/CostsPanel.tsx`, `BurnLandscape.tsx`, `shared.tsx`, `lib/chart-colors.ts` [B]
- Replace `Window` chrome with widgets. Top: `desk:~$ costs` + `<Verdict>$412<small>this month</small></Verdict>`; `CLAUDE`-style card for weekly caps (`WeeklyUsage`, :171): `CLAUDE` / `<Verdict>3% this week</Verdict>` / rows `· session … 0%` with `.mc-segbar--thin`, `● week  4d 18h  3%`; same for Codex. `SectionRule` ("WHAT IT COST" etc.) → `<Divider label="what it cost" />`.
- `desk:~$ localai top` widget on costs (data is `costs.localCompute`, `CostsPanel.tsx:845-891`): `tokens 11.9M`, `saved $50.25 +$0.66`, `reqs 14,898 +225`, `14d <MiniHist>`, `gpu [segbar] 0% 60°`, `-- engines ------` list `▷strata idle` / `·ollama idle` / `·exl3 stopped`, footer `desk:~$`. Engine state comes from `/api/local-ai` → one shared fetch hook used by both routes (Lane B owns both).
- Remove: OpenRouter bar gradient + glow (:568-569), `ModeDot` glow (:238), `TFrame` corner ticks around every Stat (:206), inline `textShadow`. Money painted `STATUS.warn` everywhere (:391,:451,:523,:554,:657,:976) is decorative amber → white; amber only when `WeeklyUsage`/`FairUseGuard` ≥70/≥90 (:174, :1071).
- Charts: `MicroBars` `.emph` glow (`charts.module.css:25`; Lane A removes the CSS) + `border-radius:0`; `BurnLandscape` CATEGORICAL lime/violet/orange (:26-31) → three blues `#3B82F6 / #1D4ED8 / #60A5FA` + amber only for overage; `.cp-plan-band-track`, `.cp-model-chart-track`, `.cp-bar` → `<SegBar>`. `lib/chart-colors.ts:39` `STATUS` → read `--mc-ok/--mc-warn/--mc-crit`.
- Fix: `var(--font-mono)` ×8 → `var(--pt-font-mono)`; inline 8–9.5px type → 12px; stale `Note` "AXONOMETRIC PROJECTION … FLAT TILES" (:1248-1250) → delete.
- **M:** `.cp-table {min-width:560px}` (`globals.css:4628`) and the JS `Table` stack threshold `max(720, Σw)` (:255) → force the stacked layout ≤820; `.cp-plan-band-head` nowrap flex with `AsciiSpark` (:1091) overflows → wrap, spark on its own line; burn SVG → `MicroBars` already ≤560 → move to ≤820. Costs rules move from `globals.css`/`app/vf/v2-lane.css` into a new `components/views/costs.module.css` (B writes, A deletes the old blocks).

### `/local-ai` — `components/views/LocalAiPage.tsx`, `local-ai.module.css` [B]
- Head `desk:~$ localai top` (same component as on costs); `.bar` 6px pill (`local-ai.module.css:3`) → `<SegBar>`; CardHeads → `desk:~$ nvidia-smi`, `desk:~$ localai recipes`, `-- engines 1/3 --`; recipe `Chip` with `JSON.stringify` payloads (:34, :134) → `.mc-kv` rows (fixes **M** long-string overflow).

### `/chat` — `ChatConsole.tsx`, `ChatShell.module.css`, `AgentConsole.module.css`, `BotsPanel.tsx` [C]
- Pick **one** stylesheet: keep `ChatShell.module.css`, fold the surviving rules of `AgentConsole.module.css` into it and delete the latter (both style `.mc-btn`, inputs, panes and messages at equal specificity; the winner depends on import order today). Delete the never-matching `:global(.AgentConsole_filters/.AgentConsole_rowMeta)` (`ChatShell:113,123`) and unused `.modeToggle` (:165).
- Flatten: `.sidebar/.thread` `box-shadow: var(--ob-glow)` (:76-85), `.composerBar` glass (:148) → `#0A0F1A` + `1px #1E293B`, `.busyChip` glow (:163), `.avatarDot[data-status=busy]` glow+pulse (:135) → `.mc-glyph[data-g=run]`.
- Prompt: the composer already has a `>` gutter (`ChatConsole.tsx:625`, `.composerPrompt`). Make it `friday:~$` and collapse the four helper lines (hint/status/availability/error) into one `.mc-prompt--foot` line, e.g. `friday:~$ ▶ sending · 12s`. Thread header → `<Prompt host="friday" cmd={`chat ${profile}`} />`. Message bubbles: user = `#111827` on 10px radius, agent = no fill with a 1px `#1E293B` top rule; meta line stays mono. Message bodies labelled "Sans is reserved…" (`AgentConsole:245-253`) → mono.
- Herdr mode is offered without an availability check (`ChatConsole:614`) while `/api/herdr` returns 401 → disable the segment with a `herdr  unauthorized` hint.
- `LiveChatMirror` (:523) renders nothing and polls every 5s; list polls 20s, thread 15s → gate the mirror behind document visibility (`lib/motion-visibility.ts` pattern) or drop it.
- **M:** breakpoints 899 (`AgentConsole`) vs 767 / 768-1023 with `!important` patches (`ChatShell:196-203`) → single ≤820 rule. Composer: `>` gutter + 44px disabled voice button ("⌁") + 76px Send leave ~230px for text → hide the voice button on **M**, Send becomes an icon button.

### `/crew` (and `/bots` → redirects here) — `components/crew/Roster.tsx`, `Roster.module.css`, `useCrew.ts` [C]
- Replace the 28px sans h1 + 62ch paragraph + note (`Roster.tsx:9-13`) with the `phone:~$ agent top` widget: `agents N  all idle`, `cpu 0% 0B`, `load [segbar] 0%`, `-- agents ------`, one `.mc-wrow` per agent: glyph `▶` confirmed+fresh / `·` idle or unknown / `×` needs intervention / `↻` stale, name, task (`currentTask.title ?? presence.reportedTask`), age right. Footer `phone:~$`.
- Add the **BOT DESK** charm card: `BOT DESK   2 idle` header. Pixel office is **optional** (no sprite assets exist; `globals.css:1624` notes the old sprites were removed) — ship the text block first: `JARVIS  1/2`, `Subagent: Verify the Week 3 …`, `☕ idle · roaming the office`. Needs a join of `/api/bots` and `/api/crew` (`useCrew.ts:20`); idle = `worker.kind !== 'confirmed-worker' || freshness !== 'fresh'`; hidden profiles via `HIDDEN_BOT_PROFILES`. If a pixel scene is added later, gate it on a new `elements3d.botDesk` key (`components/ui-settings.tsx:26`) + Setup toggle.
- `Roster.module.css`: `.row > *` glass + 3px rail (:9-11) → `.mc-widget--tight` rows with glyph instead of rail; live-row glow/breathe (:39) off; `.title/.sub/.note/.table/.unowned h2` sans (:4-7,:24) → mono. `.fail` rail class (:14) is never applied (`Roster.tsx:19`) → use it for `needsIntervention` or delete.
- **M:** only breakpoint is 719 → 820; table already turns into cards. Mount `PageHeader` for consistency (crew is the only route without it).

### `/calendar` — `components/TickTickCalendar.tsx`, calendar rules in `globals.css:874-1014` [C]
- Target is the phone capture: `NOVEMBER 2026 … mon 9` header, 7-col mono grid, today = white chip with black text, other days `#0A0F1A` chips, dim weekday letters. `.mc-week` gradient re-skin (`globals.css:971-976`), bar tint (:897), today inset shadows (:922,:1014) → flat; `.mc-week-nav button` sans (:908) → mono. Rules move to `components/calendar.module.css`.
- Add the `TODAY … all clear … 0 done / NEXT ○ task tu / 10 done this week · 1d streak` card as the day summary (data from `/api/ticktick` when configured).
- `/api/ticktick` returns `{"configured":false,"tasks":[]}` live (no token) → the CONNECT card is correct, but `TickTickCalendar.tsx:120-121` never checks `res.ok`, so a 401/429 also shows "CONNECT TICKTICK" → check `res.ok`, show `× ticktick 429` instead. Replace the emoji button "🛠 OPEN SETUP" (:166) with `> open setup`.
- **M:** `.mc-week-month {min-width:560px}` (`globals.css:987`) forces horizontal scroll at 412 → `repeat(7, minmax(0,1fr))` with 2-char day cells; `w2l.css:92` sticky week bar is fine.

### `/content-creation` — `ContentCreationBoard.tsx`, `VideoPromptStudio.tsx`, `SignalFeed.tsx`, rules in `globals.css` [C]
- (Just removed from the nav in the uncommitted `lib/nav-tabs.ts` change; still routable. Do the flattening, skip new widgets.)
- Three card recipes → one `.mc-widget`: `.mc-pipe-card` glass + hover glow (`globals.css:2518-2528`), `.mc-studio-inputs/-output` 1.5px neon + 3-layer glow (:7951-7962), `.mc-signal-card` glow (:8134-8145), `.mc-signal-chip.active` glow (:8119), `.mc-pipe-bar > span` gradient+glow (:2598-2599) → `<SegBar thin>`, prompt-card grid gradient (:8062-8065) off. `.mc-studio-btn` matrix-green `rgba(57,255,20)` (:8037-8054) → primary `#3B82F6` (green is "all clear" only). Fonts: `.mc-studio-field input/textarea` (:8017), `.mc-studio-btn` (:8041), `.mc-content-select` (:2855) → mono. Rules move to `components/content.module.css`.
- Headers: `desk:~$ content board`, `desk:~$ studio`, `desk:~$ signals`; the 4 kanban columns get `-- script/film 3 --` dividers.
- **M:** `.mc-prompt-out {white-space:pre}` (:8076) → `pre-wrap`; `.mc-studio-prompt-card` 260px min-height ≤560 → auto.

### `/deliverables`, `/pipeline` — `DeliverablesShelf.tsx`, `deliverables.css`, `PipelineBoard.tsx`, `Pipeline.module.css`, `VaultDocuments.tsx`, `vault-documents.css`, `lib/pt/theme.ts` [C]
- **Bug:** both routes inject `THEME_CSS_VARIABLES` (`lib/pt/theme.ts:2-13`, used at `app/pipeline/page.tsx:15` and `DeliverablesShelf.tsx:62`) which sets `--pt-font-sans: "Geist", sans-serif` (not loaded) and `--pt-font-mono: "JetBrains Mono"` (bypasses the next/font face) plus a fallback cyan `#00d4ff`. Remove the font and colour overrides from that object; keep only the `--pt-launcher-*` consumer hooks, pointing at the widget tokens.
- `deliverables.css:4-6`: `.pt-artifact/.pt-shelf-detail` 12px radius → 16px; hardcoded state colours `#79e9ba #ffa1a1 #ffd183 #b9b0ff` (:5) → `--pt-ok/--pt-error/--pt-warn/--pt-text-dim`; `.pt-deliverables` sans (:1) → mono, h1 clamp 28–44 → `.mc-verdict` for the count only.
- `Pipeline.module.css:4` sans → mono; `.radar section` (:64) → `.mc-widget`; `vault-documents.css:27` hover glow off; `.mc-vault-group-head` (:34) → `<Divider>`.
- Headers: `desk:~$ pipeline` with 6 lane dividers `-- leads 20 --` …; `desk:~$ deliverables`.
- **M:** fine (grids 260/280px min collapse ≤700/600 → align to 820/520).

### `/github`, `/projects`, `/memory`, `/setup`, `/login`, error/404/loading, `/styleguide` [C, except styleguide and boot screens = A]
- `/github`: `.mc-window` (Lane A flattens the shared class); `GithubPanel.tsx:125` inline `textShadow: var(--pt-glow-sm)` → remove; `.mc-repo-card:hover` glow/lift (`globals.css:3550-3563`) off; language palette (`:12-13`) keep (identity colours), fallback `#8b949e` → `var(--pt-text-mute)`. **M:** `w2l.css:76` sets `grid-template-columns` on `.mc-gh-stats` which is `display:flex` (`globals.css:3511`) → dead rule; make `.mc-gh-stats` a 2-col grid ≤520; `.mc-gh-heatmap-inner {overflow:hidden}` (:1936) → `overflow-x:auto`. Rules → `components/github.module.css`.
- `/projects` (removed from nav in the uncommitted change): drop the `Tilt` wrapper (`Tilt.tsx:59` sets `willChange:transform` permanently; perspective tilt is off-theme) → plain `.mc-widget` tiles with `desk:~$ clients`.
- `/memory`: `.mc-mem-detail` glass+blur (`globals.css:6733-6740`) → flat; `.mc-mem-node.is-selected` drop-shadow (:6726) → 2px `#3B82F6` stroke; `.mc-mem-svg-wrap` → `#0A0F1A`. Rules → `components/memory.module.css`.
- `/setup`: `.mc-setup-group` glass/blur (`globals.css:1107-1110`), input focus glow (:1127) → 1px `#3B82F6` border; `.mc-setup-field input` (:1124) → mono. Preset swatches `key={p.hex}` (`app/setup/page.tsx:282`) → `key={p.name}`. Rules → `components/setup.module.css`.
- `/login`: `.mc-login-card` glass+blur (`globals.css:7383-7393`) → flat; inline gradient divider with hardcoded colours (`login/page.tsx:91`) → `1px solid #1E293B`. **Bug:** `'Signing in&hellip;'` (:127) is a JS string → renders the literal entity; use `'Signing in…'`.
- `error/404/loading` (`.boot-*`, `globals.css:8489-8526`) [A]: already mono + ASCII frame; remove `.boot-action:hover` glow (:8525); `.boot-error-word #ff5f57` → `var(--pt-error)`. **M:** `.boot-line {white-space:pre; width:calc(chars*1ch)}` may overflow at >57 chars → `max-width:100%; overflow:hidden`.
- `/styleguide` [A]: add a "Widgets" section rendering `Prompt`, `Divider`, `Verdict`, `SegBar` (accent/warn/crit/cyan/thin), `MiniHist`, the `Glyph` set, `.mc-dots`, `.mc-kv`, `.mc-wrow` so the contract is visible; `.lxDot[data-live]` glow (`styleguide.module.css:147`) off; `.page/.sectionTitle/.rules` sans (:10,:18,:32) → mono.

---

## 3. Execution lanes (disjoint file sets)

Run A first for ~1 hour (tokens + primitives + `SegBar`/`MiniHist`/`Prompt`/`Divider`), commit, then
run B and C in parallel against A's branch. B and C only **import** A's new files; they never edit
them. Nobody edits `app/globals.css` except A (DESIGN-SYSTEM.md ownership rule). B and C put route
rules in their own CSS Modules and list any `globals.css` rule they need removed in their PR
description for A to pull in a follow-up commit.

### Lane A — shared theme + shell + home — **model: `claude-opus-5-5`** (design reasoning, token architecture)
Files (exclusive): `lib/tokens.ts`, `lib/theme.ts`, `lib/config.ts`, `app/layout.tsx`, `public/manifest.json`,
`app/globals.css`, `app/styles/*.css`, `app/vf/*.css` (delete `v1-core.css`), `app/w2l.css`, `app/kanban/deck.css` (delete),
`app/page.tsx`, `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx`,
`app/styleguide/**`, `components/Shell.tsx`, `components/Sidebar.*`, `components/MobileChrome.*`,
`components/atmosphere/**` (delete; PromptBar moves to `components/PromptBar.tsx`), `components/aurora/**`, `components/boot/**`,
`components/PageHeader.tsx`, `components/ui.tsx`, `components/ui.module.css`, `components/CommandPalette.tsx`, `components/icons.tsx`,
`components/charts/SegBar.tsx` (new), `components/charts/MiniHist.tsx` (new), `components/charts/charts.module.css`
(remove `.emph` glow :25; segbar/hist classes live in globals), `components/Sparkline.tsx`,
`components/chat-continuity.css` (delete), `components/AgentDeck.module.css` (delete),
`tests/motion-css.test.mjs`, `tests/shell-scroll.test.mjs`, `tests/aurora.test.mjs`, `docs/DESIGN-SYSTEM.md`, `docs/widget-theme-reference.md`.
Order: §1.1–1.4 tokens → §1.5 primitives + React wrappers → **commit (B/C branch here)** → §1.6/1.7 removals → Shell/Sidebar/MobileChrome/PromptBar → Home → styleguide section → breakpoint ladder.

### Lane B — data widgets: kanban + system + costs + local-ai — **model: `claude-opus-5-5`** (new widget compositions need judgment: `top`, `kanban`, `localai top`)
Files (exclusive): `app/kanban/page.tsx`, `app/system/page.tsx`, `app/costs/page.tsx`, `app/local-ai/page.tsx`,
`components/KanbanBoard.tsx`, `components/Kanban.module.css`, `components/AgentDeck.tsx`, `components/KanbanSnapshot.tsx`,
`components/views/SystemPage.tsx`, `components/views/RigHud.tsx`, `components/views/CostsPanel.tsx`,
`components/views/BurnLandscape.tsx`, `components/views/LocalAiPage.tsx`, `components/views/shared.tsx`,
`components/views/costs.module.css` (new), `components/system.module.css`, `components/local-ai.module.css`, `components/charts/MicroBars.tsx`,
`components/Viz.tsx`, `components/ascii-viz.tsx`, `lib/chart-colors.ts`, `lib/glyph-series.ts`, `lib/flight-strip.ts`,
`lib/host-metrics.ts`, `lib/system-health.ts`, `lib/local-ai-constants.ts`.
Tests: `tests/flight-strip.test.mjs`, `tests/costs-*.test.mjs`, `tests/codex-usage.test.mjs`, `tests/host-parsers.test.mjs`, `tests/local-ai.test.mjs`, `tests/kanban-dispatch.test.mjs`, `tests/hermes-kanban-ttl.test.mjs`.
Mechanical sub-tasks that can be handed to `claude-sonnet-5-5` once B's compositions are set: the `var(--font-mono)` sweep, the 12px type floor, `STATUS` → tokens, the `Table` stacking threshold.

### Lane C — chat + crew/bots + calendar + content + deliverables/pipeline + github/projects/memory/setup/login — **model: `claude-sonnet-5-5`** (mostly mechanical flattening + prompt headers; escalate the BOT DESK card and the `/calendar` summary card to opus if the composition stalls)
Files (exclusive): `app/chat/page.tsx`, `app/crew/page.tsx`, `app/bots/page.tsx`, `app/calendar/page.tsx`, `app/content-creation/page.tsx`,
`app/deliverables/page.tsx`, `app/pipeline/page.tsx`, `app/github/page.tsx`, `app/projects/page.tsx`, `app/memory/page.tsx`,
`app/setup/page.tsx`, `app/login/page.tsx`, `components/ChatConsole.tsx`, `components/ChatShell.module.css`,
`components/AgentConsole.module.css` (delete after merge into ChatShell), `components/LiveChatMirror.tsx`, `components/ChatContinuityFooter.tsx`,
`components/Markdown.tsx`, `components/views/BotsPanel.tsx`, `components/crew/**`, `components/TickTickCalendar.tsx`,
`components/ContentCreationBoard.tsx`, `components/VideoPromptStudio.tsx`, `components/SignalFeed.tsx`,
`components/DeliverablesShelf.tsx`, `components/deliverables.css`, `components/PipelineBoard.tsx`, `components/Pipeline.module.css`,
`components/RevenuePipeline.tsx`, `components/VaultDocuments.tsx`, `components/vault-documents.css`, `components/usePipelineRadar.ts`,
`components/views/GithubPanel.tsx`, `components/views/ProjectGrid.tsx`, `components/Tilt.tsx`, `components/views/MemoryGraph.tsx`,
`components/views/MemoryStream.tsx`, `components/ui-settings.tsx`, `lib/pt/theme.ts`, `lib/ticktick.ts`,
new CSS Modules: `components/calendar.module.css`, `components/content.module.css`, `components/github.module.css`,
`components/memory.module.css`, `components/setup.module.css`, `components/login.module.css`.
Tests: `tests/chat-*.test.mjs`, `tests/pt-crew*.test.mjs`, `tests/pt-deliverables*.test.mjs`, `tests/pt-pipeline*.test.mjs`, `tests/ticktick-inbox.test.mjs`, `tests/vault-docs.test.mjs`, `tests/revenue-pipeline.test.mjs`.

### Post-merge cleanup (serial, after A+B+C) — **model: `claude-sonnet-5-5`**
Dead code with cross-lane test references; delete in one pass so the tests are updated once:
- Home chain: `components/HomeDeck.tsx`, `home/HomeBrief.*`, `HomeChat.tsx`, `HomeSystem.tsx`, `HomeTasks.tsx`, `HomeWorkspace.module.css`, `strip/**`, `BridgeStrip.tsx`, `MatrixRainBackground.tsx`, `boot/BootOverlay.tsx`, `boot/LaunchFilm.tsx`, `HoloRing.tsx`, `ascii-msg.tsx/.css`, `NeuralUplink.*`, `AgentAvatar.tsx`.
- 3D/orbital chain: `CoreOrb.tsx`, `NeuralOrbCanvas.tsx`, `OrbitalKanbanRing.tsx`, `PipelineOrbit.tsx`, `views/HoloHud3D.tsx`, `components/threed/**`, `lib/kanban-ring-layout.ts`, `lib/pipeline-orbit-layout.ts`, `lib/orb-*.ts`, `scripts/smoke-kanban-ring.mts`, `scripts/smoke-pipeline-orbit.mts`.
- Also: `TaskOverview.*`, `HandoffCard.tsx`, `SystemHealthPanel.tsx`, unused `Viz.tsx` exports (`Sparkline, Donut, DonutLegend, HBar, StackedBarChart, Gauge`), unmounted `RigHud` exports (`RigHud, Trace, CoreDie`), `app/api/agent-activity` (9.3 s response, **no client caller**) unless an external consumer is confirmed.
- Tests to update/delete with them: `tests/holo-motion.test.mjs`, `tests/launch-film.test.mjs`, `tests/handoff-card.test.mjs`, `tests/orb-overlay.test.mjs`, `tests/orb-state.test.mjs`, `tests/motion-css.test.mjs:31` (reads CoreOrb/HoloHud3D).
- Then check whether `@react-three/fiber` / `@react-three/drei` / `three` / `d3-force` are still imported → remove from `package.json`.

---

## 4. Real issues found (fix regardless of theme)

| # | Where | Issue | Lane |
|---|---|---|---|
| 1 | `app/layout.tsx:82`, `public/manifest.json` | theme-color `#16222b` / `#00d4ff` / `#010407` disagree with each other and the app | A |
| 2 | `lib/theme.ts:18,21` + `app/setup/page.tsx:282` | duplicate preset hex `#1e90ff` → duplicate React key | A / C |
| 3 | `components/Sidebar.module.css:12,33` vs `globals.css:8803`, `fold.css:57` | 232px rail vs 236px margin → 4px gap | A |
| 4 | `globals.css:8478` vs `fold.css:16` | 720–820px gets tab-bar bottom padding without a tab bar | A |
| 5 | `globals.css:1984-2074, 5903-6066`, `fold.css:19,42-48` | ~123 dead `.mc-mobile-*`/`.mc-more-*` rules | A |
| 6 | `app/vf/v1-core.css`, `app/kanban/deck.css`, `components/chat-continuity.css`, `components/AgentDeck.module.css` | imported nowhere | A |
| 7 | `CostsPanel.tsx` ×8, `globals.css:4604,4744,4764,4796` | `var(--font-mono)` undefined → sans numerals | B (+A alias) |
| 8 | `KanbanBoard.tsx:551`, `:136` | two private `EventSource`s on top of LiveDataProvider's | B |
| 9 | `AgentDeck.tsx:58` | polls `/api/herdr` every 4s → 401 forever | B |
| 10 | `CostsPanel.tsx:1248-1250` | stale "AXONOMETRIC PROJECTION" copy | B |
| 11 | `app/api/agent-activity` | 9.3 s latency, no client caller | cleanup |
| 12 | `lib/pt/theme.ts:2-13` | injects Geist / literal JetBrains font families + `#00d4ff` on /pipeline and /deliverables | C |
| 13 | `app/login/page.tsx:127` | `'Signing in&hellip;'` renders the literal entity | C |
| 14 | `TickTickCalendar.tsx:120-121` | no `res.ok` check → 401/429 shows the CONNECT card | C |
| 15 | `ChatShell.module.css:113,123,165` | `:global(.AgentConsole_*)` never match; `.modeToggle` unused | C |
| 16 | `ChatConsole.tsx:614` | Herdr mode offered with no availability check (401 live) | C |
| 17 | `w2l.css:76` | `grid-template-columns` on a flex container (`.mc-gh-stats`) | C (rule) / A (file) |
| 18 | `globals.css:987` | `.mc-week-month {min-width:560px}` → horizontal scroll at 412 | C |
| 19 | `scripts/audit-tabs.mjs:11-24` | route list still has `/team`, lacks `/crew /system /local-ai /deliverables /bots` | verification |
| 20 | Playwright | browsers not installed; every `scripts/*.mjs` audit fails at launch | verification |
| 21 | `lib/bot-actions.ts:24` | `execFileSync` blocks the server during bot actions | out of scope, note |
| 22 | `lib/nav-tabs.ts` (uncommitted) | `/projects` and `/content-creation` removed from nav while routes remain | confirm with Michael before deleting routes |

---

## 5. Verification checklist (every lane before PR; full set after merge)

```bash
# 0. one-time
npx playwright install chromium

# 1. static
npm run typecheck                      # baseline: clean
npm test                               # baseline: 542 pass, ~3 min; motion-css.test asserts globals.css keyframes/blur-kill
node node_modules/.bin/next build      # must complete (Turbopack default); then
systemctl --user restart mission-control && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4176/

# 2. literal budget (A owns; B/C must not add)
grep -c -E "#[0-9a-fA-F]{3,8}\b" app/globals.css          # 176 today → target < 20 (friday block lives in lib/tokens.ts)
grep -c "gradient("  app/globals.css                        # 114 today → target 0 outside boot/launch film
grep -c "box-shadow" app/globals.css                        # 228 today → target < 10 (focus rings only)
grep -c "backdrop-filter" app/globals.css                   # 54 today → 2 (the blur-kill rule the test requires)
grep -rn "var(--font-mono)" components app                  # → 0

# 3. live DOM
curl -s http://localhost:4176/ | grep -o '<html[^>]*>'      # data-theme="friday", no data-palette
curl -s http://localhost:4176/ | grep -o '<style id="friday-accent">[^<]*' # → absent for #3b82f6
curl -s http://localhost:4176/ | grep -c 'Atmosphere-module' # → 0 (rain gone)
curl -s http://localhost:4176/ | grep -o '<meta name="theme-color"[^>]*>' # #000000

# 4. browser — mobile matrix (add [412, 915] to WIDTHS, or use 414)
node scripts/audit-mobile-matrix.mjs http://127.0.0.1:4176 --only 414
#   expect: 0 overflow, 0 tap, 0 nav, 0 type rows on every route
node scripts/audit-mobile.mjs                              # 375px horizontal-overflow assert on .mc-main

# 5. browser — visual
node scripts/visual-snapshot.mjs capture before --only desktop,phone   # run BEFORE lane work on main
node scripts/visual-snapshot.mjs capture after  --only desktop,phone
node scripts/visual-snapshot.mjs compare before after                  # review geometry diffs per route
node scripts/audit-tabs.mjs http://localhost:4176 artifacts/2026-11-09/tabs   # after fixing its route list (#19)
```

Manual pass at **1440×900** and **412×915**, each route:

- [ ] Page bg is pure `#000`; no gradient, rain, grid, vignette, scanline or bloom anywhere (`getComputedStyle(document.body).backgroundImage === 'none'`).
- [ ] Every card: `#0A0F1A` fill, `1px #1E293B` border, 16px radius, no `box-shadow`, no `backdrop-filter` (spot-check 3 cards per route in computed styles).
- [ ] Every card header is a `host:~$ cmd` prompt in `#3B82F6`; section breaks are `-- label ----` dividers; no macOS traffic lights, no figlet wordmarks, no emoji.
- [ ] Fonts: everything JetBrains Mono except the verdict numerals (`4`, `3% this week`, `$412`, `71°`), which are Instrument Sans.
- [ ] Charts: only segmented blocks / mini histograms / dot rows; filled `#3B82F6`, unfilled `#111C33`; amber only when ≥ threshold; `document.querySelectorAll('linearGradient').length === 0` outside the memory graph.
- [ ] Status glyphs `> · × ↻ ↑ ↓` present on kanban rows, crew rows, system services, engines; LEDs gone.
- [ ] Cyan `#00A3FF` appears at most once per card (e.g. the live indicator), never as a border.
- [ ] Sidebar (desktop): `#000` + right hairline; active item `#0A0F1A` box + `#3B82F6` text; no gap between rail and content.
- [ ] Tab bar (412): `#000` + top hairline, 5 tabs, labels ≥ 12px, badge amber; last content element not hidden behind it after scrolling (matrix `nav` check).
- [ ] 412: no horizontal scroll on `.mc-main` on any route (calendar month, costs tables, chat composer, studio output are the known risks).
- [ ] `/kanban` head shows `N open ▶a ×b ·c`, done-today/week, streak/best, 14-day histogram with real numbers; footer refresh age ticks.
- [ ] `/system` shows cpu / load / gpu(s) / mem / disk / net / thr rows with segbars; mem/disk flip to amber at ≥85.
- [ ] `/costs` and `/local-ai` show the `localai top` block with tokens / saved / reqs / 14d / gpu / engines; CLAUDE weekly card has the thin progress lines.
- [ ] `/crew` shows `agents N all idle` + agent rows with glyphs; BOT DESK card shows the idle line.
- [ ] `/chat` composer prompt reads `friday:~$`; one footer status line; Herdr segment disabled while `/api/herdr` is 401.
- [ ] `/setup` accent preset list has no duplicates; selecting "Widget (default)" produces no `friday-accent` style block; "Launcher slate" and "Omarchy" still stamp `data-palette` and still look like themselves.
- [ ] `prefers-reduced-motion` and `data-motion="off"` still render all content (boot/launch rules intact; `tests/motion-css.test.mjs` is the gate).
- [ ] Lighthouse mobile on `/` and `/kanban`: no new "non-composited animations" versus the before snapshot.

Record results in `artifacts/2026-11-09/polish-verification.md` (route × viewport × pass/fail, matrix JSON attached).
````

Recap: the audit is complete and the plan above is final. It was not written to disk because the session has no write grant for the repo. To land it, either paste the block into `docs/polish-plan-2026-11-09.md` or re-run this planner with write permission for that path. Nothing was committed, and no source files were touched. The daily memory log under `memory/` was also skipped for the same reason, so this run has no on-disk trace yet.

---

## 5. Lane A pre-flight audit (2026-11-09, from the read-only planner run)

- `tests/motion-css.test.mjs` asserts `SURFACE.bg === '#07080b'` and the six `--mc-rain-*` tokens stay in globals.css. The plan sets bg `#000000` and deletes the rain → the test must be updated in the same change (Lane A owns it).
- The blur-off rule must keep exactly `.cmdp`, `.mc-cockpit`, `.mc-drawer`, `.mc-login-card`, `.mc-modal` in its exemption list (`.mc-cockpit` may lose styles but stays listed).
- `.mc-hud3d` must remain the ONLY `contain: paint` rule in globals.css.
- `matrix-blue.css`, `aurora.css`, `globals.css` set `--mbg-*`, `--aur-*`, `--ob-*`, `--glass-*` as fixed root colors — write new values directly into those files, don't rely on token-block load order.
- Tablet icon rail is 72px (`Sidebar.module.css`, `--mc-fold-rail` in fold.css), not the plan's 64px.
- No `(max-aspect-ratio: 5/4)` guard exists today.
- Phone-layout switch is at 719/720px (`FOLD_INNER_MEDIA_QUERY` in Sidebar.tsx, MobileChrome.tsx ~138, both .module.css, fold.css) — move all to 820/821 together.
- Hardcoded build number `2026.10` in atmosphere/PromptBar.tsx and Sidebar.tsx footer.

## 6. Lane C pre-flight audit (read-only run)

- `/chat`: add `chat.module.css`, `friday:~$ chat <profile>` thread header; disable Herdr segment with `herdr unauthorized` hint when `/api/herdr` is 401.
- `/crew`: `agent top` widget + BOT DESK card joining `/api/bots` + `/api/crew`.
- `/calendar`: add `res.ok` check, day-summary card, kill forced horizontal scroll at 412px.
- `lib/pt/theme.ts`: font + cyan overrides need fixing.
- `Signing in&hellip;` bug in login.
- Duplicate preset key in `/setup`.

## 7. Lane B pre-flight audit (read-only run)

- Lane B imports Lane A primitives (SegBar.tsx, MiniHist.tsx, Prompt/Divider/Verdict/Glyph in ui.tsx). Code against the planned APIs; the build only passes once A lands.
- /system `-- top --` process list has NO data source (host-metrics has no per-process CPU) → drop it or add a sampler.
- Only Codex has weekly-cap data; Claude has no cap snapshot → show 7-day tokens honestly, not "CLAUDE 3% this week".
- /api/local-ai reports only RUNNING containers → no "stopped" engine lines; honest list = running engines + proxy loaded model.
- Do NOT change `CATEGORICAL` in lib/chart-colors.ts (memory graph + crew accents use it). Switch `STATUS` to CSS tokens; swap colors locally in BurnLandscape.tsx. STATUS as CSS var can't feed glow() (no current code does).
- flight-strip: add `completionStats(tasks, now)` → { doneToday, doneWeek, streak, best, daily[14] }, local calendar days, timezone-agnostic test. First edit on re-run.
