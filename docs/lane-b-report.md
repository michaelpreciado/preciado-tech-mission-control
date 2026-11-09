# Lane B report — data widgets (/kanban, /system, /costs, /local-ai)

Date: 2026-11-09 · Executor: Lane B · Plan: `docs/polish-plan-2026-11-09.md` §2 (kanban/system/costs/local-ai) + §4 issues tagged B.
Worked directly in the main checkout (no worktree). Nothing committed or pushed; the systemd service was not touched.

## Files changed (Lane B set only)

| File | What |
|---|---|
| `lib/flight-strip.ts` | `completionStats(tasks, now)` → `{ doneToday, doneWeek, streak, best, daily[14] }` on local calendar days (DST-safe); `KanbanSummary` gains `blocked` (blocked+failed) and `review` for the glyph counts |
| `tests/flight-strip.test.mjs` | +2 tests (completionStats incl. quiet-today streak, gap break, future/unstamped/non-done ignored; glyph split). Timezone-agnostic: passes under `TZ=Pacific/Auckland` too |
| `components/KanbanBoard.tsx` | `desk:~$ kanban` widget head (`<Verdict unit="open">`, `▶ live · × blocked/failed · · review`, `done N today / N wk`, `14d <MiniHist>`, `streak Nd / best N`); lanes titled by ASCII divider (`-- review 4 ----`); cards are `.mc-wrow` buttons (glyph + ellipsised title + `2d` age, dim assignee line); footer `<Prompt foot meta="↻ 8s">` ticking from the last successful read. **#8 fixed:** both private `EventSource('/api/events')` (board + DetailDrawer) removed; both now ride `useLiveData().events`. Duplicate `taskSort` removed (imports flight-strip's) |
| `components/Kanban.module.css` | glass lane header, sheen, rail glow, `kb-scan` gradient animation + its `@keyframes` deleted; 2px semantic rail only (red blocked/failed, accent running, review neutral); rows 10px radius on `--pt-surface-2`; all type mono, 12px floor; grid tracks pinned `minmax(0,1fr)` |
| `components/AgentDeck.tsx` | `desk:~$ herdr ls` head, `.mc-wrow` agent rows with glyphs (Chip removed). **#9 fixed:** 401/403 throws `HerdrAuthError` → shows `herdr  unauthorized` and stops polling until the token changes (no more 4 s 401 loop) |
| `components/views/SystemPage.tsx` | `friday:~$ top` widget: `cpu [segbar] 9% 63°`, `2m <MiniHist>` (120 s history bucketed to 30) `↑peak`, `load 7.22 6.22 5.19  20 thr`, per-GPU `5070 [segbar] 100% 78°`, per-GPU `vram`, `mem`, per-mount `disk/boot` (all `autoTone {warn:85, crit:95}`), `net ↓9.3K ↑2.8K`, `thr` one segment per core toned per core, `-- pressure --` (swap / psi / procs), footer `friday:~$  up 10d 21h`. Other cards → `friday:~$ sensors`, `systemctl --user status`, `gateways`, `kanban --health`, `journal -f` with `.mc-wrow` + glyph rows. Status tones fixed: `missing/unavailable/unknown` = muted `·`, `stopped/stale/degraded/warn` = amber `×`, `down/failed/auth-fail` = red `×`. Head right slot wraps under the prompt ≤520px |
| `components/system.module.css` | rewritten for the widget rows (label \| bar \| value grid), removed `.identity/.stats/.row/.cores/.details` |
| `components/views/LocalAiTop.tsx` (new) | `useLocalAi(pollMs)` — the one shared `/api/local-ai` fetch hook (validation, abort, hidden-tab pause) — and `<LocalAiTop>`: `tokens / saved +today / reqs +today / 14d <MiniHist> / vram <SegBar>`, `-- engines N --` rows, proxy resident row, `desk:~$` footer |
| `components/views/LocalAiPage.tsx` | uses the shared hook + widget; `desk:~$ nvidia-smi` (per-card VRAM segbars + `-- vram procs --`), `desk:~$ curl :8932/status` (proxy fields as `.mc-kv` rows — `JSON.stringify` payloads replaced by a one-line summary, fixes the 412px overflow), `desk:~$ localai ps` (`-- engines --`, `-- ports --`), `desk:~$ localai recipes` (recipe Chips → `.mc-wrow` + dim detail line) |
| `components/local-ai.module.css` | 6px pill `.bar` removed; row/controls layout only |
| `components/views/CostsPanel.tsx` | `Window`/`TFrame`/`SectionRule` → local `Widget` (`desk:~$ …` prompt) + `<Divider>`. Top block: `desk:~$ costs` `<Verdict unit="this month">$23.58`, `<LocalAiTop>`, `desk:~$ openrouter` (coverage bar → `<SegBar>`). CLAUDE / CODEX cards (`.mc-segbar--thin` cap rows `● week 14d 15h 0%`). **Claude has no cap snapshot**, so its verdict is honest 7-day tokens, not a percent. Fair-use guard → `<SegBar autoTone {70,90}>` + 14d/7d `<MiniHist>` (SVG area sparkline + `AsciiSpark` removed, fixes the nowrap head overflow). Throughput unicode sparkline (with `textShadow`) → `<MiniHist>`; `AsciiHeat` inset dropped. Decorative amber/lime/violet on money and figures → white; amber only at cap/fair-use ≥70/≥90. **#7:** `var(--font-mono)` ×8 gone; all inline 8–9.5px type gone (12px floor via `costs.module.css`). **#10:** stale "AXONOMETRIC PROJECTION … FLAT TILES" note replaced with an accurate one. `Table` stacks at ≤820px always (matchMedia + ResizeObserver). Fixed a latent rules-of-hooks bug in `LocalAI` (`useMemo` after an early return) |
| `components/views/costs.module.css` (new) | route layout, stat/cap/legend rules, 12px floor |
| `components/views/BurnLandscape.tsx` | lime/violet/orange → `BILLING_MODE_COLOR` (three blues + slate); labels lowercase |
| `lib/chart-colors.ts` | `STATUS` now `var(--mc-ok/--mc-warn/--mc-crit)`; new `BILLING_MODE_COLOR`. `CATEGORICAL` untouched (memory graph + crew use it) |
| `components/views/shared.tsx` | `StatusDot` LED → `<Glyph>`; `ConnectCard` emoji `🛠 OPEN SETUP` → `> open setup` |
| `components/views/RigHud.tsx` | die-cell glow + LED removed (file is only used by dead `HomeSystem`; delete in post-merge cleanup) |
| `components/charts/MicroBars.tsx` | comment only |
| `app/system|costs|local-ai/page.tsx` | `PageHeader` now `command`/`host` prompts, lowercase titles |

