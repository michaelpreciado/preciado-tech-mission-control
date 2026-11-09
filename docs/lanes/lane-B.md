# Lane B — data widgets: /kanban, /system, /costs, /local-ai

You are Lane B of a three-lane refactor of Mission Control, a Next.js 16 app. You run in a git worktree
(`mc-lane-b`) branched from **Lane A's** `feat(theme): widget token layer + primitives` commit. Read
`docs/polish-plan-2026-11-09.md` IN FULL first — it is the spec. Read `docs/lane-a-report.md` for the exact
primitives Lane A shipped (component names, CSS class names, props) and use them.

## Prerequisites (verify, then build on them)

- Lane A has already created in `components/ui.tsx`: `Prompt`, `Divider`, `Verdict`, `Glyph`, `Kv`/`KvRow`,
  `WRow`; and `components/charts/SegBar.tsx`, `components/charts/MiniHist.tsx`. **Import them — never edit
  them.** If a prop you need does not exist, work around it in your own files and note it in your report.
- Lane A owns `app/globals.css`, `lib/tokens.ts`, `lib/theme.ts` and all of `app/styles/**`, `app/vf/**`,
  `app/w2l.css`. **You must not edit those files.** If a `globals.css` rule in your route's scope must be
  removed, do NOT remove it — list it in your report (file + line + selector) for a follow-up commit.
- You own route CSS Modules instead: create `components/views/costs.module.css` (new), and use the existing
  `components/system.module.css`, `components/local-ai.module.css`, `components/Kanban.module.css`.

## Your exclusive file lane

- `app/kanban/page.tsx`, `app/system/page.tsx`, `app/costs/page.tsx`, `app/local-ai/page.tsx`
- `components/KanbanBoard.tsx`, `components/Kanban.module.css`, `components/AgentDeck.tsx`,
  `components/KanbanSnapshot.tsx`
- `components/views/SystemPage.tsx`, `components/views/RigHud.tsx`, `components/views/CostsPanel.tsx`,
  `components/views/BurnLandscape.tsx`, `components/views/LocalAiPage.tsx`, `components/views/shared.tsx`,
  `components/views/costs.module.css` (new)
- `components/system.module.css`, `components/local-ai.module.css`
- `components/charts/MicroBars.tsx`, `components/Viz.tsx`, `components/ascii-viz.tsx`
- `lib/chart-colors.ts`, `lib/glyph-series.ts`, `lib/flight-strip.ts`, `lib/host-metrics.ts`,
  `lib/system-health.ts`, `lib/local-ai-constants.ts`
- Tests: `tests/flight-strip.test.mjs`, `tests/costs-*.test.mjs`, `tests/codex-usage.test.mjs`,
  `tests/host-parsers.test.mjs`, `tests/local-ai.test.mjs`, `tests/kanban-dispatch.test.mjs`,
  `tests/hermes-kanban-ttl.test.mjs`

Do not touch Lane A's or Lane C's files.

## Work

Implement plan **§2** for `/kanban`, `/system`, `/costs`, `/local-ai` and every **issue in §4 tagged `B`**.
Highlights, in priority order:

1. **`/kanban`** — widget head `desk:~$ kanban` + `<Verdict>4<small>open</small></Verdict>` + inline glyph
   counts `▶0 ×3 ·1` + `.mc-kv` lines (`done 3 today / 67 wk`, `streak 10d  best 31`) + a 14-day `<MiniHist>`.
   Extend `summarizeKanban()` in `lib/flight-strip.ts:83` with `doneToday / doneWeek / streak / best`, derived
   from `HermesTask.completedAt` (`lib/types.ts:584`). Lanes → `<Divider label="needs you 2" />`; `.taskCard`
   keeps only a left 2px rail with semantic colours (blocked/failed `#EF4444`; review stays neutral). Rows as
   `.mc-wrow` with glyph + ellipsised title + age right. Footer `<Prompt host="desk" foot meta="↻ 15s" />`.
   **Fixes:** issue #8 — kill the two private `EventSource('/api/events')` at `KanbanBoard.tsx:551` and
   `DetailDrawer` `:136`, subscribe via `LiveDataProvider` instead. Issue #9 — `AgentDeck.tsx` polls
   `/api/herdr` every 4s and gets 401: show one line `herdr  unauthorized` and STOP polling on 401.
   Keep only `lib/flight-strip.ts:188`'s `taskSort`; drop the duplicate at `KanbanBoard.tsx:369`.
