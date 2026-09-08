# W2-A — Home hero

Mounted the existing NeuralUplink as HomeDeck's first element, above the existing urgent strip, chat, tasks, and system sections. Their components and data logic are unchanged. `app/page.tsx` remains unchanged: AsciiWordmark precedes HomeDeck.

## Files

- `components/HomeDeck.tsx`: direct import and lead mount; updated reading-order comment. The existing client boundary supports the effect without a dynamic import or delayed placeholder.
- `components/NeuralUplink.module.css`: reserved border-box height `clamp(220px, 32vw, 420px)`, larger desktop title, existing mc-* ink/neon/glass tokens for title and telemetry CTA overlay. Single-column layout through 820px keeps content within the hero at narrow widths.
- `components/NeuralUplink.tsx`: image sizes hint updated to HomeDeck's 1180px maximum. Existing telemetry, links, IntersectionObserver, visibilitychange handler, and cleanup are unchanged.
- `3d-art/W2A-NOTES.md`: implementation and validation record.

## Asset and rendering decisions

Read both NeuralUplink source files fully before editing. Inspected the asset only with `file`: WebP, 1280×853 (approximately 3:2). No pixels or screenshots viewed. Kept the single authored asset; no crop derivatives needed. Existing `object-fit: cover` and focal points (78% 48% desktop, 72% center narrow) supply responsive cropping. The fixed responsive height reserves space before image loading and hydration; the fill image does not determine layout height. No new dependencies or WebGL context. Protected 3D components, API routes, and collectors were not edited.

## Gates

- `npx tsc --noEmit`: PASS after final changes.
- `npm run build`: PASS after final changes. Nonfatal warnings: workspace lockfile/root inference, deprecated middleware convention, broad NFT tracing through existing conversation code, experimental SQLite.
- `git diff --check`: PASS.
- Production server `/` returned HTTP 200. Headless Chromium DOM/computed-style checks (no screenshots) at 1440, 820, 601, 390, and 320px passed: hero is HomeDeck's first child, following content starts below it, image loads with cover, no hero horizontal overflow, title/copy/CTAs fit. Heights: 420, 262.39, 220, 220, 220px.
- Both live telemetry CTA destinations remain `/bots` and `/kanban`.
- Browser reduced-motion emulation disables all hero animations. Simulated document.hidden plus visibilitychange pauses all hero animation; restoring visibility resumes data-moving. Scrolling the app container offscreen pauses via the real IntersectionObserver.
- No canvas inside the hero; no browser page errors. Existing upstream event proxy returned 401 in server logs, so authenticated upstream streaming was not validated.

Browser checks used the already-installed external Playwright/Chromium and a temporary `/tmp/w2a-check.mjs`; no package or lockfile changes.
