# HMK-FIX-2: fold-screen cockpit polish (Pixel Fold inner display)

Repo: /home/mp/Documents/mission-control — work on main tree at 436926d.
Live service: http://127.0.0.1:4176/ (systemctl --user mission-control.service) — verify against the live site after building.

## Context
The ≤360px cohort cockpit (2-row grid: brand row + chips row) was built and verified at 390px.
A Pixel Foldable phone's UNFOLDED inner width (~673–720 CSS px, depending on device) lands in the
SAME mobile cohort (max-width: 360px rules don't apply; the base cockpit layout does) and the user
reports the header still looks "off": chips bunched left, refresh button orphaned right, big empty
gap inside the cockpit box, overall cramped/loose mix. The user asked for: padding fixes, no
cramping, "eye-pleasing".

## Verified DOM at 700px width (Playwright, 2026-09-05, live site @ 436926d)
- cockpit: 628w x 109h — 109px tall for a two-row header is too tall; content is top-heavy with a
  large empty gap below the chips row (vision-confirmed).
- stats row: chips at x=54 w=592 h=40 — chips bunch left ([A 1][> 0][0/13][7/8]) and the refresh
  button sits alone far right (x≈596), unbalanced.
- No element overlap at 700px (badgeHitsStats=false, badgeHitsBrand=false) — this pass is about
  SPACING and BALANCE, not collisions. Do not break the badge grid placement (row 2, right).
- At 390px nothing wrapped in cockpit (only the ↻ glyph, which is fine).
- docScrollW == viewportW at 660/700/768/834/1024 — no horizontal overflow today.

## Goal
Make the cockpit feel tuned for the fold-tablet band (~561–767 CSS px): same two-row grid, but
vertically compact, horizontally balanced, generously padded. Target widths: 390, 673, 720, 768
must all look intentional.

## Changes (all in app/globals.css, scoped .mc-cockpit / .mc-stats / .mc-live-badge)
1) Add a NEW media band for the fold range. The base mobile two-row cockpit currently applies
   under the small-phone block; introduce
   `@media (max-width: 767px) and (min-width: 561px) { ... }` overrides so fold widths get their
   own tuning WITHOUT changing the ≤560 phone behavior (390px must stay identical to today:
   two rows, badge row 2 right, padding 12px 14px — verify 390px geometry unchanged).
   Inside that band:
   - .mc-cockpit { padding: 10px 16px 12px; min-height: 0; } and .mc-cockpit-row { gap: 8px; }
     so the box hugs its content (kill the 109px height; target ≤ 84px at 700px).
   - .mc-stats { gap: 8px; } .mc-stat { padding: 4px 10px; } — chips keep breathing room.
2) Balance the chips row across available width in the fold band ONLY:
   - .mc-stats { justify-content: start; } stays (no fake stretching), BUT ensure the refresh
     button is not orphaned: it is the last flex child of .mc-stats today. Verify at 700px that
     chips + button + badge occupy the row without a dead gap in the middle. If the refresh
     button's flex slot leaves a mid-row hole, add `.mc-stats > .mc-btn { margin-left: auto; }`
     ONLY inside the fold band so it pins right and chips pin left with the gap between (standard
     toolbar balance) — confirm no overlap with badge at 673/720/768 before keeping it.
3) Whitespace pass in the fold band: `.mc-hero-brand { padding: 2px 0; }` if it currently floats,
   and confirm the cockpit title/subtitle (MISSION CONTROL hero) keeps ≥16px clearance below the
   cockpit box (check .mc-main padding and any hero margin at 673px).
4) Do NOT touch: the tile-label slow-flow system (436926d), the ≤360px phone rules, the desktop
   (≥768px) cockpit, the glow budget (23 text-shadow rules — must stay 23), the LIVE badge's
   grid placement or colors, any TSX markup (CSS-only fix).

## Process
- CSS-only change in app/globals.css. If you genuinely need markup to fix balance, STOP and say
  so; do not reach into TSX silently.
- Run `npm run typecheck` and `npm test` (206/206).
- Run `npm run build`.
- Restart service: `sudo systemctl --user restart mission-control.service` (via `runuser -u mp --`
  if root) OR report that the restart is pending (coordinator will do it).
  Then curl http://127.0.0.1:4176/ (expect 200).
- Commit if git allows (main tree, message: "[HMK-FIX-2] fold-screen cockpit balance + padding").
  If read-only index, leave uncommitted and report which files changed.

## Acceptance (verify with Playwright geometry, NOT vision)
At each of 390 / 673 / 700 / 720 / 768 CSS px width:
1. No element overlap in cockpit (badges/btns/chips intersection test).
2. Cockpit height ≤ 84px at fold widths; ≤ 40px vertical dead space inside the box (content
   hugging, measured: last child bottom vs box bottom ≤ 16px + padding).
3. 390px geometry identical to pre-change (brand row 1, badge row 2 right, chips row 2 left).
4. No horizontal page overflow (docScrollW == viewportW).
5. Glow budget still exactly 23 text-shadow rules.
Finish with an ACCEPTANCE section covering all 5 items with the measured numbers.
