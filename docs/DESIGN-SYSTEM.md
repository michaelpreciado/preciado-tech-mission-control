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
