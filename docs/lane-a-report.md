# Lane A report — shared theme, primitives, shell, home (2026-11-09)

Branch-point commit for Lanes B/C: **`2c1c98a` feat(theme): widget token layer + primitives**.
Everything after it is uncommitted in the working tree, as instructed (no further commits, no
service restart). Lanes B and C edit the same working tree; every git operation I ran was
path-scoped to Lane A files.

## What changed, per file

### Tokens (§1.1–1.4) — in `2c1c98a`
- `lib/tokens.ts` — new `WIDGET`, `WIDGET_RGB`, `WIDGET_SEMANTIC`, `WIDGET_RADIUS`; `FONT.verdict`;
  `TYPE_SCALE.verdict`; `SURFACE.bg/bgSoft` → `#000000/#050505`. `buildFridayThemeCss()` rewritten to
  the plan's §1.1 block (every alias layer flat, every effect token `none`/`transparent`), plus
  `--font-mono` compat alias. Chart tokens in the friday block are `var()`-relative so Omarchy keeps
  its hue. `:root` gained `--mc-seg-*` and `--pt-fs-verdict` fallbacks. After the commit:
  `--pt-bg-rgb` / `--pt-card-rgb` (for the `rgba()` fallbacks) and friday
  `--pt-btn-glass-ink-danger/-confirm`.
