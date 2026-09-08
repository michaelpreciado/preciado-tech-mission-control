# CORE-NAV — INSPECT REPORT — 2026-09-05

Scope: inspection only. Base `1086ac1b3b5a8d30576851370ef5de8c72d4daf7` (`[CORE-ORB] ...`). No app files changed.

## A. DOM / CSS AS-BUILT

### Desktop sidebar

- `components/Shell.tsx:69-121`: `.mc-side` JSX/DOM order is:
  1. `<CoreOrb placement="desktop" />`; when enabled, hydrated, and width is `>820px`, this becomes `div.mc-core-orb.mc-core-orb-desktop`.
  2. `div.mc-brand`.
  3. `button.mc-btn.mc-cmdp-trigger`.
  4. hidden `div.mc-status-pill` (`style="display:none"`).
  5. one `div.mc-side-section` per nonempty visible section: Overview, Intelligence, Operations, System.
  6. `div.mc-side-footer`.
- The dynamic `CoreOrb` import has `{ ssr:false }`. `CoreOrb` also returns `null` until mounted, when `elements3d.coreOrb` is false, or when its placement does not match `(max-width:820px)`.
- `.mc-side`: flex column; `padding:18px 14px 14px`; `gap:14px`; `overflow-y:auto`. At 1440 it occupies the first `232px` shell column.
- `.mc-core-orb`: `64x64px`, `flex:0 0 64px`, `position:relative`, circular. Desktop adds `margin:0 auto 8px`.
- 1440 CSS-derived geometry: sidebar `(x=0,y=0,w=232,h=viewport)`; orb `(x=84,y=18,w=64,h=64)`; brand `(x=14,y=104,w=204,h=50)`. The brand top is orb bottom `82` + orb bottom margin `8` + flex gap `14`.
- `.mc-brand`: flex row, centered vertically, `gap:10px`, `padding:8px 12px`, `flex-shrink:0`, 1px border, relative/hidden overflow; its mark is `32x32px`.
- At `821-980px`, the shell uses a `64px` compact rail and `.mc-side` has `8px` inline padding. The current `64px` orb is wider than the rail's `48px` content box and can overflow/clamp. This breakpoint needs an explicit orb/control size rule (recommended `48px`, still above the 44px target), or corresponding sidebar-padding accommodation.

### Current Home nav entry / filtering

- `lib/nav-tabs.ts`: Home is `NAV[0].items[0]`, id `/`, label `Home`, in `Overview`; default rendered section index is 0 and default item index is 0.
- `tabOrder` can move `/` within Overview because `applyUiToNav` sorts every section by the saved global id order. It never moves an item across sections.
- `PINNED_TAB_IDS = new Set(['/', '/setup'])`. `applyUiToNav` retains pinned ids even if present in `hiddenTabs`; the setup POST validator also strips `/` and `/setup` from `hiddenTabs`.
- Yes, `/` can and should be filtered for the sidebar only. Do it after/common-with `applyUiToNav` while also dropping any newly empty section. Do not remove `/` from canonical `NAV` or `PINNED_TAB_IDS`: Setup, mobile reservation logic, and canonical route metadata still use those semantics.
- Each sidebar link gets `--i:idx`, where `idx` restarts within each section. No CSS in the repository consumes a nav item's `--i`; the only `var(--i)` consumer is Home tile entry animation. Removing Home merely renumbers Kanban/Calendar inline values and has no current visual effect.
- `.mc-nav-rail` and `.mc-nav-scan` are descendants of each `.mc-nav-item`. Active styling is entirely class-based (`.mc-nav-item.is-active`); there is no global index assumption. Removing the Home link removes its active rail, so the new home control needs its own active treatment.

### Mobile dock

