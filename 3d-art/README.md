# A2 — Mission Control art set

Preview: `/threed-preview` (local verification server: http://localhost:4182/threed-preview).
The route is a server component importing the client `ThreedPreview` gallery.
Only new files were added; no packages, existing components, or application configuration changed.

## Components

```tsx
import { ArtOrb } from '@/components/threed/ArtOrb'
import { ArtButton3D } from '@/components/threed/ArtButton3D'
import { ArtContainer } from '@/components/threed/ArtContainer'
import { ArtOrbCarousel } from '@/components/threed/ArtOrbCarousel'

<ArtOrb size={300} intensity={1.25} hue={190} />
<ArtButton3D onClick={size => console.log(size)} />
<ArtContainer /> // Optional children replace the demo telemetry.
<ArtOrbCarousel count={7} highlighted={0} />
```

Copy the `components/threed` directory to reuse the art: only React and Three.js
are required. No app providers, remote assets, textures, lights, postprocessing,
or React Three Fiber are used. Hue is HSL degrees; intensity is clamped to 0–4;
carousel count is clamped to 6–8 and highlight wraps to the node range.
The carousel uses the same batched orb geometry/material factory as ArtOrb,
with a larger, brighter selected node. Blue means running, amber queued, red attention.

## Rendering

- Signature orb: one emissive shader mesh containing a faceted icosahedron, plus
  one additive line set containing the wire shell and three rotating halos.
  A procedural radial backdrop and CSS drop shadow provide a soft glow without bloom passes.
- Button row: three native accessible buttons, each with a two-call canvas.
  An extruded rounded plate and edge lines tilt/brighten on hover or focus and
  depress on pointer or keyboard input. The optional callback receives S, M, or L.
- Console: one extruded shader plate plus edge lines. Grid, corner brackets,
  rotating emblem, and scan sweep are analytic shader patterns. Real HTML
  content overlays the panel and remains readable to assistive technology.
- Carousel: all seven cores share one mesh and all shells/halos share one line
  set. Orbital translation, rotation, status tint, and breathing happen in the shader.

Each canvas has its own requestAnimationFrame loop, capped 2× pixel ratio,
ResizeObserver, and visibility-aware rendering. Reduced-motion preference freezes
ambient animation while leaving button interaction responsive. Unmount cancels
rAF, disconnects observers/listeners, disposes every geometry/material, and disposes
the renderer. Prop changes reuse the browser canvas context instead of forcibly
losing it. WebGL2 failures/context loss show an inline fallback.

The complete gallery uses six WebGL contexts and 12 draw calls; the button sample
row accounts for three contexts. The shell can add its own rendering work outside
this gallery. Draw counts are exposed on each canvas as `data-draw-calls`.

## Verification

- `npm run typecheck` passed.
- `/threed-preview` returned HTTP 200 on the local Next development server.
- Headless Chromium with SwiftShader rendered all six canvases with two draw calls
  each and no logged browser errors. Button activation, Space-key activation,
  and carousel focus changes passed; no fallback appeared after updates.
- At a 390px viewport, gallery scroll width equaled client width (no horizontal
  overflow); all canvases still rendered. Reduced-motion media preference was detected.
- `preview-desktop.png` is the captured live page, visually reviewed during development.
- `browser-checks.json` contains observed results. `check-preview.mjs` repeats the
  browser checks using Node built-ins and a Chromium CDP endpoint on port 9332.

The screenshot includes the existing application sidebar and its configured theme.
The gallery itself fixes its background to #05070d and accent to #00d4ff. It uses
2×2 cards at desktop sizes, four columns on ultrawide displays, and one column
on small displays. Telemetry figures are explicitly demo data. This is art and
interaction reference, not a task-data integration or production performance benchmark.
