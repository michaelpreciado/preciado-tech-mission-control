# MISSION CONTROL — VISUAL OVERHAUL DESIGN CONTRACT

> This file is the single source of truth for the cyberpunk matrix-glass-blue
> overhaul. Every lane (V0 foundation, V1/V2/V3 tab sweeps) reads this first and
> conforms to it. If a lane's plan conflicts with this file, **this file wins**.
>
> Goal (sir's words): cyberpunk matrix-glass-blue glass, blue binary rain, grid,
> Japanese fonts — **matching the Preciado Tech landing page** — but *super clean
> and sharp* to read text, *minimal*, and holding a **smooth 120hz**.
> Particles out. Grid stays.

---

## 1. THE ANCHOR: what "match Preciado Tech" means

Preciado Tech (`~/Documents/Github/preciado-tech`) is:
- **Cinematic near-black** ramp (not pure black), neutral cool ink text.
- **Icy-periwinkle accent** `#9db4ec` (accent) / `#6f8ede` (accent-2).
- Atmosphere done **statically**: one radial accent wash + a hairline grid.
  *No canvas, no rAF loop, no scroll listener.* That "calm but alive" look IS the
  clean direction — do not reintroduce a heavy moving particle field.
- Fonts: **JetBrains Mono** (display + mono) + **Geist Sans** (prose). Loaded
  self-hosted via `@fontsource`.

Mission Control today is the exact opposite: a **magenta-neon** theme
(`#ff10f0` default accent, `#ff7df8` bright, `#c400ba` deep), pink binary rain,
magenta-tinted text `#f8ecf7`, magenta bg tint `#1f0526`, and a live WebGL
**AmbientNeuralField** particle backdrop. The overhaul = repaint MC onto the PT
palette + PT calm-atmosphere + a blue binary rain + a Japanese accent font, then
audit every tab for oddities and hit 120hz.

MC's whole accent resolves from one hex (`lib/theme.ts` → `buildAccentCss()`),
so the repaint is mostly (a) recoloring the base SFC/TEXT tokens to PT's
near-black + neutral ink, (b) flipping `DEFAULT_ACCENT`, (c) recoloring the rain
canvas, (d) swapping the WebGL particles for the static PT atmosphere, (e) fonts,
(f) 120hz compliance. Everything else (per-tab polish) rides on top.

---

## 2. PALETTE (authoritative values — use these, no new hexes)

Surfaces — PT cinematic near-black ramp (this is what makes it "super clean"):
```
--mc-bg         #07080b   page base
--mc-bg-2       #0b0d12   raised section
--mc-surface    #101318   card / panel base
--mc-panel      #0e1117   modal / sheet
--mc-surface-2  #161b22   card hover
```
Ink — neutral cool (drop the magenta tint entirely; text must read sharply):
```
--mc-ink        #f4f7fb   primary copy
--mc-ink-dim    #c7ced8   secondary
--mc-ink-mute   #99a3b2   tertiary (AA on dark)
--mc-ink-faint  #6f7886   decorative only
```
Hairlines:
```
--mc-line       rgba(255,255,255,0.08)
--mc-line-2     rgba(255,255,255,0.12)
```
Accent — glass blue / periwinkle (PT-matched), replaces magenta:
```
--mc-neon        #9db4ec   primary accent (glass blue / periwinkle)
--mc-neon-bright #bcd0ff   bright (rain head, focus ring, highlights)
--mc-neon-2      #6f8ede   deeper periwinkle (secondary accent)
--mc-neon-deep   #4f6bb0   deep (borders at higher alpha, active states)
--mc-neon-rgb    157,180,236   (drives all rgba glow/border vars)
--mc-bg-tint     #0a0d16   (was magenta #1f0526; now cool near-black)
```
Glass tint (the "glass" in matrix-glass-blue) — very subtle, periwinkle:
```
--mc-glass      rgba(157,180,236,0.06)   panel wash
--mc-glass-line rgba(157,180,236,0.16)   glass border hairline
```
Binary rain color (was pink `rgba(255,16,240,·)` → blue):
```
body  rgba(127,160,255, 0.06–0.22)
head  rgba(188,208,255, 0.85)   leading glyph of each column
clear rgba(7,8,11,0.09)          the fade rect (match --mc-bg)
```
**Semantic colors stay** (critical/warning/ok) — do NOT repaint status colors.
Only the *brand/neon* accent moves to periwinkle, and only where it was
previously the magenta brand color. Keep red/yellow/green semantics intact so the
dashboard remains legible.

### The repaint in MC's token system
MC builds `--pt-*` vars from one accent. Map the values above onto the existing
`--pt-*` names rather than inventing a parallel system:
- `lib/tokens.ts`: set the base **surface** (SURFACE.*) + **text** ramp to the
  PT near-black/neutral-ink values, and the default accent to periwinkle so the
  committed stylesheet (no override) already renders the new theme.
- `lib/theme.ts`: `DEFAULT_ACCENT = '#9db4ec'`; reorder `ACCENT_PRESETS` so the
  PT periwinkle is first and renamed "Periwinkle (PT)". Keep the other presets.
  `buildAccentCss()` keeps working (it derives bright/deep/text/bgTint from the
  hex) — but verify the *derived* defaults still match values above; if the
  `mix()` math drifts (e.g. bright too purple), pin the periwinkle base values
  explicitly in `lib/tokens.ts` so the no-override look is exact.

---

## 3. ATMOSPHERE (particles OUT, grid STAYS, rain → blue)

1. **Remove the WebGL particle field.** Delete/unmount `<AmbientNeuralField />`
   and the `.mc-ambient3d` wrapper in `components/Shell.tsx` (and any import /
   dynamic() wiring that becomes dead). Keep the file on disk for now (git can
   restore it); just stop mounting it. Do NOT delete `HoloHud3D`/`CoreOrb3D`
   (those are content, not the global backdrop) — but they must respect the
   existing motion toggle (`full/reduced/off`) — reduced & off freeze them.
2. **Keep + keep the binary rain**, recolor blue (Section 2). The existing
   `<canvas id="mc-rain-canvas" className="mc-rain">` + `public/rain.js` stay.
   rain.js already pauses on `visibilitychange` — keep that. Recolor pink→blue.
   Keep opacity LOW (it's a backdrop, not a foreground — "clean" means the rain
   never fights the text). Consider dropping the per-glyph alpha ceiling a touch.
3. **Add the PT static atmosphere** as a global backdrop (this is the "grid the
   user likes"): on the app root (`.mc-shell` or equivalent top-level container),
   a `::before` radial periwinkle wash (top-center, faint) + a `::after` hairline
   grid — mirror PT's `.hero::before/::after` exactly in spirit:
   ```css
   background-image:
     linear-gradient(var(--mc-line) 1px, transparent 1px),
     linear-gradient(90deg, var(--mc-line) 1px, transparent 1px);
   background-size: 68px 68px;
   mask-image: radial-gradient(75% 60% at 50% 25%, #000 0%, transparent 80%);
   pointer-events: none;
   ```
   Static (no animation). Layer order: grid/wash behind everything, rain above
   the wash but behind content, content on top. Ensure `z-index`/`pointer-events`
   so clicks pass through the atmosphere.
4. **Minimal movement.** No new looping background animation. The only things
   allowed to move: (a) the binary rain (canvas, compositor-independent but
   already cheap/14px grid, and pauses when hidden), (b) the existing functional
   micro-animations (hover, status pulse, SSE live indicator) — and only under
   the `full` motion setting. `reduced`/`off` must freeze everything to a static
   frame (the existing `motion` setting already drives this; make it actually
   apply to the atmosphere + 3D + the 120hz offenders below).

---

## 4. TYPOGRAPHY (+ Japanese font)

- **Body/prose:** Inter (already loaded via next/font) — stays. "Super clean,
  sharp, readable." Do not replace body text with a decorative font.
- **Display + mono:** JetBrains Mono (already loaded) — stays for kickers, HUD
  labels, numbers, code, terminal.
- **Japanese accent (NEW):** add **Noto Sans JP** via `next/font/google`
  (`Noto_Sans_JP`, weights 400 + 700), wire a `--mc-font-jp` token. Use it as an
  *accent* for cyberpunk flavor, never for long prose:
  - brand wordmark sub / hero eyebrow kicker (e.g. a small kanji glyph next to
    "MISSION CONTROL"),
  - section eyebrow labels where a short JP tag fits,
  - the command-deck / home hero accent line.
  Keep JP usages **sparingly** (1–2 places per view) so it reads as intent
  (cyberpunk), not noise. Letterbox: give JP text a touch more `line-height` and
  do not letter-space kanji (it looks wrong).
- Load all three fonts in `app/layout.tsx` (next/font), apply JP token var to
  `:root`/body like the existing `--pt-font-ui` pattern (body-scoped var set by
  the loaded font's variable class).

---

## 5. 120HZ / PERFORMANCE CONTRACT (compositor-only)

Target: no continuous full-frame repaints; keep the 120hz refresh buttery.
Rules:
- Animate **only `transform`, `opacity`, and `filter`** for anything that loops.
- **Kill or convert** these current offenders (from the audit), converting to
  transform/opacity or gating them behind the motion toggle:
  - `hbar-grow` (width) → `transform: scaleX()` from `transform-origin: left`.
  - `home-tile-err`, `home-tile-err-hero`, `mc-shift-pulse-soft` (box-shadow) →
    a pre-rendered shadow/border on a `::before`/`::after` faded with `opacity`
    (never animate `box-shadow` directly).
  - `mc-feed-sweep` (left) → `transform: translateX()`.
  - `floor-pan`, `mc-hud-drift`, `mc-hud-marquee` (background-position) →
    either transform on an over-sized layer `translate`, or **freeze under
    reduced/off** (preferred for "super clean" — these are ambient and can be
    static).
  - `mc-hud-beam`, `sub-flow`, `link-dash` (stroke-dashoffset) → keep but ensure
    `will-change: transform` on the SVG is NOT set (dashoffset on small SVG
    strokes is acceptable if the element is small); gate the bigger sweeps behind
    motion `full`.
- `box-shadow` on hover/focus (one-shot) is fine; **looping** box-shadow is not.
- `backdrop-filter: blur` is allowed on **static, non-moving** panels only (the
  "glass"). Never on an element that is itself animated or that scrolls over a
  large animated backdrop. Keep blur radius small (2–8px) and the glass tint from
  Section 2. On `reduced`/`off` you may drop the blur to save paint.
- Add `will-change: transform` only to elements that actually animate on the
  compositor (the rain canvas container, animated cards). Don't sprinkle it.
- Respect `@media (prefers-reduced-motion: reduce)` AND the in-app motion
  setting as a union (if either says reduce, freeze ambient motion).
- Verify with a real build; watch for any route that animates layout (width/
  height/top/left/margin) in a loop.

---

## 6. LANE BOUNDARIES & CONFLICT RULES (how parallel lanes coexist)

- **V0 (foundation)** owns: `lib/tokens.ts`, `lib/theme.ts`, `app/layout.tsx`
  (fonts + root classes), `components/Shell.tsx` (unmount particles, atmosphere
  hooks), `public/rain.js`, `app/globals.css` tokens/vars/atmosphere/120hz
  base, and the semantic color sanity. V0 is the **only** lane that edits
  `globals.css` tokens and the base atmosphere.
- **V1 / V2 / V3 (tab sweeps)** must **NOT** edit `lib/tokens.ts`, `lib/theme.ts`,
  the base atmosphere, or any *existing* rule in `globals.css`. Each lane creates
  and imports **its own** stylesheet to stay conflict-free:
  - V1 → `app/vf/v1-lane.css`  (imported by the components/pages V1 touches)
  - V2 → `app/vf/v2-lane.css`
  - V3 → `app/vf/v3-lane.css`
  Lanes may add leaf-component TSX changes within their own file list. Any new
  CSS goes in the lane's own file, using the palette via the `--mc-*` var names
  from Section 2 (V0 guarantees those exist).
- Lane tab coverage (each lane audits EVERY route in its slice and fixes "anything
  that looks odd"):
  - **V1 — Command/Comms:** `/` (home command deck), `/chat`, `/calendar`.
  - **V2 — Delivery/Build:** `/pipeline`, `/kanban`, `/projects`, `/costs`, `/github`.
  - **V3 — Team/Content/Setup:** `/team`, `/memory`, `/content-creation`,
    `/ml-content`, `/setup`, `/styleguide` (styleguide should also be updated to
    reflect the new palette/tokens/fonts so it stays the source of truth).
- **Shared file guard:** if a lane discovers it must touch a shared file outside
  its scope, it does NOT edit it — it reports the needed change in its summary
  and jarvis applies it on master. This keeps the three parallel branches
  merge-clean.

---

## 7. VERIFICATION GATE (applies to EVERY lane)

Before a lane signs off (and before jarvis merges):
1. `npm run build` → clean (exit 0).
2. `npm test` → all green (was 188/188). No new failures.
3. Live check on the affected routes: `curl` the route for HTTP 200, and a visual
   sanity (no magenta anywhere brand-related, rain is blue, grid visible, text
   high-contrast, no overlapping atmosphere, JP accent present where specified).
4. No regressions: the chat SSE path (start→heartbeat→done) still works; stage A–D
   chat features intact.
5. Per lane: paste the exact `git show --stat <commit>` output + build/test tail
   into the summary. **Never `git add .`** — commit only the lane's listed files;
   leave the pre-existing unrelated dirty diff (costs/hermes-usage/PipelineBoard/
   BurnLandscape/system-health) untouched.

The pre-existing dirty working tree (costs feature: `lib/collectors/costs.ts`,
`lib/collectors/hermes-usage.ts`, `components/PipelineBoard.tsx`,
`components/views/BurnLandscape.tsx`, `lib/system-health.ts`, and the `+29` in
`app/globals.css`) is a **separate** feature — every lane keeps it isolated and
does not commit it.