- Current DOM: `nav.mc-mobile-nav` contains the floating `CoreOrb` as a direct child, followed by `div.mc-mobile-nav-inner`. The inner contains an absolute pill, four primary `.mc-mobile-item`s in order `Home, Kanban, Chat, Bots`, then `.mc-mobile-item.mc-more-btn`.
- `.mc-mobile-nav` is fixed at the bottom, `z-index:100`, `pointer-events:none`, with `12px` inline padding and `8px + safe-area` bottom padding; it is shown only at `<=820px`. At `<=520px`, inline padding is `8px`.
- `.mc-mobile-nav-inner`: flex row, vertically centered, width 100%, no `justify-content` override (`normal`); base height/max-height `56px`, reduced to `52px` at `<=520px`; `pointer-events:auto`; final cascade changes `overflow-x` from `auto` to `visible` and removes the edge mask.
- `.mc-mobile-item`: final cascade is `flex:1 1 0`, `min-width:0`, height 100%, max-height `56px` (`52px` at `<=520px`), `padding:6px 2px`, `gap:3px`, centered column content. Thus the entire cell is the tap target.
- Current `.mc-core-orb-mobile`: `display:block` at `<=820px`, absolute, `z-index:2`, `top:-40px`, `left:50%`, `transform:translateX(-50%)`, `44x44px`. It is not a dock flex cell.
- CSS-derived geometry, safe-area assumed zero:
  - 700x900: dock inner `(x=12,y=836,w=676,h=56)`; floating orb `(x=328,y=796,w=44,h=44)`. Five equal item slots share the 674px inner content box: theoretical item lefts `13, 147.8, 282.6, 417.4, 552.2px`, width `134.8px` each. Labels: Home, Kanban, Chat, Bots, More.
  - 390x844: dock inner `(x=8,y=784,w=374,h=52)`; floating orb `(x=173,y=744,w=44,h=44)`. Five equal item slots share the 372px inner content box: theoretical item lefts `9, 83.4, 157.8, 232.2, 306.6px`, width `74.4px` each.
- Desired stable order is therefore `Kanban | Chat | Home orb | Bots | More`. Keep five equal `.mc-mobile-item` cells and render the Home link as the third cell; put the 44px visual inside it.

### Sliding pill

- `MobileNav()` stores `{left,width}` in state. After paint and on resize it runs `inner.querySelector('.mc-mobile-item.is-active')`, then copies `active.offsetLeft` and `active.offsetWidth` into the pill's inline `left`/`width`.
- The effect reruns on `[pathname, moreOpen]`. The pill is absolute with `top/bottom:8px`, `z-index:0`; mobile items are `z-index:1`.
- If the center orb is not a `.mc-mobile-item.is-active`, `/` has no measurable active item. The callback returns without clearing state, so navigation back to Home can leave the pill parked under the previously active route. Making the semantic Home link the third `.mc-mobile-item` preserves measurement unchanged.
- A late-loading/unmounted canvas must not own cell geometry. The always-present Link/cell must own width and height; the visual can mount inside without changing `offsetLeft/offsetWidth`.

### Orb interaction state now

- Markup is a `div` with `aria-hidden="true"`; it has no link/button role, href, label, current-page state, or tabindex.
- `.mc-core-orb` has `pointer-events:none`; the Canvas inline style also has `pointerEvents:'none'`. Desktop z-index is `auto`; mobile z-index is `2` inside the nav's `z-index:100` stacking level.
- Wrapper transitions are `box-shadow 3s ease, background 3s ease`; hot state sets `transition-duration:1.5s`; `prefers-reduced-motion` disables the wrapper transition.
- Required control shape: an always-present `Link href="/"` with `aria-label="Home"`, `aria-current="page"` only when `pathname === '/'`, visible `:focus-visible` treatment, and a 44px-or-larger target. Keep the canvas/brand-mark visual subtree `aria-hidden` and `pointer-events:none`; put pointer/focus semantics on the Link, not the WebGL div.

## B. STATE / INTERACTION RISKS

