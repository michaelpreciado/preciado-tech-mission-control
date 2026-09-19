# Mission Control design system

The shared UI vocabulary lives in `components/ui.tsx`, with component-owned recipes in `components/ui.module.css`. The [styleguide route](/styleguide) is the rendered contract and shows every supported variant.

## Primitives

- `Button` — shared text action; use `primary`, `ghost`, `danger`, or `confirm`.
- `Card` and `CardHead` — panel/surface and its title row; `Card` supports `default`, `raised`, and `sunken` tones plus `none`, `sm`, and `md` padding.
- `Field`, `Input`, `TextArea`, and `Select` — labelled form rows and native iOS-vocabulary fields. `Select` stays a real native `<select>` for mobile pickers.
- `Segmented` — controlled keyboard-accessible radio group with `sm` and `md` sizes.
- `Chip` — small metadata/status pill with `neutral`, `info`, `ok`, `warn`, `bad`, and `accent` tones.
- `IconButton` — square icon-only action; `aria-label` is required.
- `Stat` — metric block with `hero`, `lg`, and `md` sizes and optional `Sparkline` series.
- `Row` — semantic list row; it renders an anchor for `href`, a button for `onClick`, and a div otherwise.
- `Sheet` — bottom sheet/modal with focus trap, Escape and backdrop close, `main[inert]`, and focus restoration. `auto` and `tall` sizes are supported.
- `SectionHead`, `TFrame`, `SectionRule`, `Window`, `SkeletonPanel`, `Clamp`, `EmptyTerminal`, `SectionTitle`, and `Badge` remain available for backwards compatibility.

## Tokens in use

Component CSS consumes the `--pt-*` custom properties emitted by `lib/tokens.ts`: surfaces (`--pt-bg*`, `--pt-surface*`, `--pt-card-*`), text (`--pt-text*`), accent and semantic colors (`--pt-neon*`, `--pt-info*`, `--pt-ok*`, `--pt-warn*`, `--pt-error*`), spacing (`--pt-s-*`), radii (`--pt-r-*`), typography (`--pt-font-*`, `--pt-fs-*`, `--pt-lh-*`), borders (`--pt-border*`), and motion (`--pt-dur-*`, `--pt-ease-*`). Do not introduce component-local color, spacing, radius, or type constants.

## Adoption rules

1. Any button = `<Button>` from `components/ui` or `<IconButton>`. Never a raw `<button>` with hand-rolled pill styling.
2. Any panel/surface = `<Card>`. Any metric = `<Stat>`. Any list row = `<Row>`. Any status pill = `<Chip>`. Any modal = `<Sheet>`.
3. New component-specific styling goes in that component's own `*.module.css`. `app/globals.css` is coordinator-owned and must not be edited by feature work.
4. Colors/spacing/radii/type ALWAYS come from `var(--pt-*)` tokens.

## CSS ownership

`app/globals.css` is coordinator-owned. Feature work must not edit it. New component styling belongs in the component's CSS Module; page-only layout belongs in that page's CSS Module. The primitive layer is the only owner of new shared recipes.

## Button material: Blue Matrix Glass

The shared button material is **Edge Light**, a dark translucent body with a lit inner rim, hairline border and soft ambient depth. Primary uses dodger glass; ghost is neutral; danger is red and confirm is green. The existing sizing, capsule shapes, props and ARIA behavior are preserved. Loading retains readable variant ink; disabled gets a defined dark surface. Touch devices omit backdrop blur while retaining gradients and lighting. Reduced motion removes transitions and press scaling.

`BUTTON_GLASS` in `lib/tokens.ts` emits the `--pt-btn-glass-*` material tokens. The final Lane D layer in `app/globals.css` owns shared and legacy button paint without changing layout. This is the explicitly authorized button-material exception to the globals ownership rule above. IconButton and Segmented retain their component-owned geometry.

