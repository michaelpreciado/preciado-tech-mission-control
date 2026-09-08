# CORE-NAV FIX-LANE BRIEF (2026-09-05)

You are in a dedicated fix worktree built from base `1086ac1` + the CORE-NAV diff (Shell.tsx / globals.css / setup/page.tsx modified; CoreOrb.tsx / lib/orb-state.ts / tests/orb-state.test.mjs untracked). The prior codex reviewer (gpt-5.6-sol, read-only) returned **request_changes** with exactly two findings. Fix ONLY these two. Do not redesign anything else.

## Finding 1 (P1): Mobile dock clipping of the Home control
The mobile Home visual is a non-shrinking 44px flex item (`app/globals.css` ~6565) inside a column that also contains a 10px label, 3px gap and 12px vertical padding (`app/globals.css` ~1917-1929, ~1961-1964). That needs >= 69px while the dock item is 56px (52px on small phones) and the dock clips vertical overflow (~1887, ~1905-1906, ~2066-2067). The orb/label clips or overlaps at target mobile sizes.
Fix: clamp the mobile Home control so visual + label fit the dock at BOTH 390px-wide (52px dock) and 700px-wide (56px dock). Acceptable approaches (your call, pick the cleanest): shrink the orb container to a min that fits (e.g. 32-36px) with `flex: 0 1 auto`, reduce/inline the label, or drop the vertical padding for that item. Keep the 1440px desktop 64px control and the 821-980px compact-rail 48px control untouched.

## Finding 2 (P1): Setup reorder down-button boundary uses unfiltered length
In `app/setup/page.tsx` (~line 354, ~373) the Home tab is filtered only inside the render loop, but the down-button enabled/disabled boundary still compares against the unfiltered `tabs.length`, so the last visible Overview tab gets an enabled no-op Down button. Compute the filtered tab list (or its length) once and use it for the boundary. Keep existing behavior for all other tabs.

## Gates (all must pass)
1. `npm test` — existing 214 + any new tests you add for the Setup boundary.
2. `npm run build` — green.
3. `npx tsc --noEmit` — the reviewer noted R3F JSX/Canvas type errors in this node_modules env even on HEAD; check whether it fails identically on the base diff BEFORE your changes (record the baseline) and that your changes add no new errors. Do NOT chase pre-existing env type errors.
4. Geometry probes: start THIS worktree's dev/preview server on port 4178 (NEVER 4176 — live service; 4179 as spare) and verify:
   - 1440px desktop: 64px Home control, focus ring unclipped, exactly one Home link, `aria-current="page"` only at `/`.
   - 821-980px: 48px control contained by the 64px rail.
   - 700px and 390px: Home cell fully inside its dock (56 / 52px), no clipping, five-cell order Kanban / Chat / Home / Bots / More preserved.
   Kill the server when done.
5. `text-shadow` occurrences in globals.css must remain 24.

## Commit
When all gates pass, commit in THIS worktree on branch `core-nav-fix` (create it from your current state):
`[CORE-NAV-FIX] clamp mobile home control in dock; filtered setup reorder boundary`

## Output
Write the full report to the output-last-message file and print it: per-finding (what/where), gate results (baseline vs after), commit sha, and any residual risk.