1. **Pill stale or absent on Home.** A center wrapper without `.mc-mobile-item.is-active` is not measured; existing state is not cleared. **Recommendation:** make the third Home Link a normal active mobile item and retain the current pill logic. If product intentionally wants no pill behind the orb, explicitly set pill to `null` on `/` rather than relying on “no match.”
2. **`coreOrb:false` removes all direct Home controls after replacement.** `CoreOrb` currently returns `null`. Desktop brand is not a link. Mobile MoreSheet excludes Home because `/` is in `PRIMARY_IDS`. Remaining fallbacks are indirect: Command Palette contains Home; on mobile, More → Jump to… opens it. **Recommendation:** keep the semantic Home Link/cell always mounted and let `coreOrb` control only the WebGL visual. When false, render a lightweight static Home/brand glyph in the same 64/48px desktop and 44px+ mobile target. Update Setup copy to say the toggle disables the 3D heartbeat visual, not navigation. No API/schema change is required.
3. **Reduced motion / motion off.** These modes already retain the orb and switch Canvas to `frameloop="demand"`; only animation freezes. **Recommendation:** keep the independent semantic Link outside the dynamic visual so it survives reduced motion, WebGL failure, hydration delay, and `coreOrb:false`.
4. **Mobile ordering coupled to `PRIMARY`.** Removing `/` from `PRIMARY` would cause MoreSheet to include Home unless its exclusion set is preserved separately. **Recommendation:** keep `/` in the reserved primary-id set; reorder/render the dock as Kanban, Chat, Home-orb, Bots, More. A small dedicated dock-order array is safer than changing canonical `NAV`.
5. **Hidden primary tabs can disturb visual symmetry.** Kanban, Chat, and Bots may be hidden; existing behavior intentionally removes their thumb slot. **Recommendation:** assign the Home cell fixed grid/flex order between the left group and right group. With all defaults it is exactly centered; if users hide a primary, either preserve empty fixed columns or document that user customization overrides symmetry. Do not allow hiding Home (`PINNED_TAB_IDS` remains correct).
6. **Meaningless Home reorder control.** Setup currently lists Home as pinned and draggable/movable inside Overview. Once the orb's placement is fixed, moving `/` in `tabOrder` has no visible nav effect. **Recommendation:** omit Home from the Setup reorder list or render it as a non-draggable “fixed home control” row. Existing saved `/` entries in `tabOrder` are harmless and can remain backward compatible.
7. **Accessibility/current state.** The current orb is deliberately absent from the accessibility tree. **Recommendation:** Link gets `aria-label="Home"` and exact-root `aria-current="page"`; inner orb remains `aria-hidden`. Add active styling on the control wrapper so `/` still has a visible current-page state after `.mc-nav-item.is-active` disappears.
8. **Compact desktop rail overflow.** At `821-980px`, 64px visual plus 8px sidebar padding exceeds the available 48px. **Recommendation:** add a compact-rail 48px orb/control override and verify 821, 900, and 980px as well as 1440px.
9. **Hydration/layout shift.** A Link created inside the `ssr:false` dynamic component appears late. **Recommendation:** Shell renders the permanent control box/fallback; dynamically imported `CoreOrb` supplies only the visual child.
10. **No nav component test currently covers this behavior.** `npm test` has orb-state logic but no Shell DOM/order/pill tests. **Recommendation:** add focused component/e2e assertions for one Home link per active breakpoint, exact five-cell mobile order, `aria-current`, toggle-off fallback, and pill center measurement.

### Repository coupling inventory

- `MoreSheet`: filters every `PRIMARY_IDS` route, so Home is currently excluded. Preserve `/` in that exclusion even if its visual dock entry becomes special-case markup.
- `CommandPalette.tsx:24-36`: hardcoded Home route remains valid and should not be removed; it does not honor `hiddenTabs`.
- `app/setup/page.tsx`: `NAV_TABS` includes `/`; Home is shown pinned, cannot be hidden, but can currently be reordered. UI help says “Home and Setup can't be hidden.”
- `app/api/setup/route.ts`: strips `/` and `/setup` from `hiddenTabs`; accepts `/` in `tabOrder`; accepts `coreOrb` boolean and shallow-merges `elements3d`.
- `lib/config.ts`: resolves `coreOrb` as `e3d.coreOrb ?? e3d.homeGlobe ?? true`.
- `scripts/audit-mobile.mjs`, `scripts/audit-tabs.mjs`, and `scripts/qa-audit.mjs`: use `['deck','/']` as the Home route name/path but make no dock-count/order assertion; route coverage remains valid.
- `tests/*.mjs`: no Home/mobile-nav/Shell expectation. `tests/orb-state.test.mjs` covers only state derivation.
- `/tmp/mc-core-orb-verify.mjs`: coupled to the superseded floating-notch design. It asserts 12 desktop nav items, five `.mc-mobile-glyph`s, `straddlesTop:true`, and a direct 44px floating orb. It must be replaced/updated for the build verification; it cannot validate the new dock-cell design unchanged.
- Historical `.codex-handoff/2026-09-05-core-orb.md` and its plan explicitly require decorative `aria-hidden`, `pointer-events:none`, and floating-notch placement. This CORE-NAV brief supersedes those clauses; do not “fix” the old historical handoff.

## C. GATE BASELINE NUMBERS

