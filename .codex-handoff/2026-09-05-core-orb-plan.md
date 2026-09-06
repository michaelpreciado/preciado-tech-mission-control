# CORE-ORB implementation plan

## Scope and file list

- `components/Shell.tsx`: dynamically import the single orb implementation and mount breakpoint-specific hosts as the first desktop-sidebar child and as an absolutely positioned mobile-dock notch.
- `components/CoreOrb.tsx` (new): own breakpoint activation, client/motion/visibility guards, the 8-second telemetry poll, and the minimal R3F scene (one sphere, one torus, one Points object) plus the low-opacity CSS brand facet.
- `components/LiveDataProvider.tsx`: expose a separate lightweight orb-activity context with the last accepted SSE timestamp, a 1 Hz expiry heartbeat only while an event is recent, and the real kanban running-task count.
- `lib/orb-state.ts` (new): pure state derivation and normalized load calculation. Priority is `hot > surge > active > idle`; hot entry is CPU >=80 C or GPU >=85 C, and hot exit requires three seconds continuously below CPU 75 C and every GPU 80 C. Activity is running/claimed count >0 or an SSE event no older than 20 seconds. Surge is CPU >70%, normalized load (`load1 / cores`) >0.75, or any GPU utilization >70%.
- `tests/orb-state.test.mjs` (new): cover null samples, idle, task/event activity, all surge inputs, hot entry, the thermal dead band, and the timed cool-down hysteresis.
- `components/HomeDeck.tsx`: remove the old Home-only WebGL globe and its now-unused setting hook; retain the CSS `CoreHalo` instrument so the four-band Home rhythm does not acquire an empty gap.
- `components/views/CoreOrb3D.tsx`: delete after its last import is removed.
- `lib/config.ts`, `components/ui-settings.tsx`, `app/api/setup/route.ts`, `app/setup/page.tsx`: replace `homeGlobe` with global `coreOrb`; config resolution inherits legacy `homeGlobe` only when `coreOrb` is absent; keep the unrelated memory/team toggles intact.
- `app/globals.css`: add one clearly labelled CORE-ORB section for 64 px desktop and 44 px mobile placement/glow, with pointer-events disabled and reduced-motion protection. Add no `text-shadow` declaration.
- `memory/2026-09-05.md`: append implementation and exact verification results.

## Rendering and performance design

- Render at most one live Canvas at a time: both chrome hosts exist for exact placement, but `matchMedia('(max-width: 820px)')` activates only the matching runtime and tears it down on breakpoint changes.
- Canvas is capped at 64x64 CSS px and DPR `[1, 1.5]`, for a maximum 9,216 backing pixels (below the roughly 15k budget). Use no postprocessing, shadows, texture loads, drei helpers, or runtime geometry allocation.
- Scene budget is exactly three draw objects: a low-poly emissive/basic sphere with a cheap Fresnel shader, a thin torus, and one `THREE.Points` object with 192 deterministic particles. The brand mark is a CSS/Icon overlay, avoiding a fourth WebGL object.
- Per-frame work mutates existing rotations/material uniforms only. State changes arrive at low frequency. Reduced motion or an app motion override uses `frameloop="demand"`; hidden tabs switch to demand and invalidate once on resume.
- Blue comes from the runtime `--pt-neon` token. The only red value comes from `SEMANTIC.error.hex`, and color interpolation targets it only in `hot`. Hot cross-fades in about 1.5 seconds and cools toward blue over about 3 seconds.

## Risks and mitigations

- Mobile notch could cover a nav icon: keep it out of flow, centered over the inter-item midpoint, and verify bounding boxes at 390 and 700 while asserting the dock inner remains exactly 52 px.
- Two mount sites could double telemetry/WebGL work: breakpoint activation ensures only one runtime, poll, and Canvas exists.
- A 1 Hz activity expiry could fan out through the main live-data context: isolate it in a sibling context so ordinary Shell consumers do not receive heartbeat updates.
- Telemetry shape/load normalization could drift: type against `HostMetrics`/`HostSample`, use `static.threads` as the available core count, and unit-test each threshold boundary.
- Setup migration could overwrite a deliberate legacy false: resolve `coreOrb` with nullish precedence (`coreOrb ?? homeGlobe ?? true`) and accept only `coreOrb` in new writes.
- Home hero removal could leave a narrow empty column: keep `CoreHalo` in its existing holder as the non-WebGL SYSTEM CORE instrument and visually/geometry-check the Home layout at all requested widths.

## Verification gates

1. Record baseline and final `grep -c 'text-shadow' app/globals.css` (baseline: 24; must remain 24).
2. Run `npm run typecheck`.
3. Run `npm test` and report total pass/fail counts.
4. Run `npm run build`.
5. If `http://127.0.0.1:4176` responds, run Playwright geometry assertions at 1440, 700, and 390 px for placement/order, nav overlap, exact mobile 52 px height, cockpit preservation, and horizontal overflow.

