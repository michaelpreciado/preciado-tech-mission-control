# CORE-NAV WAVE-2 — performance fixes (3x P1) — codex lane brief (2026-09-06)

You are in a dedicated codex worktree at `/home/mp/.mc-codex-lanes/core-nav-fix`,
branch `core-nav-fix`, at `9caefb2` (`[CORE-NAV-FIX]` — the shipped fix wave).
`node_modules` is hardlinked from the main tree — do NOT npm install, do NOT touch
node_modules. Main tree is `/home/mp/Documents/mission-control` (read-only for you:
do not write there).

## Context
The core orb (JARVIS energy core) is the Home button: desktop sidebar top control +
mobile dock cell. Wave-1 (shipped in `9caefb2`) fixed mobile dock clipping and the
setup reorder boundary. A read-only perf audit (gpt-5.6-sol, 2026-09-05) ranked
3x P1 + 3x P2. This wave fixes the 3 P1s. Product targets: 120fps-class smoothness
when visible, zero drain when hidden/tab-locked, no layout thrash from telemetry,
graceful WebGL-loss fallback.

Relevant code: `components/CoreOrb.tsx` (OrbScene / OrbRuntime / CoreOrb),
`lib/orb-state.ts` (pure state derivation), `components/LiveDataProvider.tsx`
(SSE + context), `components/icons.tsx`. The audit's /tmp reports were wiped by a
reboot; verify each finding against the live code before fixing — if a finding does
NOT reproduce at 9caefb2, record why and skip it rather than fixing air.

## Scope — fix ONLY these three

### P1-1: ShaderMaterial identity churn on visual updates
`CoreOrb.tsx` `OrbScene`: the core sphere uses
`<shaderMaterial args={[{ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending }]}>`.
Every time `OrbScene` re-renders (i.e. every `OrbRuntime` render triggered by
telemetry poll every 8s, the 1s state tick, and SSE activity events) a fresh args
object literal is constructed. React Three Fiber diffs `args`; a changed identity
can dispose/recreate the `ShaderMaterial` per render — GPU state churn and a re-compile
flicker, defeating the uniform-only update design (`useFrame` already writes
uColor/uIntensity/uTime/uFlicker in place).
Fix: create the `ShaderMaterial` ONCE (e.g. `useMemo(() => new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), [])`,
dispose in cleanup) and attach it stably, e.g. `<primitive object={coreMaterial} attach="material" />`,
keeping the existing `core` ref semantics (or drop the ref if the instance is stable).
`OrbScene` re-renders must now only cost React reconciliation + the existing in-place
uniform writes in `useFrame`. Confirm the ring (basic material, stable `blue` color
memo) and particle material paths do not recreate either; patch only if they churn.

### P1-2: WebGL failure not latched to the static glyph
If WebGL context creation fails (no-WebGL browser, context lost at init), the
R3F `Canvas` subtree errors unhandled. The static glyph (`.mc-core-orb-mark`) is a
sibling and renders, but the failing Canvas can throw on every remount attempt —
e.g. toggling `elements3d.coreOrb`, flipping the mobile media query, or
visibility recovery causes repeated mount attempts (retry storm) instead of a stable
fallback.
Fix: detect WebGL support ONCE (memoized
`document.createElement('canvas').getContext('webgl2') || getContext('webgl')`) and
add a small error boundary (class component or state-based) around `Canvas`. On
either failure, latch a `webglFailed` state for the session: render ONLY the glyph
(no Canvas, no error overlay), and do not retry while latched. Keep `aria-hidden` +
`pointer-events:none` on the visual subtree; the Link owner is untouched.

### P1-3: Hidden-tab timers and SSE wakeups
`OrbRuntime` keeps a 1s `stateTimer` and an 8s telemetry poll interval running while
`document.visibilityState !== 'visible'` — each tick still evaluates (and the poll
skips fetch but not the timer machinery). In addition, every SSE event through
`LiveDataProvider` changes `activity.now`, which re-triggers the
`useEffect(..., [evaluate, activity.now])` and re-renders `OrbRuntime` even hidden.
Fix:
1. While hidden: clear BOTH intervals (and do not run `evaluate()`); on return to
   visible: resume them AND run one immediate `poll()` to refresh the sample, then
   resume normal cadence. No double-fire on visible.
