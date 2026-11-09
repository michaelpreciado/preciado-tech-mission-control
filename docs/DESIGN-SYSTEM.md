# Mission Control design system

Since 2026-11-09 the whole app is the **launcher widget look** (`docs/widget-theme-reference.md`,
plan: `docs/polish-plan-2026-11-09.md`): pure black page, flat `#0A0F1A` cards on one `#1E293B`
hairline, 16px radius, `#3B82F6` accent, JetBrains Mono everywhere except verdict numerals
(Instrument Sans), `desk:~$` prompts, `-- label ----` dividers and `> · × ↻ ↑ ↓` status glyphs.
No blur, glow, gradient, vignette, scanline, rain or bloom anywhere.

The [styleguide route](/styleguide) is the rendered contract; its **Widgets** section shows every
primitive below, followed by the Launcher / Omarchy palette comparisons and the legacy primitives.

## Tokens

`lib/tokens.ts` is the single source of truth. `WIDGET`, `WIDGET_RGB`, `WIDGET_SEMANTIC` and
`WIDGET_RADIUS` hold the measured values; `buildFridayThemeCss()` emits them into
`html[data-theme="friday"]` (the structural theme, always on). Every legacy alias layer
(`--mc-*`, `--mp-*`, `--pt-mx-*`, `--mbg-*`, `--aur-*`, `--ob-*`, `--glass-*`, `--vg-*`,
`--pt-btn-glass-*`) resolves to the flat value there, and every effect token
(`--pt-glow-*`, `--pt-shadow-window`, `--pt-scanline`, `--*-sheen`, `--*-blur`) is `none`.

| role | token | friday value |
|---|---|---|
| page | `--pt-bg` | `#000000` |
| card | `--pt-card-bg` / `--pt-surface` | `#0A0F1A` |
| raised row | `--pt-surface-2` | `#111827` |
| hairline | `--pt-border` / `--pt-card-border` | `#1E293B` (dim `#152033`, strong `#334155`) |
| accent | `--pt-neon` / `--pt-dodger` | `#3B82F6` (bright `#60A5FA`, deep `#1D4ED8`) |
| one highlight per card | `--pt-mx-cyan` / `--mc-seg-cyan` | `#00A3FF` — never a border |
| text | `--pt-text` / `--pt-text-dim` / `--pt-text-mute` | `#FFFFFF` / `#94A3B8` / `#64748B` |
| semantic | `--pt-ok` / `--pt-warn` / `--pt-error` | `#22C55E` (all clear only) / `#F59E0B` / `#EF4444` |
| chart | `--mc-seg-on` / `--mc-seg-off` | accent / `#111C33` |
| radius | `--pt-radius-card` / `-row` / `-btn` | 16px / 10px / 10px |
| verdict size | `--pt-fs-verdict` | `clamp(28px, 4vw, 44px)` |
| rgba fills | `--pt-bg-rgb` / `--pt-card-rgb` | `0,0,0` / `10,15,26` |

Accent presets (`lib/theme.ts`): **Widget (default)** `#3b82f6` emits no override block;
**Launcher slate** and **Omarchy** stamp `data-palette` on `<html>` and re-declare their own
palettes at higher specificity; the rest go through `buildAccentCss()`.

## Widget primitives

CSS lives at the end of `app/globals.css`; React wrappers are in `components/ui.tsx` and
`components/charts/`. Use these instead of a route-local recipe.

| markup | React | use |
|---|---|---|
| `.mc-widget` (`--tight`) | — (or `<Card>`) | every card |
| `.mc-prompt` (`--foot`) | `<Prompt host cmd meta foot as>` | card header `desk:~$ kanban`; footer `↻ 15s` |
| `.mc-divider` | `<Divider label as>` | `-- needs you 2 ------`; `as="h2"` when it titles a section |
| `.mc-verdict` | `<Verdict unit tone>` | the one sans numeral per card |
| `.mc-kv` / `.mc-kv-row` | `<Kv keyWidth>` + `<KvRow k v r>` | aligned `done  3 today  67 wk` rows |
| `.mc-segbar` (`--thin`) | `<SegBar value max segments tone thin autoTone>` | flat segmented bars; `autoTone` = amber ≥85, red ≥95 |
| `.mc-hist` | `<MiniHist values days>` | 14-day / 24-hour mini histograms |
| `.mc-dots` | — | day/week/month dot progress |
| `.mc-glyph[data-g]` | `<Glyph g label>` | `run ▶` `idle ·` `fail ×`(amber) `err ×`(red) `retry ↻` `up ↑` `down ↓` `ok >` `live ●`(cyan) `todo ○` |
| `.mc-wrow` | `<WRow g right dim href onClick>` | glyph + ellipsised title + right meta |

`.mc-led` is retired (kept as a flat 6px dot until the last callers move to `<Glyph>`).
`PageHeader` renders a `desk:~$ <command>` prompt over a mono title; its subtitle hides ≤820px.
`Window` renders a `desk:~$` prompt instead of traffic lights.

## Shell and breakpoints

One ladder: **1400 / 1200 / 980 / 820 / 520**, plus `(pointer: coarse)` and reduced motion.
Shell geometry lives in `app/styles/fold.css`:

- ≥1101px (fine pointer): 232px black rail (`Sidebar.module.css`), content beside it.
- 821–1100px, or coarse pointers up to 1400px: 64px icon rail (`FOLD_INNER_MEDIA_QUERY`).
- ≤820px: bottom tab bar (`MobileChrome.module.css`) and the More sheet; content is padded clear of it.

`components/PromptBar.tsx` is the status line under every route: `friday:~$ <route>`, live-data
glyph, sync age.

## Adoption rules

1. Any card = `.mc-widget` (or `<Card>`, which carries the same recipe). Header = `<Prompt>`; section break = `<Divider>`.
2. Any metric = `<Verdict>` (one per card) or a `<KvRow>`. Any bar = `<SegBar>`; any trend = `<MiniHist>`. No SVG gradients.
3. Any status = `<Glyph>`. Amber only for real thresholds (≥85% usage, failed); red only for errors / down; green only for all clear.
4. Any button = `<Button>` (`primary` = solid accent with black ink; `ghost` = card fill + hairline) or `<IconButton>`.
5. Mono everywhere; sans only on `.mc-verdict`, `Stat` hero/lg values and the home headline. Lowercase labels; uppercase only for a card's proper-noun title (`CLAUDE`, `BOT DESK`).
6. Colors/spacing/radii/type always come from `var(--pt-*)` tokens. No hex literals, `box-shadow` (focus rings excepted), `backdrop-filter`, `text-shadow` or `gradient()` in component CSS.

## CSS ownership

`app/globals.css` is coordinator-owned (the token aliases, the shared button material, the
widget primitives and the legacy route rules still awaiting a move). Feature work does not edit
it: new component styling goes in the component's CSS Module, page-only layout in that page's
module, and a list of globals rules to delete goes in the PR description.

`tests/motion-css.test.mjs` is the gate for the motion contract: the single blur-kill rule,
`data-motion` / OS reduced-motion fallbacks for the boot and launch film, and the widget accent
tokens.