- `lib/theme.ts` — `FRIDAY_ACCENT` (`#3b82f6`) emits no override; presets are now
  Widget (default) / Launcher slate / Omarchy (PT) / Periwinkle / Matrix green / Amber CRT / Blood
  orange. The duplicate `#1e90ff` pair is gone, which fixes the duplicate React key (issue #2).
- `lib/config.ts` — accent fallback is `FRIDAY_ACCENT`.
- `app/layout.tsx` — `themeColor: '#000000'`. `public/manifest.json` — theme/background `#000000` (issue #1).

### Primitives (§1.5) — in `2c1c98a`
- `app/globals.css` (end of file) — `.mc-widget(--tight)`, `.mc-prompt(--foot)`, `.mc-divider`,
  `.mc-verdict`, `.mc-kv`/`.mc-kv-row`, `.mc-segbar(--thin)`, `.mc-hist`, `.mc-dots`,
  `.mc-glyph[data-g]` (run idle fail err retry up down ok + `live` cyan, `todo` ○), `.mc-wrow`.
  All values are `var(--pt-*)`, so the opt-in palettes reskin them. I deviated from the plan's
  literal-hex CSS on purpose: it would have broken the hex budget and the palettes.
- `components/ui.tsx` — `Prompt`, `Divider`, `Verdict`, `Glyph`, `Kv`, `KvRow`, `WRow`.
  `Card` loses its blur. After the commit, `Window`'s traffic lights became a `desk:~$` prompt and
  the Clamp/EmptyTerminal glyphs were de-emoji'd.
- `components/charts/SegBar.tsx`, `components/charts/MiniHist.tsx` — new (exports `segFilled`, `segTone`, `histSlots`).
- `components/Sparkline.tsx` — `<linearGradient>` area fill removed. `charts.module.css` — `.emph` glow removed.

### Removals (§1.6/1.7) — uncommitted
- Deleted with `git rm`: `app/vf/v1-core.css`, `app/kanban/deck.css`, `components/chat-continuity.css`,
  `components/AgentDeck.module.css`, `components/atmosphere/**` (the rain is unmounted from `Shell.tsx`).
- `app/globals.css` 10 076 → 4 829 lines. The work was done by postcss scripts kept outside the repo:
  1. **Dead-class prune.** It dropped every selector whose class appears nowhere in
     `app/ components/ lib/ public/` source, and handles `${}` template prefixes. It also pruned
     unused custom properties and `@keyframes` to a fixed point. This covers the plan's
     `.mc-mobile-nav*`, `.mc-more-*`, `.mc-mobile-pill`, `.mc-side`, `.mc-cockpit`, `.mc-vignette`,
     `.mc-scanlines`, `.mc-ambient3d`, `.mc-bg` and `.mc-cmdp-trigger`, about 1 700 selectors in all.
     The pass-1 report is in `artifacts/2026-11-09/lane-a-prune-report-pass1.json`.
  2. **Effect strip.** All `text-shadow`, all non-focus `box-shadow` (and `box-shadow` in transition
     lists), all `backdrop-filter` except the required kill rule, and `drop-shadow`/`blur` filters
     are gone. Each `gradient()` was replaced by its base colour stop, or by `transparent` for
     pseudo-elements, edge lights and vignettes. Boot/launch film rules were exempt.
  3. **Hex/fallback map.** Hex literals and `var(--pt-launcher-*, #hex)` / `-rgb, n,n,n` fallbacks
     now point at friday tokens. The periwinkle `157,180,236` fallbacks were painting friday surfaces.
- Hand edits in `globals.css`:
  - Removed the "final layer" `html:root { --pt-card-bg: … }` and `:root:root:root { --pt-text-mute }`
    overrides. They silently defeated the friday block.
  - `body` is mono, `#000`, and `background-image: none`. `h1` is mono. The friday `h1/h2` colour
    rule now uses `:where()` so primitives can colour headings.
  - `.mc-led` is now a flat 6px dot with no pulse. `.cmdp` is a flat card, and its input row is the
    launcher pill (48px, `999px`, hairline).
  - `[data-glass]` is the flat card, with no lift, sheen or `--gx/--gy`.
  - Four stacked button-override layers were removed. The surviving shared button layer now has a
    solid-accent **primary** arm; primary rendered identical to ghost once the gradient went.
  - `.boot-line { max-width: 100% }`.
  - `.mc-rain` / `.ob-matrix-rain` rules removed.
- `app/styles/matrix-blue.css`, `app/styles/aurora.css` — `:root` colour layers rewritten as aliases onto tokens (0 hex). Page background is black with no image.
- `app/styles/launcher.css` — gradient page and dead `.mc-stat`/`.mc-cost-bar` rules gone.
- `app/vf/*.css`, `app/w2l.css` — the same three passes, plus breakpoints.
- `tests/motion-css.test.mjs` — `SURFACE.bg` assertion → `#000000`. The "rain tokens unchanged" test is
  now "rain is gone + widget accent tokens pinned". The blur-kill exemption list is unchanged.

### Shell (§2 Shell) — uncommitted
- `components/Sidebar.module.css` rewritten. The rail is `#000` with a right hairline. Active is a
  card box with accent ink and a flat 2px bar. The edge light, drop-shadows, LED glow and blinking
  caret are gone. The badge stays amber.
- `Sidebar.tsx` — the status line uses `<Glyph>`. The hardcoded `2026.10` → `NEXT_PUBLIC_BUILD`
  (the row is hidden when unset). `FOLD_INNER_MEDIA_QUERY` → 821–1100 / coarse ≤1400.
- `components/MobileChrome.module.css` rewritten. The tab bar is `#000` with a top hairline and
  12px labels. Active is accent with a flat 2px top bar. The scrim is `rgba(0,0,0,.6)` with no blur.
  The sheet is a flat card. `MobileChrome.tsx` switches at `max-width: 820px`, and the More sheet
  heading is now `phone:~$ ls`.
- `components/PromptBar.tsx` + `.module.css` (moved out of `atmosphere/`). The bar shows
  `friday:~$ <route>`, a node-state glyph and `↻ <sync age>`. It has no traffic lights, typing
  animation, caret or ping, and the build tag comes from `NEXT_PUBLIC_BUILD`.
- `components/PageHeader.tsx` — `<Prompt host cmd>` (new optional `command`/`host` props, defaults to the lowercased title) over a mono title; `p` hidden ≤820px. `ui.module.css` fonts → mono (statValue hero/lg keep sans), flat inputs/segmented/sheet, no blur.
- `components/CommandPalette.tsx` — prompt `friday:~$`, `-- no matches --`.
- `app/styles/fold.css` rewritten as the one shell-geometry contract: 232px rail, 64px icon rail at
  821–1100px, tab-bar padding ≤820px. This fixes issue #3 (232 vs 236) and issue #4 (the 720–820px
  phantom tab-bar padding). The old globals H2 dock/rail block and matrix-blue's 719px padding rule
  are deleted.

### Home (§2 `/`) — uncommitted
- `AuroraHero.tsx`
  - The hero is a `.mc-widget` with a `desk:~$ status` prompt and the date/time as meta. It no
    longer has a figlet wordmark, cursor, head-glow or traffic lights.
  - The sky panel has a `desk:~$ agents --today` prompt (with `N agents · now hh:mm` as meta) and a
    24-slot hourly `<MiniHist>` (agent-hours per hour, from `hourCoverage`).
  - The fake `initializing module…` swap is removed.
- `AuroraSky.tsx`
  - One flat core stroke per intensity level; the bloom stacks, filament and sweeping trail are gone.
  - The 3h/6h rules are real elements instead of gradients, the future area is dimmed instead of
    hatched, the dotted baseline uses `border`, and failures are a red `×`.
- `AuroraBands.tsx` / `AuroraHome.tsx`
  - The bands are `.mc-widget`s headed by `<Divider as="h2">` (`-- needs you 2 --`, `-- broke 0 --`,
    `-- moved 7 --`).
  - Rows use `<Glyph>`: done `>`, failed `×`, started `↻`, created `·`; degraded is amber `×`.
  - The status cells are `<Verdict>` numerals with a mono lowercase label. The moved trend is a
    `<MiniHist>`, and the running cell shows the one cyan `●` when live.
- `aurora.module.css` rewritten: 0 gradients, shadows, masks or text halos, and no `skyIgnite` /
  `skySweep` / blink. On mobile, the lane chips are solid card-colour.
- `app/global-error.tsx` — a flat widget card with a `friday:~$ reboot` prompt and a primary button; the glow is gone.

### Styleguide / docs — uncommitted
- `app/styleguide/page.tsx`
  - New **Widgets** section, first on the page. It has the swatches, three compositions
    (`desk:~$ kanban`, `friday:~$ top`, the CLAUDE weekly card) and a specimen of every primitive
    and variant.
  - The "glass over ambient rain" button study is removed (its premise is gone), and the CSS lost
    its fonts → mono and `.lxDot` glow.
- `docs/DESIGN-SYSTEM.md` rewritten for the widget system. `docs/widget-theme-reference.md` gained a "where it lives" section.

### Breakpoints (§1.7) — uncommitted
In every Lane A stylesheet and module, the off-ladder queries were mapped to the nearest step:

| from | to |
|---|---|
| max 360 / 560 / 600 / 620 / 660 | 520 |
| max 700 | 820 |
| max 900 | 980 |
| max 1100 | 1200 |
| min 601 / 701 | 521 |
| min 980 | 981 |
| min 1100 | 1201 |

What remains is 1400 / 1200 / 980 / 820 / 520, plus the plan-pinned 821–1100 fold band. The
wide-screen `min-width` enhancements at 1600, 1800, 1900 and 2560 were kept.

## Gates (raw)

```
$ npm run typecheck
> friday@1.0.0 typecheck
> tsc --noEmit
(clean, exit 0)

$ npm test
ℹ tests 544
ℹ suites 0
ℹ pass 544
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 180821.58958
exit 0

$ node node_modules/.bin/next build
▲ Next.js 16.2.10 (Turbopack)
... (all 40+ routes listed, ƒ dynamic)
exit 0     # warnings only: inferred workspace root (multiple lockfiles), middleware→proxy deprecation
```
Full logs: `artifacts/2026-11-09/lane-a-npm-test.log`, `artifacts/2026-11-09/lane-a-next-build.log`.
(544, not the baseline 542: other lanes added tests in the shared tree.)

## Literal budget — `app/globals.css` (plan §5 step 2, `grep -c` = matching lines)

| check | before (`d836ceb`) | after | target |
|---|---|---|---|
| hex `#[0-9a-fA-F]{3,8}\b` | 154 | **2** | < 20 |
| `gradient(` | 112 | **1** | 0 outside boot/launch film |
| `box-shadow` | 227 | **2** | < 10 (focus rings only) |
| `backdrop-filter` | 54 | **2** | 2 (the blur-kill rule) |
| `text-shadow` | 35 | **1** | — |
| `@keyframes` | 73 | 26 | — |
| lines | 9 896 | 4 829 | — |
| `grep -rn "var(--font-mono)" components app` (lines) | 15 | **0** | 0 |

The 2 hex lines, the 1 gradient and the 1 text-shadow are all in the launch-film rules (`.launch-film`,
`.launch-seam`, `.launch-stat b`), which the plan exempts; `LaunchFilm.tsx` is on the post-merge
deletion list. The 2 box-shadows are focus rings (`0 0 0 3px …`). Note the plan's "176 / 114 / 228"
baselines don't match `grep -c` on `d836ceb`; the numbers above are measured.

## What I could not do, or did differently

- **`data/config.json` accent not changed.** It is gitignored personal config outside my file list,
  and it hot-reloads, so editing it would restyle the live :4176 service before the merge. Live is
  still `#1e90ff`, so `buildAccentCss()` still emits a dodger + tinted-text `friday-accent` block
  until it is set to `#3b82f6`, or "Widget (default)" is picked in `/setup`. **Orchestrator step.**
- **No visual / live-DOM verification.** Playwright browsers aren't installed (plan issue #20), and
  I was told not to restart the service. §5 steps 3–5 (live DOM greps, the 412/375 overflow audits,
  snapshots) are unverified.
- **Uptime in the PromptBar** (`up 145h`) is not shown. Host uptime is only in `lib/host-metrics.ts`
  via a separate fetch, and I didn't add another shell-level poll. The bar shows sync age instead.
- **No `(max-aspect-ratio: 5/4)` guard.** It doesn't exist today (as the pre-flight noted), and I
  didn't invent one. The icon rail is 64px, so I unified the old 72px tablet rail with the 64px
  collapsed rail.
- **Plan CSS used literal hex for the primitives; mine use tokens.** Same values in friday, but the
  hex budget holds and the palettes still work.
- **Launcher slate / Omarchy still stamp `data-palette` and keep their colours** (verified by reading
  the token blocks, not by rendering). They lose the structural effects that were literals in
  globals.css (their page gradients, the grey K4 pill buttons, LCD stat plates), so they render
  flatter than before. "Widget (default)" emits no `friday-accent` block (`buildAccentCss` returns `''`).
- **Kept for the post-merge cleanup lane** (their deletion touches cross-lane tests):
  `public/rain.js`, `MatrixRainBackground.tsx`, the launch-film CSS, the `.ob-*` home-deck rules
  used only by the dead HomeDeck chain, and the `.mc-hud3d` contain rule (asserted by
  `motion-css.test`).

## `globals.css` rules left for Lanes B/C to have moved, then removed

These rules are still referenced by B/C components, so the dead-class prune kept them. They are now
flat (no shadow, gradient or blur), but they are still route rules in a coordinator file, and each
lane should move its share into its module and list the deletions.

- **Lane B**
  - `.mc-rig-*` (79 selectors, RigHud) and `.mc-heatmap*`.
  - `.cp-*`: `cp-model`, `cp-plan`, `cp-table` (incl. `min-width:560px`), `cp-iso`, `cp-burn`, `cp-fairuse`.
  - `.mc-hbar`, `.mc-donut`, `.mc-sparkline`, `.mc-health*`, `.mc-feed*`, `.mc-urgent*`, `.mc-tile*`.
  - The `.mc-led` callers (`views/shared.tsx`, `RigHud.tsx`, `SystemHealthPanel.tsx`) should move to `<Glyph>`, after which `.mc-led` can go.
- **Lane C**
  - `.mc-pipe-*` (incl. `.mc-pipe-bar > span`, now flat accent-deep), `.mc-content-*`, `.mc-studio-*`, `.mc-signal-*`.
  - `.mc-mem-*`, `.mc-setup-*`, `.mc-login-*`, `.mc-gh-*`, `.mc-repo-*`, `.mc-commit*`, `.mc-proj-*`.
  - `.cc-md-*` (Markdown) and `.mc-chat*`.
  - `.mc-window` users in GithubPanel and ProjectGrid. The class itself is flat now: `desk:~$` prompt head, no dots.
- **Shared, still live:**
  - `.mc-window*`, `.mc-modal*`, `.mc-btn` / `.ob-btn` (the shared button material) and `.mc-ascii-head` (`SectionHead`).
  - `.srule-*` (`SectionRule`, which B is replacing with `<Divider>`) and `.tframe-*` (`TFrame`, B removing).
  - Once B/C stop rendering `SectionHead`, `SectionRule`, `TFrame` and `.mc-led`, those blocks can be deleted in a follow-up.
- **Already removed because B/C had moved off them in the working tree:** all `.mc-week*` calendar
  rules (TickTickCalendar no longer renders them) and the `.mc-kb-toolbar` button arms.