2. Make hidden activity events cheap: if `LiveDataProvider` consumers re-render on
   every event while the tab is hidden, gate the orb's subscription so hidden SSE
   events do not re-render `OrbRuntime` (e.g. consume orb-relevant fields via the
   existing `activityRef` without the `activity.now` dependency for the hidden case).
   Do NOT tear down the SSE connection itself — other consumers (live data views)
   need it. Verify what `LiveDataProvider` actually does per event first (read the
   file); patch minimally.

### P2s (optional stretch)
The audit also flagged 3 P2s (details lost). If (and only if) the 3 P1 fixes are
clean and you have budget: (a) confirm `dpr` clamp [1, 1.5] + `powerPreference:
'high-performance'` survive all code paths; (b) confirm hot-state is a uniform-only
change (no geometry rebuild / React remount) and add a comment if true; (c) mobile
dock: no forced sync layout on dock press (check for offsetWidth reads in handlers).
Otherwise list them as deliberately cut. No unrelated refactors.

## Gates (all must pass; report exact numbers)
1. `npm test` — baseline at 9caefb2 is green (214 tests + orb-state suite); nothing
   may fail. New tests you add for the latched fallback / hidden-tab behavior are
   welcome (node --test, plain assertions).
2. `npm run build` — green.
3. `npx tsc --noEmit` — R3F JSX/Canvas type errors exist in this node_modules env
   even on HEAD. Record the BASELINE output first (before your changes), then confirm
   your changes add NO new errors. Do not chase pre-existing env errors.
4. `grep -c 'text-shadow' app/globals.css` == 24 (this wave should not touch CSS
   unless a fix requires it; report the count).
5. Playwright probes (import playwright from
   `/home/mp/.hermes/hermes-agent/node_modules/playwright/index.mjs`,
   `TMPDIR=/home/mp/.codex-tmp`, scratch port **4178** (4179 spare) — NEVER 4176,
   that is the live mc-bridge). Run on a dev/preview server from THIS worktree:
   - 1440/821/900/980/700/390: nav geometry UNCHANGED from wave-1 (64/48px desktop
     control, 56/52px dock inner, five-cell order Kanban/Chat/Home/Bots/More, no
     horizontal scroll, aria-current only at `/`). These are regression checks —
     your wave should not move them.
   - WebGL-off run: launch chromium with `args: ['--disable-webgl']` (or
     `--disable-webgl2 --disable-webgl`) at 1440 and 390: static glyph present,
     exactly ONE orb container, no console errors from the failing canvas, and NO
     repeated mount attempts after 10s (count canvas creations / error logs).
   - Hidden-tab run (1440): after load, simulate hidden via
     `page.evaluate(() => Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }))`
     + dispatch `visibilitychange` (or chromium's Page.setWebLifeState: 'hidden' via
     CDP if simpler). Wait 30s. Assert: zero `/api/telemetry` fetches while hidden,
     and no new React renders of the orb (count via an injected `React` dev counter
     or console hook if practical; at minimum, zero network + no RAF-driven uniform
     updates are visible via the canvas state class). Then restore visible: assert
     one immediate telemetry poll fires.
   Kill your server when done.
6. You DO commit (git index is writable in this lane — exception to the wave-1 rule):
   small commit(s) on branch `core-nav-fix`:
   `[CORE-NAV-WAVE2] <one-line: material latch / no-webgl fallback / hidden-tab timers>`

## Prohibitions
No changes to `app/globals.css` text-shadow count (24), no new npm dependencies, no
dependency upgrades, no changes to `NAV`/`PINNED_TAB_IDS` canonical lists, no change
to `.mc-mobile-nav-inner` heights, no writing to the main tree at
`/home/mp/Documents/mission-control` or port 4176, no secrets access, no external
messaging, no Hermes kanban CLI calls (Hermes owns the board), no touching the
historical `.codex-handoff/*.md` files or `/tmp` scripts.

## Output (final message)
Per-finding: what/where (file:line), fix applied or why skipped (did-not-reproduce
with evidence), gate results with exact numbers (test totals, tsc baseline vs after,
text-shadow count, probe results per width + WebGL-off + hidden-tab), commit sha(s),
and anything deliberately cut (P2s).
