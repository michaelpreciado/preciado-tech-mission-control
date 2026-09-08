# CORE-NAV — the orb IS the Home button (top model: gpt-5.6-sol)

Base: `1086ac1` (`[CORE-ORB] JARVIS core orb`). Read the inspect report first — it is the
ground truth for what exists: `.codex-handoff/2026-09-05-core-nav-inspect.md`. This brief
supersedes the floating-notch placement in `2026-09-05-core-orb.md` (decorative orb, absolute
notch). Do not revise those earlier handoffs.

## 1. Product intent

The CORE-ORB stops being a decorative widget and becomes the **Home button**:

- **Desktop / ≥821px:** a real `Link href="/"`, top of `.mc-side`, above `.mc-brand` — the
  64px orb visual sits inside it and IS the target (48px on the 821–980 compact rail).
- **Mobile / ≤820px:** the orb is the **third dock cell** — dock order becomes
  `Kanban | Chat | Home orb | Bots | More`. It is a normal `.mc-mobile-item` with the
  `is-active` contract; the 44px visual is a centered child of that cell, NOT the old
  absolute `top:-40px` notch.

Navigation must survive everything: `coreOrb:false`, reduced-motion (frameloop demand),
WebGL context failure, dynamic-import delay. The semantic link is always mounted;
`coreOrb` gates only the 3D visual.

## 2. Exact requirements

### 2.1 `components/Shell.tsx`
- Add a small reusable Home-control component rendered by Shell: `Link href="/"`,
  `aria-label="Home"`, `aria-current="page"` ONLY when `pathname === '/'`, exact-root active
  class for styling, a static fallback glyph, and `CoreOrb` as an optional visual CHILD.
- The `CoreOrb` canvas/visual subtree keeps `aria-hidden="true"` + `pointer-events:none`.
  The LINK owns pointer + focus semantics. The control is `:focus-visible` styled
  (control-specific rule so the outline is not clipped by sidebar/dock chrome; the existing
  global `a:focus-visible` is the baseline).
- **Sidebar:** keep the control first above `.mc-brand`. Filter `/` OUT of the sidebar
  section data (after/common-with `applyUiToNav`), dropping any resulting empty section.
  Desktop nav items go from 12 to 11. Do NOT remove `/` from canonical `NAV` or
  `PINNED_TAB_IDS` (Setup, mobile reservation, route metadata still use them).
  If `elements3d.coreOrb` is false, render a lightweight static Home/brand glyph in the
  same 64px (desktop) / 48px (compact rail) target.
- **MobileNav:** render five ordered `.mc-mobile-item` cells: Kanban, Chat, Home, Bots, More —
  via a small dedicated dock-order array (do NOT change canonical `NAV` order). The Home
  cell is the old Home slot **replaced**, not added (still exactly 5 cells; do not touch
  `.mc-mobile-nav-inner` height). Keep `/` reserved in the `PRIMARY_IDS`-class exclusion set
  so MoreSheet never re-adds Home.
- The always-present Link/cell owns offsetLeft/offsetWidth; the late-loading canvas must not
  own geometry.

### 2.2 `app/globals.css`
- Split control geometry from visual geometry: new clearly-labelled **CORE-NAV** section
  with desktop/mobile Home-control, active, hover/press, and focus rules. Visual
  `.mc-core-orb` stays `pointer-events:none`, canvas stays pointer-events none.
- **Remove the mobile notch rules** (`position:absolute`, `top:-40px`, `left:50%`,
  translateX). 44px visual = centered child of the third dock cell (cell is its own ≥44px
  tap target already — whole cell is the target today).
- Add the **compact desktop rail (821–980px) 48px override** (currently the 64px orb
  overflows the 48px content box — reported trap).
- FROZEN: dock inner heights 56/52px, five equal cells, pill z-order
  (pill z-0 / items z-1), `text-shadow` count exactly **24** (base = 24; no `text-shadow`
  declarations added anywhere).

### 2.3 `app/setup/page.tsx`
- Setup copy: `coreOrb` toggles the 3D heartbeat VISUAL only, not Home navigation.
- Home row: hide from the reorder list OR render as a non-draggable "fixed home control"
  row. Saved `/` entries in `tabOrder` stay backward compatible (harmless, no API change).

### 2.4 Carried files (CRITICAL — inspect trap E.1)
`components/CoreOrb.tsx`, `lib/orb-state.ts`, `tests/orb-state.test.mjs` are **untracked**
in the base repo but imported by tracked `Shell.tsx`. They were pre-copied into your
worktree as untracked files. Stage/commit them alongside your changes — a commit without
them is incomplete. Do not lose them while preparing the nav diff.

### 2.5 Forbidden
- No `aria-hidden` on the new Link (only on the visual child).
- No Canvas as click target; no `href`/label logic moving into the WebGL div.
- No global removal of `/` from `NAV`.
- No change to `.mc-mobile-nav-inner` height, no sixth flex child.
- No new npm dependencies. No dependency upgrades.
- No secrets access, no external messaging, no Kanban board mutation (Hermes owns the
  lifecycle), no unrelated refactors. Do not "fix" the historical `.codex-handoff/*.md`
  files or `/tmp` scripts.

## 3. Gates (all must pass before you are done)

1. `npm run typecheck` clean.
2. `npm test` — base is **16/16 pass**; keep everything green (your tests may raise the
   count; nothing may fail).
3. `npm run build` clean.
4. Grep proof: `grep -c 'text-shadow' app/globals.css` == **24** (report the number).
5. Playwright geometry (import playwright from
   `/home/mp/.hermes/hermes-agent/node_modules/playwright/index.mjs`; use
   `TMPDIR=/home/mp/.codex-tmp` for browser temp; the old `/tmp/mc-core-orb-verify.mjs`
   asserts the superseded notched design — write a NEW script, e.g. `/tmp/mc-core-nav-verify.mjs`):
   - **1440px:** desktop Home Link is first sidebar child above `.mc-brand`, 64px target,
     `aria-current="page"` at `/` (and NOT at another path), 11 `.mc-nav-item`s, zero
     overlap with nav items, no horizontal scroll.
   - **821/900/980px:** compact rail — control 48px, no overflow/clamp.
   - **700px:** dock inner exactly 56px, five equal `.mc-mobile-item` cells in order
     Kanban/Chat/Home/Bots/More, Home visual ≥44px inside its cell, pill centered under
     Home when on `/`, zero horizontal scroll.
   - **390px:** same as 700px with 52px dock inner.
   - Navigate `Home → Kanban → Home`: pill tracks correctly back to Home cell.
   - `coreOrb:false` (via setup API or query): static Home glyph present, still one Home
     link per breakpoint, nav intact.
   The app is a systemd user service at `127.0.0.1:4176`. If not up: `systemctl --user
   start mission-control.service` (report if D-Bus unavailable). If it truly cannot be
   started, run gates 1–4, write the playwright script, and say exactly what was
   not live-verified — do not fake it.
6. Do NOT commit yourself (git index is read-only for you); leave a clean working tree
   and I commit. Commit nothing except what the gates require you to leave staged is fine —
   uncommitted is the safe default.

## 4. Verification report (your final message)
Short report: what you built, each gate with exact numbers (test totals, text-shadow
count, geometry assertions per width), file list changed, and anything you deliberately
cut.
