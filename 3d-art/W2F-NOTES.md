# W2-F brand alignment

## Placements and effects

- Login: centered 64×64 `public/brand/preciado-tech-logo.jpg` above the form fields, followed by the transparent → periwinkle → primary white → periwinkle → transparent rule.
- Existing Shell wordmark: 28×28 logo alongside the existing app name.
- HomeDeck's NeuralUplink hero: `mp.jpeg` in a circular periwinkle frame on desktop; `michael-profile.jpg` selected by `<picture>` at widths ≤820px. Both inspected: they are proper photos of Michael, with different crops; no screenshot chrome. All three supplied images are used; originals are unchanged.
- Hero retains its 220–420px height clamp. Portrait dimensions are reserved (160px desktop; 64px mobile; 48px on narrow phones), with no contribution to layout height. Mobile portrait sits at the top right and supporting copy reserves space.
- Home-only static 1px black scanline every 3px and periwinkle radial halo (55% × 60%, centered 50% 40%). Pointer events are disabled. Existing intersection/hidden-tab pause and reduced-motion controls remain intact; new effects and portrait have no animation.
- JetBrains Mono remains the font; preview now inherits the canonical mono token. No font dependency added.

## Hue replacements

All occurrences of each mapping in the listed file were replaced. Shader values are linear RGB equivalents of the brand surface/accent, because the fragment shader converts output to sRGB.

- `components/threed/ThreedPreview.tsx`: `#00d4ff` → `#9db4ec`.
- `components/threed/ThreedPreview.tsx`: `#ddf5ff` → `#f4f7fb`.
- `components/threed/ThreedPreview.tsx`: `#05070d` → `#07080b`.
- `components/threed/ThreedPreview.tsx`: `#18303f` → `rgba(157,180,236,0.16)`.
- `components/threed/ThreedPreview.tsx`: `#0c1420` → `#0b0d12`.
- `components/threed/ThreedPreview.tsx`: `#060910` → `#07080b`.
- `components/threed/ThreedPreview.tsx`: `#14222e` → `rgba(255,255,255,0.08)`.
- `components/threed/ThreedPreview.tsx`: `#789aaa` → `#99a3b2`.
- `components/threed/ThreedPreview.tsx`: `#23566a` → `rgba(157,180,236,0.35)`.
- `components/threed/ThreedPreview.tsx`: `#0a1c28` → `#0b0d12`.
- `components/threed/ThreedPreview.tsx`: `#9aefff` → `#9db4ec`.
- `components/threed/ThreedPreview.tsx`: `#7993a7` → `#99a3b2`.
- `components/threed/ThreedPreview.tsx`: `#526e80` → `#6f7886`.
- `components/threed/ThreedPreview.tsx`: `font-family:ui-monospace,SFMono-Regular,monospace` → `font-family:var(--pt-font-mono)`.
- `components/threed/ArtContainer.tsx`: `#a5d7e4` → `#c7ced8`.
- `components/threed/ArtContainer.tsx`: `#00d4ff` → `#9db4ec`.
- `components/threed/ArtContainer.tsx`: `#e0faff` → `#f4f7fb`.
- `components/threed/ArtContainer.tsx`: `#b9f4ff` → `#9db4ec`.
- `components/threed/ArtContainer.tsx`: `#164456` → `rgba(157,180,236,0.16)`.
- `components/threed/ArtButton3D.tsx`: `#c1f5ff` → `#f4f7fb`.
- `components/threed/ArtButton3D.tsx`: `#628498` → `#6f7886`.
- `components/threed/ArtButton3D.tsx`: `#6f9db0` → `#99a3b2`.
- `components/threed/ArtCanvas.tsx`: `#8cecff` → `#c7ced8`.
- `components/threed/ArtOrbCarousel.tsx`: `#003b5528` → `rgba(157,180,236,0.16)`.
- `components/threed/ArtOrb.tsx`: `hue = 190` → `hue = 222.532`.
- `components/threed/ArtOrb.tsx`: `Cyan signature orb` → `Periwinkle signature orb`.
- `components/threed/ArtOrb.tsx`: `hsl(${hue} 100% 50% / 0.35)` → `hsl(${hue} 67.521% 77.059% / 0.35)`.
- `components/threed/ArtOrb.tsx`: `#003b5540` → `rgba(157,180,236,0.25)`.
- `components/threed/orbScene.ts`: `new THREE.Color().setHSL(((node.hue % 360) + 360) % 360 / 360, .95, .58)` → `orbit
      ? new THREE.Color().setHSL(((node.hue % 360) + 360) % 360 / 360, .95, .58)
      : new THREE.Color('#9db4ec').offsetHSL((node.hue - 222.532) / 360, 0, 0)`.