- `grep -c 'text-shadow' app/globals.css` → **24**.
- `npm test` → **16 tests, 16 pass, 0 fail, 0 suites, 0 cancelled, 0 skipped, 0 todo**; duration **1140.017602ms**.
- Current live check: `curl http://127.0.0.1:4176/` → **HTTP 000 / connection refused**. `systemctl --user is-active mission-control.service` → user D-Bus unavailable (`Operation not permitted`).
- Current Playwright script found: `/tmp/mc-core-orb-verify.mjs`; import is the required `/home/mp/.hermes/hermes-agent/node_modules/playwright/index.mjs`.
- Live probe attempts: **2/2 failed before browser launch**. Both were prefixed with `TMPDIR=/home/mp/.codex-tmp`; Playwright failed `mkdtemp` with `EROFS: read-only file system` under that directory. Per the timebox, current bbox/x-position figures in section A are **CSS-derived**, not current live measurements.
- Pre-existing artifact `/tmp/mc-orb-result.json`, timestamp `2026-09-05 19:53:05 -0700`, records **26/26 passed** for the same as-built tree:
  - 1440: desktop orb `64x64`, first sidebar child, above brand, 0 overlaps across 12 nav items, sidebar width 232, horizontal-scroll delta 0.
  - 700: mobile orb `44x44`, centered floating notch, dock-inner height 56, five glyph/items, 0 overlaps, horizontal-scroll delta 0.
  - 390: mobile orb `44x44`, centered floating notch, dock-inner height 52, five glyph/items, 0 overlaps, horizontal-scroll delta 0.
- `test-results/.last-run.json` exists but contains only `{"status":"failed","failedTests":[]}` from 08:27; it is not the 19:53 26/26 geometry artifact.

## D. RECOMMENDED MINIMAL DIFF

1. **`components/Shell.tsx`**
   - Add a small reusable semantic Home-control wrapper rendered by Shell: `Link href="/"`, exact-root active class/`aria-current`, `aria-label="Home"`, static fallback glyph, and `CoreOrb` as an optional visual child.
   - In Sidebar, keep this control first above `.mc-brand`; filter `/` only from sidebar section data and remove empty sections.
   - In MobileNav, render five ordered cells: Kanban, Chat, Home control, Bots, More. Give Home the same `.mc-mobile-item`/`.is-active` contract so existing offset measurement works.
   - Keep `/` reserved in `PRIMARY_IDS` (or a renamed exclusion set) so MoreSheet does not reintroduce Home.
2. **`app/globals.css`**
   - Split control geometry from visual geometry. Add desktop/mobile Home-control, active, hover/press, and focus rules; keep `.mc-core-orb` visual `pointer-events:none`.
   - Remove mobile notch rules (`position:absolute`, `top:-40px`, `left:50%`, translation). Make the 44px visual a centered child of the third dock cell.
   - Add the compact desktop rail (`821-980px`) 48px size override. Preserve dock heights 56/52, five equal cells, current pill z-order, and the `text-shadow` count of 24.
3. **`app/setup/page.tsx`**
   - Clarify that `coreOrb` toggles the 3D heartbeat visual only; Home navigation remains. Prefer hiding `/` from reorder controls or labeling it fixed/non-draggable.
4. **Verification only (no committed app dependency):** replace/update `/tmp/mc-core-orb-verify.mjs` to assert 11 desktop `.mc-nav-item`s, first semantic Home Link, mobile order `Kanban/Chat/Home/Bots/More`, Home cell center/pill position, toggle-off fallback, 44px minimum target, and no notch/overflow at 1440/980/821/700/390.

## E. OTHER IMPLEMENTATION TRAPS

- `components/CoreOrb.tsx`, `lib/orb-state.ts`, and `tests/orb-state.test.mjs` are currently **untracked**, even though tracked `Shell.tsx` imports `./CoreOrb` and commit `1086ac1` is labeled CORE-ORB. A commit containing only tracked HEAD is therefore incomplete. The builder/orchestrator must add these three files; do not lose them while preparing the nav diff.
- Do not put `aria-hidden` on the new Link; only the visual child gets it.
- Do not make Canvas the click target. A failed WebGL context, disabled 3D preference, or delayed dynamic chunk must leave navigation intact.
- Do not globally remove `/` from `NAV`: doing so also changes Setup metadata and can undermine MoreSheet exclusion. Scope visual removal to Sidebar and special-case the dock cell.
- Do not change `.mc-mobile-nav-inner` height or add a sixth flex child. The absolute pill does not consume a slot; the Home Link must replace the old Home slot, not accompany it.
- After insertion, verify exact `/` routing and browser focus at `/foo`-style paths: Home is current only when `pathname === '/'`.
- Existing global `a:focus-visible` rules provide a baseline outline, but a circular/compact control-specific focus rule should prevent clipping against the sidebar/dock chrome.