The [button study](/styleguide#button-glass) compares **A · Frosted Deck**, **B · Edge Light (installed)** and **C · Liquid Fill**, each in sm/md contexts on panel and ambient rain backgrounds. See [BUTTONS.md](./BUTTONS.md) for exact recipes, the winner decision, token inventory, contrast measurements and verification limits. Edge Light primary/ghost labels measure 11.73:1 / 16.81:1 on the panel; the conservative white-backdrop bounds are 5.83:1 / 6.85:1.

## Home controls (H2)

Home's composer, SEND, History/New chat, quick-prompt chips, header actions, model picker and Neural Uplink metric links consume the existing `--pt-btn-glass-*` Edge Light tokens in their CSS Modules. This preserves the existing native controls, event handlers, props and ARIA contract. Breakpoint rules own sizing only; a single module material group owns the Home control paint.

The composer and secondary actions use neutral tinted gradients over the translucent glass fill, a 12px blur with 120% saturation (including the WebKit prefix), inner specular rim and soft shadow. SEND uses the dodger primary gradient and light ink. The former terminal-cyan SEND color is removed; restoring it would require an explicit, documented owner exception to the single-accent rule. Control hairlines use exactly `.06` for disabled/subtle, `.10` for base and `.18` for hover/focus. Existing card fills, borders and highlights remain on their protected `--ob-*` recipes.

Feedback uses the existing 200ms duration and `cubic-bezier(.4,0,.2,1)`. Coarse pointers omit backdrop filters for these controls and the Home/Neural Uplink glass surfaces, retaining fill, gradient and rim. Reduced motion removes control transitions and press movement. Disabled controls retain defined fill and ink rather than whole-control opacity.

At phone widths (≤600px), the empty hero targets `calc(100svh - 160px)` (684px minimum at 390×844; content may expand it), with 8px vertical welcome/message padding, a 180px ring, 16px composer top padding and 12px chip spacing. The four chips retain 44px touch targets. Greeting, rotating readouts, one-tap prompts, model picker, orb/dock, brackets and every mobile `order:` declaration remain intact.

H2 token audit: HomeWorkspace raw hex occurrences **72 → 0**; system-gray declarations **8 → 0** (the earlier five-rule tally excluded hover/other occurrences). No tokens were added. Legacy colors now use existing surface, ink, semantic and glass roles. Both default and Friday inherit the same glass material.

Contrast calculated from the canonical sRGB tokens and alpha compositing: composer/secondary label **6.85:1**, primary SEND label **5.83:1**, using a white backdrop and the brightest gradient stop as the conservative bound. On an opaque RGB(10,12,15) panel these are **17.02:1 / 11.90:1**. These are material calculations, not screenshot samples. Live 390px dimensions, first-section position and scrollWidth remain unverified in this lane because the execution sandbox denies both local server binding (`listen EPERM`) and Chromium startup (`setsockopt EPERM`).

## Phone chrome (H3)

Only `@media (max-width: 620px)` changes the shared chrome. In `components/ui.module.css`, `.bridgeStrip` is a non-wrapping, horizontally scrollable row with 8px padding/bottom margin and 4px gaps; `.bridgeStrip > .chip` uses 4px inline padding and the 12px kicker token. All chips, warning states and the NEXT date remain rendered. `.pageHeader` uses 12px padding and 8px bottom margin, `.pageHeaderEyebrow` has a 4px bottom margin, and `.pageHeader p` is hidden. The subtitle remains in the DOM for desktop but `display: none` also removes it from the mobile accessibility tree. Eyebrow, title and optional actions remain visible; headers with actions or wrapping titles may be taller.

The explicitly authorized H3 exception to globals ownership adds `.mc-main .mc-cockpit` descendant overrides in `app/globals.css`. These outrank the legacy phone grid in the later-loaded `w2l.css`: `.mc-cockpit-row` becomes a single flex row, `.mc-stats` stays inline, stat tiles and refresh use 32px sizing, and `.mc-live-badge` remains inline. Brand text can wrap within its slot. The cockpit scrolls horizontally for large counts, narrow screens or long branding instead of clipping values. The refresh target is reduced from 44px to 32px on phones to fit this compact row. All sizing uses existing `--pt-*` tokens; glass paint and coarse-pointer blur rules are unchanged.

At 390px, estimated heights are bridge **82 → 46px**, cockpit **64 → 42px**, and the action-free chat page header **145 → about 75px**. With the smaller margins and existing 12px top inset, chat content should start around **199px**, previously 349px. These are CSS calculations at the default 16px root font size, not browser measurements. Local server binding was denied (`listen EPERM`), so rendered phone and 1440px desktop geometry could not be verified. A source comparison confirms all CSS outside the new 620px media blocks is unchanged; desktop rules, all component markup and `HomeWorkspace.module.css` remain identical.

Validation: `npx tsc --noEmit` and `npm run build -- --webpack` passed. The default `npm run build` remained at the Turbopack compilation stage for several minutes and was stopped; that build path is unverified. Both edited CSS files parse successfully and contain zero prefixed backdrop-filter declarations. Raw hex line counts are unchanged (`ui.module.css`: 0; `globals.css`: 186).
