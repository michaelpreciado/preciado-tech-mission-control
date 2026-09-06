# Task 7 — Performance AUDIT (measure-first, top fix only)

Repo: /home/mp/Documents/mission-control — commit on main when done, do NOT push.

## Context
T5 already did lazy-view deferral + SWR collector cache + shell JS −8KB. The 3D
orb (components/views/CoreOrb3D.tsx) is ALREADY optimized: dpr [1,1.5],
frameloop 'demand'|'always' (motion-gated), powerPreference low-power,
antialias on. So the big 3D wins are partly taken. Do NOT re-do T5.

## Goal — honest, measured, bounded
Find and apply the ONE highest-impact real perf win that does NOT overlap T5,
proven by numbers. Do not gold-plate. If the app is already fast, say so
plainly and land only the single best fix (or none).

## Steps (in order)
1. BUILD: `npm run build` → start `npx next start -p 3112`.
2. BASELINE (before any change): use the local system chromium
   (`/usr/sbin/chromium` or `/home/mp/.local/bin/chromium-browser`) headless:
   - Lighthouse performance for `/` (headless, --only-audit, 3 runs → median).
     e.g. `npx lighthouse http://localhost:3112/ --chrome-flags="--headless --no-sandbox"
      --only-categories=performance --output=json` (install `lighthouse` via npx if absent).
   - Also capture: First Load JS for `/` (from build output), and warm page-load
     wall time (`curl` 5× / , /costs, /kanban).
   Save raw numbers to `artifacts/2026-09-05/task7-baseline.md`.
3. IDENTIFY the single largest real lever NOT already done in T5. Realistic
   candidates in priority order (pick whatever the data supports):
   - Unused/huge image assets or non-optimized `<img>` → next/asset size.
   - A heavy npm dep shipped whole (e.g. all of `three` in a view that only
     needs a slice; drei helpers pulling extra) → targeted import.
   - Long first-load CSS or a font loaded with display:block → font/preload fix.
   - A 3D Canvas running 'always' frameloop when it should be 'demand' at idle.
   - Anything Lighthouse names with a high estimated savings.
4. APPLY that ONE fix. Keep scope minimal, match existing style, no API break.
5. RE-MEASURE: same Lighthouse runs (3×) + same warm curls + shell JS.
   Save to `artifacts/2026-09-05/task7-after.md`.
6. STOP the server. `npx tsc --noEmit` must be clean.
7. Commit on main: `perf: <one-line name of the single fix>` (e.g.
   `perf: defer heavy three import in CoreOrb3D`). Do NOT push.

## Report
files changed, tsc + build status, ONE baseline number → ONE after number for
the headline metric (Lighthouse perf score and/or First Load JS), what the single
fix was and why it was the biggest lever, why you did NOT do more, screenshot not
required. If the honest answer is "already fast, minor win", that is a PASS —
report it, don't force a bigger change.

## Guardrails
- Do NOT touch what T5 did (lazy views, SWR cache in lib/collectors).
- Do NOT add animation/glass/holo (that's the visual lane).
- Do NOT push. One focused commit.
