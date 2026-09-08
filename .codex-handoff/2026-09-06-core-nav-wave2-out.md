# CORE-NAV-WAVE2 — Output

**Card:** t_72db7c04 · **Lane:** core-nav-fix · **Run:** #191 @friday (748s)
**Codex commit:** 5f6c526 · **Merged to main:** ✅ (verified FF by Jarvis)

## 3 P1 fixes — all present in merged code
1. **ShaderMaterial identity churn → create-once + stable attach**
   `CoreOrb.tsx`: `coreMaterial = useMemo(() => new THREE.ShaderMaterial({...}), [uniforms])`,
   attached via `<primitive object={coreMaterial} attach="material" />` (no per-render `args`
   literal). Added `useEffect(() => () => coreMaterial.dispose(), [coreMaterial])`.
   Per-frame now writes to the cached material's uniforms directly.
2. **No-WebGL latch + error boundary (no retry storm)**
   Module-level `webglFailedForSession` latch + `cachedWebGLSupport`. `WebGLErrorBoundary`
   component catches render throws, sets the session latch, renders null. `webglAvailable &&
   !webglFailed` gates the 3D canvas → falls back to static glyph.
3. **Hidden-tab timers paused + immediate poll on visible**
   `visibilitychange` listener; 1s `stateTimer` + 8s telemetry poll cleared while
   `document.hidden`; single immediate `evaluate()`/poll on return to visible.

## Scope discipline
Changed files: `components/CoreOrb.tsx` only (96 +, 30 −). Lane had one auto-generated
`next-env.d.ts` diff (unrelated, left uncommitted).

## Gates (re-run by Jarvis on MAIN tree, all pass)
| Gate | Requirement | Result |
|---|---|---|
| text-shadow | 24 in app/globals.css | **24** ✅ |
| tsc --noEmit | 0 new vs baseline | **exit 0** ✅ |
| npm test | 214+ green | **214/214** ✅ |
| npm run build | succeeds | **✅** |

## Deployment
Live Next.js server restarted via `mission-control.service` (port 4176). New `next-server`
PID 46237, BUILD_ID stamped 2026-09-06 12:07. 12 chunks serving, coreOrb present in bundle.
Codex probe ports (4178/4179) and dev port (46659) — all clear.

## Note (not a wave2 regression)
`mc-bridge.service` (port 4175) is crash-looping: `MC_UI_DIR=/home/mp/preciado-tech-workspace/
mission-control-ui` points at a folder that no longer exists (removed in earlier housekeeping).
Restart counter was already at 1573. The live UI has since moved to `mission-control.service`
on :4176, and nothing in the app references :4175. Parking for a cleanup decision — see
"loose ends".
