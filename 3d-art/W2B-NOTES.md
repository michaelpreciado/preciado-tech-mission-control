# W2-B — CoreOrb reactor

## Silhouette

`components/threed/reactor-core.ts` builds a twelve-sided, thick beveled housing around a recessed faceted emissive core, a raised aperture lip, and six broad radial fins. The original center scale (0.82), camera, torus, shell points, DOM brand mark, and CSS glow are retained. The silhouette is designed around broad forms for 40–120px navigation; there are no screws, fine grooves, textures, or other >200px-only details to gate. No GLB, lights, postprocessing, additional Canvas, or animation loop.

All parts merge into one non-indexed BufferGeometry with no material groups (380 triangles). A per-vertex `aEmission` attribute distinguishes the dark housing, brighter aperture, fins, and energy core without extra materials. Bevel normals provide directional shading, with the original rim and facet/flicker idea retained. Temporary geometry is disposed immediately after merging; the final geometry and material each have explicit effect cleanup. Existing point-geometry disposal and R3F ownership of torus/point materials remain unchanged.

## Preserved behavior map

- `CoreOrb`: mounted gate, coreOrb setting, mutually exclusive desktop/mobile placement at 820px. Disabled coreOrb still returns null, including no poster.
- `OrbRuntime`: activity refs, host sample, previous state, hot cooldown hysteresis, load normalization, surge intensity normalization, 0.01 update threshold and intensity cap are unchanged.
- Telemetry: 8-second polling, 1-second evaluation, activity-driven evaluation, no-store fetch, aborts on replacement/hide/unmount, visibility-driven timer stop/restart and immediate poll, non-abort error handling all unchanged.
- State color: CSS `--pt-neon` or ACCENT_DEFAULT; hot uses SEMANTIC.error. Same 1.5-second hot / 3-second cool color lerp; static motion copies the target immediately.
- The exact same uniform object is passed into the new material. `uColor` receives the existing interpolated color. `uIntensity` receives the existing base plus pulse strength. `uTime` receives elapsed time or zero for static motion. `uFlicker` remains 7 for surge and 0 otherwise. All reactor surfaces consume those values.
- Pulse: idle 1/6 Hz, active 0.55 Hz, hot 1 Hz, surge 0.8 + intensity * 0.45 Hz; bases 0.52/0.74/0.82 and pulse amplitudes/intensity weighting unchanged.
- Torus: original geometry, tilt, scale, additive material, rotation speeds, state color and strength-driven opacity unchanged.
- Shell: exactly 192 deterministic golden-angle points; geometry, scale, point size, rotation speeds, state color and idle/other opacity unchanged.
- Motion: OS reduced motion and settings reduced/off use demand rendering; hidden page uses demand rendering; static ring/point rotations stop. Existing visual-change invalidation remains. No new invalidation or frame allocations.
- Canvas: DPR [1, 1.5], alpha/antialias/power preference, camera distance selection, remount key, and pointer-events unchanged.
- Surrounding orbit gates: 900px viewport, noncompact density, coreOrb/pipeline settings and PipelineKanbanFit usage unchanged.
- WebGL detection cache, error boundary, and module-level session failure latch unchanged. Failure now displays the static poster rather than an empty center. Subsequent mounts honor the same latch and avoid Canvas.

## Draw-call budget

| Surface | Before | After |
| --- | ---: | ---: |
| Center | 1 | 1 |
| Torus + 192 shell points | 2 | 2 |
| Kanban ring at full occupancy | ≤4 | ≤4 |
| Pipeline at full occupancy | ≤6 | ≤6 |
| Total | ≤13 | ≤13 |

These are source-level counts, consistent with the recon estimate, not a GPU capture. Center uses one FrontSide ShaderMaterial and a geometry without groups, so merging adds no draws or transparent double-sided pass. Poster costs zero WebGL draws. Instance caps are unchanged.

## Poster

Run `node scripts/generate-reactor-poster.mjs` to deterministically regenerate `public/visuals/reactor-core-poster.svg` without canvas or external dependencies. It depicts the same polygonal housing, aperture, six fins and cyan energy center on transparency. CoreOrb uses it when WebGL is unavailable or the existing error boundary sets the failure latch. It is decorative (empty alt inside aria-hidden parent), non-draggable, and noninteractive; the existing brand mark and CSS glow remain above/around it. The poster is intentionally static cyan; the existing hot-state DOM glow/mark still respond to state.

## Validation

- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Warnings: workspace lockfile/root inference, deprecated middleware convention, broad NFT trace via existing conversation-actions/next.config, experimental SQLite.
- Existing `tests/orb-state.test.mjs`: 8/8 passed.
- Direct geometry/material assertions: finite attributes, 380 triangles, zero groups, shared telemetry uniform identity, FrontSide material, geometry/material disposal events all passed.
- Reviewed CoreOrb diff to confirm runtime/state/frame logic and torus/points markup are unchanged.
- Browser screenshots, actual GPU draw-call capture and device-size visual inspection were not performed.

Protected components (PipelineOrbit, OrbitalKanbanRing, NeuralUplink, HomeDeck) and API routes were not edited.
