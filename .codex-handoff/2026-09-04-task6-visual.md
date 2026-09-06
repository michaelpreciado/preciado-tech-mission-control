# Task 6 — Visual next-level: plan-usage bar + home HUD motion pass

Repo: you are in a git worktree of /home/mp/Documents/mission-control (source-only; no node_modules in the worktree). Commit on the current (detached) HEAD when done, do NOT push, do NOT rebase.

## Part A — "IN-PLAN BURN vs SOFT BAND" bar (components/views/CostsPanel.tsx)
Context: the cost page already shows a SUBSCRIPTION TOOLS — USE & KEEP section (Task 4) with 30-day per-tool tokens from `data.costs.billing[0]` (`claudeTokens`, `codexTokens`). Add, inside that section:
1. A horizontal bar: combined 30-day Claude+Codex burn vs a **config-driven soft band**:
   - Read `billing.fairUseMonthlyTokens` (number) — add to `data/config.json` AND the billing fallback block in `lib/config.ts`, default **200000000** (200M).
   - Fill percentage = combined/band, clamped at 100% for the bar but show the real percent in the label.
   - Color: green < 60%, amber 60–85%, red > 85% — use the existing tone/color tokens in the panel, no hex soup.
   - Label line: `~113M of a 200M soft band · 57%` style, plus a small hint `soft band: editable in data/config.json → billing.fairUseMonthlyTokens`.
2. Defensive: if `billing[0]`, either token field, or the band value is missing/invalid, render the bar section hidden — never NaN, never crash.
3. Follow the existing section/card conventions of CostsPanel exactly (heading style, card borders, spacing).

## Part B — Home HUD motion pass (components/HomeDeck.tsx + app/globals.css)
Deliberate, restrained — the depth/hierarchy pass is already done and holo was recently made opt-in. Do NOT reintroduce glass/holo/particles. Only `transform` and `opacity` animations (no layout shift), all gated for `prefers-reduced-motion: reduce` (final values instantly, no stagger).
1. **Staggered tile entry:** CSS keyframe fade+rise (4px), 32ms stagger per tile via a `--i` custom property set inline on each tile, total sequence < 400ms. Runs once on mount, not on every data refresh.
2. **Animated hero numerals:** a small `useCountUp` hook you write (~30 lines, requestAnimationFrame, 600ms, easeOutCubic) applied ONLY to the large numeric heroes on tiles (the $ total, the in-plan token count). Small labels/sparklines stay static. Re-run the tween when the value changes; reduced-motion → set final value directly.
3. **Press states:** for `pointer: fine` tiles — 80ms transition to `scale(0.985)` + subtle shadow dip on `:active`. Touch: `:active` only, no hover.
4. **Focus-visible:** one shared CSS token for the ring, applied to all interactive tiles/rows missing it. `:focus-visible` only — never on mouse click.

## Verify
- `npx tsc --noEmit` clean (if npx tsc can't run in this source-only worktree, note it and verify via the parent's toolchain instead — do not commit on a red typecheck).
- `npm run build` if feasible from this worktree; otherwise note it.
- Rendered proof: screenshot of `/costs` showing the new bar with REAL numbers (expected ~113M in-plan burn at the default 200M band), and screenshot of `/` settled (post-entry-animation).
- Confirm the reduced-motion media query exists and short-circuits the stagger/tween (grep your own diff, state it in the report).
- No new runtime dependencies.

## Commit
Single commit: `visual: plan-usage bar + home HUD motion pass`
Do NOT push. Report: files changed, tsc/build result, the exact bar label rendered, reduced-motion confirmation, screenshot paths, commit sha.