Not changed (nothing needed): `app/kanban/page.tsx`, `KanbanSnapshot.tsx`, `Viz.tsx`, `ascii-viz.tsx`, `lib/glyph-series.ts`, `lib/host-metrics.ts`, `lib/system-health.ts`, `lib/local-ai-constants.ts`.

## Lane A primitives used

`Prompt` (`host`, `cmd`, `foot`, `meta`, `as`), `Divider`, `Verdict` (`unit`, `tone`), `Glyph` (`run idle fail err retry up down ok live todo`), `Kv` (`keyWidth`), `KvRow`, `WRow` (`g`, `right`, `dim`, `href`, `onClick`, `title`), `SegBar` (`value`, `max`, `segments`, `thin`, `autoTone`, `label`, `className`), `MiniHist` (`values`, `days`, `label`), CSS `.mc-widget`, `.mc-divider`/`.mc-divider-label`, `.mc-segbar` (raw markup for the per-core `thr` bar, since SegBar has one tone per bar), `.mc-wrow`. All existed when Lane B started; no prop gaps blocked anything. Wish-list for A: a per-segment tone on `SegBar` would let `thr` use the component instead of raw markup.

## Gates (raw)

```
npm run typecheck (tsc --noEmit)   → clean
node --test … flight-strip costs-* codex-usage host-parsers local-ai kanban-dispatch hermes-kanban-ttl
  ℹ tests 114  ℹ pass 114  ℹ fail 0
node --test tests/motion-css.test.mjs tests/pt-crew.test.mjs (cross-lane source readers)
  ℹ pass 44   ℹ fail 0
```