2. **`/system`** — one `friday:~$ top` widget: `cpu [segbar] 44% 64°`, `load 6.55 20 thr`, `5070 [segbar]`,
   `3060 [segbar]`, `mem [segbar warn]`, `disk [segbar warn]`, `net ↓38B ↑34B`, `thr [per-core segbar, 2px gaps]`,
   then `-- top ------` process rows, footer `friday:~$  up 10d 20h`. Data lives in `HostSample`
   (`lib/host-metrics.ts:60-88`) and `telemetry.cpu`. Thresholds `autoTone {warn:85, crit:95}`. Replace the
   `Stat series` sparklines with `<SegBar>`/`<MiniHist>`. CardHeads → `friday:~$ top|sensors|systemctl --user
   status|gateways|kanban --health|journal -f`. Issue: `'stopped'|'unavailable'|'missing'` all render amber
   (`SystemPage.tsx:47-58`) → `missing/unavailable` = `·` muted, `stopped` = `×` amber, `down` = `×` red.
3. **`/costs`** — `desk:~$ costs` + `<Verdict>$412<small>this month</small></Verdict>`; `CLAUDE`/Codex weekly
   cards with `.mc-segbar--thin` progress lines; `desk:~$ localai top` widget (data `costs.localCompute`,
   `CostsPanel.tsx:845-891`); `SectionRule` → `<Divider>`. **Fixes:** issue #7 — `var(--font-mono)` ×8 →
   `var(--pt-font-mono)` (also `globals.css:4604,4744,4764,4796` are A's files → report only); issue #10 —
   delete the stale "AXONOMETRIC PROJECTION … FLAT TILES" copy at `CostsPanel.tsx:1248-1250`. Remove the
   decorative amber on money (`:391,:451,:523,:554,:657,:976`) → white; amber only for real thresholds.
   Charts: `MicroBars` `.emph` glow off + `border-radius:0`; `BurnLandscape` lime/violet/orange → three blues
   `#3B82F6 / #1D4ED8 / #60A5FA` (+ amber only for overage); `lib/chart-colors.ts:39` `STATUS` reads the
   `--mc-ok/--mc-warn/--mc-crit` tokens.
4. **`/local-ai`** — head `desk:~$ localai top`; `.bar` 6px pill → `<SegBar>`; CardHeads → `desk:~$ nvidia-smi`,
   `desk:~$ localai recipes`, `-- engines 1/3 --`; the recipe `Chip` with `JSON.stringify` payloads
   (`:34, :134`) → `.mc-kv` rows (this fixes the mobile long-string overflow).
5. **Shared fetch hook** for `/api/local-ai` used by both `/costs` and `/local-ai` (you own both).
6. **Mobile (412px)** per plan §2 for each route: `/kanban` head wraps; `/system` `CardHead` right slot stacks
   below 520px and GPU value column wraps; `/costs` forces the stacked table ≤820 (`.cp-table {min-width:560px}`
   at `globals.css:4628` is A's file → report it) and wraps `.cp-plan-band-head`; `/local-ai` recipe rows no
   longer overflow.

## Non-negotiables

- Monospace everywhere except verdict numerals. No emoji, no traffic lights, no blur/glow/gradient/bloom.
  Cards: `#0A0F1A` fill, `1px #1E293B` border, 16px radius, no `box-shadow`, no `backdrop-filter`.
- Status glyphs `> · × ↻ ↑ ↓`, LEDs gone. Amber only at real thresholds.
- All numbers on screen must be real (derived from the live APIs) — never hardcode a fake count.
- Keep every route rendering under `prefers-reduced-motion` and `data-motion="off"`.

## Gates — run these yourself, fix failures, report raw numbers

```bash
npm run typecheck
npx vitest run tests/flight-strip.test.mjs tests/costs-*.test.mjs tests/codex-usage.test.mjs \
  tests/host-parsers.test.mjs tests/local-ai.test.mjs tests/kanban-dispatch.test.mjs tests/hermes-kanban-ttl.test.mjs
node node_modules/.bin/next build
```

Do NOT restart the systemd service. Do NOT edit `app/globals.css`. Do NOT commit — the orchestrator merges.

## Return format

Write `docs/lane-b-report.md`: files changed, the exact new primitives used, raw gate output, and the list of
`globals.css` rules that need removal by the A owner (file, line, selector, reason). Reply with a <=15 line summary.