- `components/threed/plateScene.ts`: `vec3(.018,.065,.11)` → `vec3(.00335,.00402,.00605)`.
- `components/threed/plateScene.ts`: `vec3(0.,.65,1.)` → `vec3(.33716,.45641,.83880)`.
- `components/threed/plateScene.ts`: `vec3(.02,.13,.22)` → `vec3(.33716,.45641,.83880)*.16`.
- `components/threed/plateScene.ts`: `#00d4ff` → `#9db4ec`.
- `public/visuals/reactor-core-poster.svg`: `#a7f2ff` → `#f4f7fb`.
- `public/visuals/reactor-core-poster.svg`: `#00d4ff` → `#9db4ec`.
- `public/visuals/reactor-core-poster.svg`: `#06313e` → `rgba(157,180,236,0.16)`.
- `public/visuals/reactor-core-poster.svg`: `#07151f` → `#0b0d12`.
- `components/NeuralUplink.module.css`: `radial-gradient(ellipse at 82% 45%, #0b3452a8, transparent 52%), linear-gradient(115deg, #07111ef5, #030910fa)` → `radial-gradient(ellipse 55% 60% at 50% 40%, rgba(157,180,236,0.16), transparent), linear-gradient(115deg, #07080b, #0b0d12)`.
- `components/NeuralUplink.module.css`: `#b1e1ff0d` → `rgba(255,255,255,0.08)`.
- `components/NeuralUplink.module.css`: `background: linear-gradient(110deg, #83d5ff12, transparent 35%)` → `background: repeating-linear-gradient(to bottom, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 3px), radial-gradient(ellipse 55% 60% at 50% 40%, rgba(157,180,236,0.16), transparent)`.
- `components/NeuralUplink.module.css`: `#63bdff20` → `rgba(157,180,236,0.125)`.
- `components/NeuralUplink.module.css`: `#739bb8` → `#99a3b2`.
- `components/NeuralUplink.module.css`: `radial-gradient(circle, #7edfff25, #108de918 35%, transparent 68%)` → `radial-gradient(circle, rgba(157,180,236,0.16), rgba(157,180,236,0.09) 35%, transparent 68%)`.
- `components/NeuralUplink.module.css`: `#1c9dff12` → `rgba(157,180,236,0.07)`.
- `components/NeuralUplink.module.css`: `#80dfff24` → `rgba(157,180,236,0.14)`.
- `components/NeuralUplink.module.css`: `#78a8c8` → `#99a3b2`.
- `components/NeuralUplink.module.css`: `#7398b4` → `#6f7886`.
- `components/NeuralUplink.module.css`: `#040d18f5` → `rgba(7,8,11,0.96)`.
- `components/NeuralUplink.module.css`: `#040d18c9` → `rgba(7,8,11,0.79)`.
- `components/NeuralUplink.module.css`: `#040d18d9` → `rgba(7,8,11,0.85)`.
- `components/NeuralUplink.module.css`: `#040d1840` → `rgba(7,8,11,0.25)`.

## Deliberately unchanged / skipped

- `reactor-core.ts`, `pipeline-probe.ts`, `task-token.ts`, `dispatch-hub.ts`, `agent-chassis.ts`, and `holo-config.ts` contain no hardcoded decorative cyan colors; they inherit uniforms/instance colors or only define geometry/configuration.
- `app/threed-preview/page.tsx` delegates to `ThreedPreview.tsx`; its styling was updated there.
- Carousel status hues (205° running, 38° queued, 2° attention) and corresponding legend colors remain semantic. Only its decorative background changed. Single signature orb defaults to periwinkle; caller hue customization remains available.
- Hero connected/standby beacon colors remain semantic.
- CoreOrb.tsx, PipelineOrbit.tsx, OrbitalKanbanRing.tsx, HoloHud3D.tsx, lib/tokens.ts, API routes, and collectors are untouched. Geometry, mesh counts, draw-call structure, shader motion, and rendering lifecycle are unchanged.
- Existing neural-reactor raster artwork and original brand JPEG colors are retained; this pass changes CSS/material colors, not source photography.
- No image placement skipped. No site-wide overlay added.

## Validation

- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS (exit 0). Non-blocking warnings: multiple-lockfile workspace-root inference, deprecated middleware convention, broad NFT tracing through the existing conversation route, and experimental SQLite.
- `git diff --check`: PASS.
- Source review confirms responsive sizing, static new effects, preserved motion gates, and untouched protected files. Browser visual verification was not run; no browser automation package/tool is installed in this worktree.
