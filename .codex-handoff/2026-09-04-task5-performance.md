# Task 5 — Performance hardening for Mission Control

Repo: /home/mp/Documents/mission-control — commit on main when done, do NOT push.

## Goal
Make MC load faster and render cheaper, with real numbers. **Measure first, optimize, re-measure.** The report is as important as the changes: before→after timing and JS payloads.

## Step 1 — Baseline (do this before changing anything)
1. `npm run build` — record the per-route "First Load JS" table from the build output.
2. Start the prod server (`npm run start`, or however this repo starts in prod mode) on a free port.
3. Time it: `curl -o /dev/null -s -w '%{time_total}\n'` — 5 warm hits each against `/`, `/costs`, `/kanban`; report the **median** per route.
4. Note the shell's shared-chunk JS size (the size every route pays regardless of view).
Save the baseline numbers in your report.

## Step 2 — Changes (data-driven: inspect the build output first, then apply)
1. **Lazy-load the heavyweight views.** Identify the largest view modules in the build output (CostsPanel, KanbanBoard, BotsPanel, anything canvas/WebGL). Wrap the shell's references in `next/dynamic`:
   - `ssr: false` ONLY for canvas/WebGL/mouse-driven components (double-mount in SSR would break canvas state).
   - Everything else stays SSR with a `loading` skeleton — the repo already has a themed `loading.tsx` from earlier passes; reuse its visual language for skeleton states.
   - Result: the initial shell must not ship five full view modules' JS.
2. **Cache the hot collectors.** High-frequency API routes (telemetry, system stats, anything polled every few seconds by the UI) recompute on every request. Add a small in-memory TTL cache inside the collector layer (not per-route):
   - 5-second TTL, stale-while-revalidate: serve cached value instantly after TTL while refreshing in the background; at most one in-flight refresh (no stampede).
   - Collector modules are server-side only — plain module-level state is fine. Must reset cleanly under `tsx` dev mode (no cross-request leaks into a second dev server instance is acceptable; keep it simple).
   - Response shapes UNCHANGED — UI must not need any edit.
3. **Asset/font hygiene.** Verify fonts are self-hosted (no Google Fonts network round-trip), preloaded if used in the shell. Fix only what's actually shipping weight; no new dependencies.
4. **No visual regression.** Each lazy-loaded route must look identical once loaded; the skeleton may flash for a moment. Do not restyle anything.

## Step 3 — Verify
- `npx tsc --noEmit` clean; `npm run build` clean.
- Re-run the baseline timing block + First Load JS table. Report before→after for `/`, `/costs`, `/kanban`, the shell JS delta in KB, and one sentence on what the lazy split bought.
- Screenshot `/` after the prod server fully loads (no skeleton visible in the shot).
- Stop the server when done (free the port).

## Commit
Single commit on main: `perf: lazy-load heavy views and cache hot collectors`
Do NOT push. Report: files changed, tsc/build status, full before→after table, screenshot path, commit sha.