Browser check: throwaway `next dev -p 4199` (Next 16 isolates dev output in `.next/dev`, so the production build the service serves was not touched; stopped afterwards) + system Chromium via `playwright` at 1440×900 and 412×915:

```
desktop kanban/system/costs/local-ai : .mc-main overflow 0, text <12px: none
phone   kanban/system/costs/local-ai : .mc-main overflow 0, text <12px: none
```

(First run found and fixed: costs model-chart widget overflowing by 266/1028px — implicit grid track sized to min-content — and a 10.8px `<small>` in AgentDeck.)

**`next build` was NOT run**: in the main checkout it rewrites `.next/`, which the live `next start` service is serving from — that would break the running app without a restart. Run it in the merge step.

## `globals.css` / Lane-A-owned rules to remove (A follow-up)

Line numbers as of this report (Lane A is editing concurrently; trust the selector):

| File:line | Selector | Why |
|---|---|---|
| `app/globals.css:1950` | `.cp-table { min-width: 560px }` (+ `:2150` ≤820 `min-width: 480px`) | Table stacks ≤820 now; inline `minWidth: 0` already overrides it, the rule is dead weight |
| `app/globals.css:1955-1965`, `:2153` | `.cp-bar`, `.cp-bar > span` | replaced by `<SegBar>` in `costs.module.css .cellBar` |
| `app/globals.css:2003-2008` | `.cp-model-chart-track`, `.cp-model-chart-track span` | replaced by `<SegBar>` |
| `app/globals.css:2026-2050`, `:2183` | `.cp-fairuse*`, `.cp-plan-band*` (head/track/sparkline/hint/verdict/ticks/trend*) | FairUseGuard/WeeklyUsage no longer emit these classes |
| `app/globals.css:2024`, `:3948`, `:2128` | `.cp-stat`, `.tframe-surface.cp-stat`, `.cp-panel .mc-window > div:has(> .cp-stat)` | `Stat` is a module class now; no `.mc-window` on costs |
| `app/globals.css:1903` | `.cp-panel { … animation: mc-rise-in … }` + `body:has(.mc-costs-page) .mc-rain` | entrance animation + rain hook; layout now in `costs.module.css .panel` |
| `app/globals.css:3426-3472` | `.mc-kb-sync` (costs freshness strip) | replaced by a `WRow`; check other users before deleting |
| `app/globals.css:528-537` | `.mc-led*` | no Lane B file emits it any more (shared.tsx, RigHud, SystemPage) — check Lane C before deleting |
| `app/globals.css:2291-2305` | `.mc-rig-*` | RigHud is only mounted by dead `HomeSystem` (post-merge cleanup) |
| `components/charts/charts.module.css` `.bar` | `border-radius: 2px 2px 0 0` → `0` | plan §2 /costs: MicroBars radius 0 (A's file) |
| `app/w2l.css:40-48,81`, `app/vf/v2-lane.css:54-59` | `.cp-table*` phone overrides | superseded by the JS ≤820 stacking |

## Skipped / deviations

- **`/system` `-- top --` process list** — no per-process CPU source exists (`HostSample` has none). Replaced with an honest `-- pressure --` block (swap, PSI cpu/mem/io, running procs, ctx/s). Adding a process sampler would be new collector work.
- **"CLAUDE 3% this week"** — Claude Code logs no cap snapshot, so the CLAUDE card shows 7-day tokens; only CODEX shows a provider-reported percent.
- **`engines 1/3` / `·exl3 stopped`** — `/api/local-ai` lists only running labelled containers, so stopped engines can't be shown; the header is `engines N` plus a proxy-resident row.
- **`localai top` `gpu 0% 60°`** — the local-ai probe reports VRAM, not util/temp, so the row is `vram [segbar] 93% 22.4G` (util/temp live on `/system`).
- **Provenance notes on /costs** are still uppercase prose (kept verbatim; lowercasing them breaks units like `$/M`).
- **`next build`** — see Gates.
- `Viz.tsx` / `ascii-viz.tsx` unused-export removal belongs to the post-merge cleanup (other lanes' dead files import them).
