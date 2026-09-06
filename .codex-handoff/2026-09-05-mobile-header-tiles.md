# HMK-FIX: mobile cockpit header overlap + tile label single-line flow

Repo: /home/mp/Documents/mission-control (main tree @ efc74c9 — work directly on main, commit if git allows).

## Verified facts (already probed, don't re-diagnose)

**Bug 1 — LIVE badge overlaps the stat chips on mobile (390px).**
The badge JSX lives INSIDE `.mc-stats` (CommandHeader.tsx lines 101–104). `.mc-stats` is a
horizontal scroll container on mobile (globals.css ≥2234 overflow-x:auto), so it becomes the
badge's containing block. The mobile rule at globals.css lines 2257–2265 sets
`position: absolute; grid-column: 2; grid-row: 1;` but the grid items are direct children of
`.mc-cockpit-row` — the badge is nested one level too deep, so the grid placement never applies
and the badge lands at (50,93) exactly on top of the first two stat chips (measured: chips at
x=50 w=38 and x=94 w=38; badge x=50 y=93 w=63 h=27). Desktop layout is fine today — preserve it.

**Bug 2 — tile labels wrap to 2–5 lines.**
`.mc-home-tile-label` (globals.css 4555–4558) has no nowrap. "COST · THIS MO" wraps to 5 lines
in a ~44px-wide column → its tile is 230px tall vs 70–98px neighbors. "WORKING NOW", "CRON FAILS",
"GH STREAK" wrap to 2 lines each. Labels render at HomeDeck.tsx lines 197 (hero) and 213 (tiles)
as `<span className="mc-home-tile-label">{label}</span>` inside `.mc-home-tile-mid`.

**User requirement (verbatim intent):** labels must be ONE line; text that doesn't fit should
"slowly flow off the screen" — i.e. a slow, continuous, seamless marquee of the overflowing label.
Labels that fit stay static. Also: add padding/breathing room to the mobile cockpit header.

## Changes

### 1. CommandHeader.tsx — de-nest the badge
Move the whole `<div className="mc-live-badge" ...>` block (lines 101–104) OUT of `.mc-stats`
so it is a direct child of `.mc-cockpit-row`, placed immediately AFTER the `.mc-stats` div.
Keep the refresh Button where it is. Keep data-state, LED class, and LIVE/STALE/OFFLINE logic
byte-identical. Resulting desktop order will be: brand, stat chips, LIVE badge, (warn chip).
That is acceptable — verify desktop visually and keep it clean.

### 2. globals.css — mobile cockpit (the @media (max-width: 820px) block starting line 2217)
- Lines 2257–2265: replace the badge rule. New rule:
  `position: static; grid-column: 2; grid-row: 1; justify-self: end; align-self: center; padding: 4px 10px; box-sizing: border-box;`
  (drop position:absolute and max-width entirely — LIVE/STALE/OFFLINE are short).
- Lines 2218–2225 grid: `grid-template-rows: auto 40px;` and `row-gap: 10px;` (was 32px/40px, row-gap 0).

### 3. globals.css — cockpit breathing room
- In @media (max-width: 520px) at line 2055: change `.mc-cockpit { padding: 10px; }` to
  `padding: 14px 16px;`. Also the media block containing line 1991 sets padding 12px 14px — bump
  to 14px 16px so the cascade is consistent.
- Do NOT touch `.mc-stats` scroll behavior, chip sizes, or the ≤360px block.

### 4. globals.css — tile labels: nowrap + slow flow marquee
Replace the label block (4554–4559) treatment with:

```css
.mc-home-tile-mid { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.mc-home-tile-label {
  font-size: 9px; letter-spacing: 0.18em; color: var(--pt-text-mute);
  text-transform: uppercase; font-weight: 600;
  display: block; overflow: hidden; white-space: nowrap;
}
.mc-tile-label-track { display: inline-block; white-space: nowrap; will-change: transform; }
/* Per-copy padding (not sibling margin) so the two copies are equidistant and
   translateX(-50%) is exactly one full cycle → seamless. */
.mc-tile-label-track > span { display: inline-block; padding-right: 28px; }
.mc-home-tile-label.is-flowing .mc-tile-label-track {
  animation: mc-label-flow 14s linear infinite;
}
@keyframes mc-label-flow { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) {
  .mc-home-tile-label.is-flowing .mc-tile-label-track {
    animation: none;
  }
  .mc-home-tile-label.is-flowing .mc-tile-label-track > span:last-child { display: none; }
  .mc-home-tile-label { text-overflow: ellipsis; }
}
.mc-home-tile-sub { font-size: 10px; color: var(--pt-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```
The duplicate span is the second half of the 50%-width track, so translateX(-50%) is one full
cycle → seamless loop.

### 5. HomeDeck.tsx — track markup + overflow detection
In BOTH label render sites (hero line 197 and tiles line 213) render:

```tsx
<span className="mc-home-tile-label" title={t.label}>
  <span className="mc-tile-label-track">
    <span>{t.label}</span>
    <span aria-hidden="true">{t.label}</span>
  </span>
</span>
```

Then, IN THE `StatusTiles` COMPONENT (HomeDeck.tsx, starts line 128 — it renders the hero tile
AND the grid, so both label sites live under it) add ONE useEffect that:
- queries all `.mc-home-tile-label`, and for each: read the first copy
  (`label.querySelector('.mc-tile-label-track > span')`), set the `is-flowing` class on the
  label when `firstCopy.scrollWidth + 28 > label.clientWidth` (text + one gap exceeds the
  column), remove it otherwise;
- re-runs on window resize (debounce ~150ms) and once more at ~1.2s (labels are mid entrance
  animation for ~320ms + i*32ms — measure again after it settles).
Keep it dependency-free (no new packages). No SSR markup split issue: the `is-flowing` class is
added post-mount only, so no hydration mismatch. Do not add the track markup anywhere else.

## Non-negotiables
- Do NOT add or remove any of the 23 permitted text-shadow rules (glow budget is frozen).
- Do NOT touch lib/tokens.ts, the `#febc2e` stale-badge color (globals.css ~line 1126),
  .mc-stats chip sizing, or anything outside the files listed.
- Do NOT use `npx playwright` — the test suite is `npm test` (node --test, currently 206/206).
- Test command: `npm test`. Typecheck: `npm run typecheck`.

## Acceptance — verify ALL with a headless browser at 390x844 and 1440x900 against http://127.0.0.1:4176/ (dev server NOT running — use `npx next build && (npm run start)` only if you need a browser; otherwise verify by `npm run typecheck` + `npm test` + code review of the geometry math)
1. 390px: the LIVE badge is in row 1 (y < 90), right-aligned (x + width <= 374), and does NOT
   intersect any `.mc-stat` bounding box by more than 2px on both axes.
2. 390px + 1440px: every `.mc-home-tile-label` renders on exactly one line (offsetHeight <= 14).
   The "COST · THIS MONTH" tile total height is <= 120px.
3. Labels that overflow their column carry `is-flowing`; fitting labels do not.
4. `npm run typecheck` clean. `npm test` 206/206.
5. Desktop header: brand left, chips, then LIVE badge, refresh — visually coherent (same spirit
   as before, just badge as row-level sibling).

When done, commit on main with message:
`[HMK-FIX] mobile header badge overlap + tile label single-line slow flow`
If git refuses the commit (read-only index), leave changes uncommitted and say so explicitly.
