# Mission Control — Re-integrate burn-trend sparkline onto the new FAIR-USE GUARD (T9b reconciliation)

Repo: ~/Documents/mission-control. Branch: main, HEAD must be 09bb9a4. Node 24 + pnpm + npm available.
Do all work in the repo itself (main tree), NOT in a git worktree. Use workspace-write style edits only; touch nothing under data/.

## Goal
A previous commit `6c7f4fe` ("visual: burn-trend sparkline under in-plan band") added a `BurnTrendSparkline`
component plus `cp-plan-band` CSS. That commit has NOT been merged: its UI was the old plan-usage band, and
commit 09bb9a4 replaced that with the new `FAIR-USE GUARD` section in `components/views/CostsPanel.tsx`
function `FairUseGuard` (uses `billing.fairUse.codexTokens` ceiling, burn, percent, tone, verdict, and a
7-DAY CADENCE tick column). Your job: port the sparkline visual INTO the new guard so the dashboard keeps the
burn-trend trend line, without dropping anything from 09bb9a4.

## Steps
1. Re-read `git show 6c7f4fe` in full. Study `BurnTrendSparkline` and `sparkline()` and anything it renders
   and its `cp-plan-band*` CSS from `app/globals.css`.
2. In `FairUseGuard` in `components/views/CostsPanel.tsx`, integrate the sparkline UNDER the new
   plan-band/track, above the verdict/hint line, and rewire its inputs to the new data shape (single Codex
   daily cadence from `costs.codexUsage?.daily`, not the old claude/codex dual inputs). Use the new `tone`.
   Keep the existing 7-DAY CADENCE ticks and every line from 09bb9a4 (do NOT revert to the old
   `fairUseMonthlyTokens` config key or old `burnTone`). Keep the existing accessible `role="img"` labels;
   update aria-labels to reference the estimated-ceiling wording already in 09bb9a4.
3. Keep/restore `cp-plan-band*` CSS in `app/globals.css` only if the integrated sparkline needs it; keep it
   consistent with the guard's palette (teal/amber/red 70/90 thresholds).
4. Verify: `npx tsc --noEmit` MUST pass. `npm run build` MUST pass. Turbopack may OOM in sandboxed
   workspace-write — if the build worker crashes, retry once. Do not weaken the UI.
5. Screenshot `http://127.0.0.1:4139/costs` after `npm run dev -- --port 4139` once it is up: desktop
   1440x900 and mobile 390x844, PNGs to `.codex-handoff/artifacts/2026-09-05-fairuse-sparkline.png` (desktop)
   and `.codex-handoff/artifacts/2026-09-05-fairuse-sparkline-mobile.png`. Confirm the FAIR-USE GUARD renders
   with band, verdict, ticks AND the new sparkline. STOP the dev server before you finish.
6. Commit ONE commit on main (do not push) with a message ending `(kanban T9b sparkline reconcile 09-05)`.
   The commit must include all source + CSS changes needed.

## Done means
- tsc + build pass,
- fair-use guard section shows: burn of ceiling, colored band, verdict, 7-day ticks, and the new sparkline,
- desktop + mobile screenshots saved,
- exactly one new commit on main (child of 09bb9a4), not pushed.
