# W2-J ASCII data visualization

Added `components/ascii-viz.tsx`, with no dependencies or client-only hooks:

- `AsciiSpark`: latest up to 24 samples, zero-inclusive block ramp ▁▂▃▄▅▆▇█, mid ink with bright final glyph and compact latest-value label. Short series keep their actual length.
- `AsciiMeter`: default 16 cells, bracketed bright filled blocks and faint empty cells, optional uppercase label. Finite values clamp to 0–1; accessible meter semantics expose the fraction.
- `AsciiHeat`: default 26 columns, chronological density ramp ` .:*#@`, normalized to the series maximum, three ink levels, newline wrapping.
- `AsciiBars`: default 20 cells, horizontal ▇ rows, compact numeric labels aligned using mono spaces. Bars clamp to the supplied maximum; zero remains empty.

All primitives render text spans, return nothing for empty/invalid input or unusable dimensions, and handle single points and zero/constant data. Dimensions are capped at 256. Styles live in one `.asciiviz-` block in `app/globals.css`: existing JetBrains Mono font variable, 9–10px type, line-height 1.1, periwinkle .85/.55/.30, no shadows.

## Wiring

- Home: CPU and memory meters below the existing dials in `components/HomeSystem.tsx`, the telemetry component rendered by `HomeDeck.tsx`. Telemetry meters use faint ink. Existing SVG dials/charts remain intact; HomeDeck itself needs no change.
- Costs: 14-calendar-day Codex token burn spark beside the monthly burn total in FairUseGuard. Window ends at the latest logged date; missing days are zero, matching the existing burn chart's convention. Explicitly labeled tokens, not dollars. Existing SVG spark remains.
- Costs: ASCII density below Local AI's existing DAILY VOLUME heatmap, reusing `weeks.flat()` quartile data in chronological order. Existing heatmap remains.
- GitHub: top five repository event counts inside RECENT EVENTS, derived from existing `gh.recentEvents`, sorted descending with name tie-break. Labels specify current-feed events, not lifetime commits. Repository names retain full title tooltips; counts share a common maximum and space-padded value width.

## Skips

- AgentDeck: `HerdrAgent` exposes only id, name, kind, status, cwd and focused. Neither session progress nor start time, uptime, or a meaningful duration denominator is available. No fabricated fraction or API change.

## Validation

- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Existing workspace-root/multiple-lockfile, middleware-deprecation, dynamic file-tracing and experimental SQLite warnings are emitted.
- In-memory React server-render smoke checks passed for empty/invalid inputs, single and constant series, meter clamping, heat wrapping, and equal-width numeric bar rows.
- `git diff --check`: passed.

No API, collector, token, VF, login, error/loading, or 3D files changed.
