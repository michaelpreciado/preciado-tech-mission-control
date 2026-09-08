# CORE-NAV — performance & 120fps audit (top model: gpt-5.6-sol)

Base: worktree `/tmp/t_fce0e253-codex-lane` at `1086ac1` plus the built CORE-NAV diff
(Shell.tsx / globals.css / setup page / untracked CoreOrb.tsx, lib/orb-state.ts, tests).
**Read-only pass** — do NOT modify source files. You may run tests, builds, and the
Playwright scripts already in the repo to gather numbers; report findings.

## Context
The orb is the JARVIS energy core: idle/active/surge/hot state machine fed by
useLiveData + /api/events SSE + /api/telemetry poll. Product targets:
120fps-class smoothness when visible, zero battery drain when hidden/tab-locked,
no layout thrash from telemetry, reduced-motion respect, WebGL-loss graceful fallback.

## Audit scope
1. **r3f frameloop discipline** — confirm demand-vs-always logic: hidden orb
   (coreOrb:false, other routes, document.hidden) must not spin the RAF loop.
   Find the exact code path; flag any mode where the loop runs while invisible.
2. **Render cost** — 192 particles + sphere + ring: estimate draw calls and
   per-frame CPU; check dpr clamp (1–1.5) is actually applied; check `powerPreference:
   'high-performance'`; flag allocations in onFrame (per-frame Vector3/BufferAttribute churn).
3. **State-machine re-render cost** — deriveOrbState consumers: does telemetry
   polling (5–10s) create new object identity that re-renders Shell on every poll?
   Confirm memoization granularity (HomeControl vs full Shell vs LiveDataProvider).
4. **SSE + polling interaction** — /api/events events that flip orb state: any
   burst pattern (e.g. kanban heartbeats every 60s) causing surge-state churn or
   canvas re-layout? Quantify from lib/host-metrics.ts + LiveDataProvider.
5. **Thermal coupling** — hot-state (cpuTempC>=80 / GPU>=85) triggers a glow change:
   confirm that's a uniform/material change, NOT a geometry rebuild or React remount.
6. **WebGL failure path** — context loss / no-WebGL: fallback glyph mounts without
   an error overlay, no retry storm.
7. **Mobile dock** — the 52–56px orb inside the dock cell: any compositor layer
   explosion (backdrop-filter/blur near the canvas), will-change usage, or
   forced sync layout on dock press.

## Verification you may run (advisory)
- `npm test` (214 expected)
- `npm run build`
- Playwright at 1440/900/700/390 on a scratch port (4178/4179) — measure:
  frame time via CDP Performance metrics if the existing verify scripts expose it;
  otherwise report canvas RAF activity counts across a 10s window per width.

## Output
Write the full audit to `/tmp/codex-core-nav-perf-last.md` (same message you return):
ranked findings P0/P1/P2, each with file:line, one-line fix, and effort (S/M/L).
End with a 3-bullet "fix lane scope" recommendation sized for one follow-up codex pass.
No source edits. No commits.
