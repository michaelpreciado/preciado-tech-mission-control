# Task 9 — Burn-trend sparkline under the IN-PLAN BURN band

Repo: you are in a git worktree of /home/mp/Documents/mission-control
(source-only, no node_modules here). Commit on the current detached HEAD with
message `visual: burn-trend sparkline under in-plan band`. Do NOT push, do NOT rebase.

## Context
T6 just added the "IN-PLAN BURN vs SOFT BAND" bar in components/views/CostsPanel.tsx
(around line 784-830). It shows the trailing 30-day combined Claude+Codex token
burn as a single number + a horizontal fill vs a 200M soft band. That's a scalar.
Now add a small TREND so you can SEE the shape of the burn over the window, not
just the total.

## Data you already have (do not add collectors)
- `billing[0]` → the current month row; has `claudeTokens` and `codexTokens`.
- `costs.claudeUsage.daily` → `[{ date, tokens, byModel }][]` (calendar window).
- `costs.codexUsage.daily`  → `[{ date, tokens }][]` (calendar window).
  Both arrays are aligned to the same trailing calendar-day window. Combine them
  per-day (sum tokens for the same `date`) to get one per-day Claude+Codex burn
  series. If a day is missing in one tool, treat that tool's tokens as 0 that day.

## What to build (only in CostsPanel.tsx + a tiny local helper if needed)
- Directly UNDER the existing band bar, add a compact sparkline (~36-48px tall,
  full width of the band card) plotting the per-day combined burn across the
  window. Style it in the existing visual language (the same tone/accent tokens
  the band uses — do NOT introduce a new palette, glass, or holo). Prefer a
  simple inline SVG polyline/area (no new chart dependency). A faint area fill
  under the line is fine. Mark the latest day with a small dot.
- Keep it accessible: `role="img"` + a concise `aria-label` summarizing
  (e.g. "Last {N} days combined Claude+Codex burn, trending up/flat/down, peak {X} on {date}").
- Guard for zero data: if the combined series is all zeros / empty, render nothing
  (or a muted "no usage yet" caption), never a broken/NaN SVG.
- Motion: if the app uses a mount animation, gate it with the SAME
  `prefers-reduced-motion` handling the rest of CostsPanel uses; transform/opacity
  only. Do not animate in reduced-motion.

## Verify
- Types: if `npx tsc` can't resolve in this source-only worktree, typecheck using
  the parent toolchain at /home/mp/Documents/mission-control (shared node_modules)
  pointed at the worktree. Do NOT commit on a red typecheck.
- Confirm the sparkline renders with your LIVE data (open /costs, screenshot the
  band + sparkline region → save as `artifacts-2026-09-05-task9-sparkline.png`).
  Confirm the daily series lines up (spot-check peak day vs the daily arrays).
- Confirm reduced-motion path (no motion when gated).

## Report
files changed, tsc/build result, the exact aria-label rendered, peak day + value
you spot-checked, reduced-motion confirmation, screenshot path, commit sha.

## Guardrails
- Only touch CostsPanel.tsx (+ a local helper file if truly needed). No new deps.
- Match existing card/section conventions. No glass/holo/particles.
- Commit on the detached HEAD, do NOT rebase, do NOT push.
