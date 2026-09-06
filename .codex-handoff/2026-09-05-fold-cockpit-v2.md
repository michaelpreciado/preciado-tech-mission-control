# HMK-FIX-2 V2 — Fold cockpit: single-strip balance (Codex brief)

Date: 2026-09-05 · Repo: /home/mp/Documents/mission-control (branch main) · File: `app/globals.css` ONLY
Prior work: HMK-FIX-2 V1 (committed) added a 561–767px media band that tightened the two-row cockpit. It is NOT sufficient.

## Problem (measured today against live build, Playwright, Chromium headless)

V1 fold band = two visual rows:
- Brand row: full-width band (x16→x690 at 700px), ~27px tall, text reads as centered on a floating white strip.
- Chip row: 6 stats bunched LEFT (x53→x434 at 700px), 26px tall.
- Refresh 40px button stuck alone mid-right (~x439), with a dead zone from ~x440 to x690 (≈250px of empty cockpit).
- 700px cockpit = 101px tall. Vision read: "floating white band + left-bunched stats + disconnected refresh = unbalanced, not eye-pleasing."
- Band is also non-uniform: at 600px cockpit stays 109px tall (row tightening not applying), 673–767px = 101px. Step change inside the band.

The user saw exactly this on his Pixel fold (800×344 cockpit crop) and asked for it to "fit perfectly" and "look eye-pleasing."

## Target: mirror the DESKTOP cockpit (≥768px) as a single strip at 561–767px

Inspect `components/CommandHeader.tsx` and the ≥768px desktop CSS block first — replicate that visual contract at fold widths:
1. ONE visual row. Brand left (starts at left padding, left-aligned, NOT stretched into a full-width centered band).
2. Stats right-aligned as a group on the same row (like desktop), ending at the right padding.
3. Refresh button inline at the tail of the stats group (or per desktop placement) — never orphaned mid-canvas.
4. LIVE badge top-right per desktop placement.
5. No dead zone: the only permitted large gap is the intended space-between margin between brand group and stats group. No empty region > 16px adjacent to elements inside the cockpit.

## Acceptance gates (must ALL pass; measure with Playwright and save evidence)

1. At w=700: cockpit height ≤ 84px (aim 56–76). Brand rect and stats rect vertically overlapping (same visual row: |brandCenterY − statsCenterY| ≤ 8).
2. Band uniformity: cockpit height at 561/600/623/673/700/720/767 must be monotonic or constant (no step > 8px between adjacent widths).
3. No overlap: pair-wise intersection area of (brand, stats chips, refresh btn, badge) = 0 at all 7 widths.
4. No horizontal overflow: document.scrollWidth == window.innerWidth at all 7 widths.
5. Phones frozen: 360px and 390px geometry byte-identical to current committed state (capture before/after rects; any diff > 1px = fail). Desktop ≥768px untouched.
6. Glow budget: `text-shadow` declaration count in `app/globals.css` = exactly 23.
7. `npm run typecheck` clean; `npm test` 206/206.

## Evidence to leave behind

- Screenshots: `.codex-handoff/artifacts/fold-v2-673.png`, `fold-v2-700.png`, `fold-v2-767.png` (full page, 300px+ tall).
- JSON: `.codex-handoff/artifacts/fold-v2-geometry.json` with per-width cockpit/brand/stats/refresh/badge rects + hscroll + overlap counts.

## Hard constraints

- CSS-only change in `app/globals.css`. Do NOT edit TSX.
- Do NOT run `npm run build` (dispatcher rebuilds).
- Do NOT touch system/user services (`systemctl`) — dispatcher restarts.
- Do NOT commit (git index is read-only for you) — dispatcher commits.
- Keep the HMK-FIX-2 comment block updated to describe V2 so the next agent has truth.
