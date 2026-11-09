# Lane C — chat, crew/bots, calendar, content, deliverables/pipeline, github/projects/memory/setup/login

You are Lane C of a three-lane refactor of Mission Control, a Next.js 16 app. You run in a git worktree
(`mc-lane-c`) branched from **Lane A's** `feat(theme): widget token layer + primitives` commit. Read
`docs/polish-plan-2026-11-09.md` IN FULL first — it is the spec. Read `docs/lane-a-report.md` for the exact
primitives Lane A shipped and use them.

## Prerequisites

- Lane A created in `components/ui.tsx`: `Prompt`, `Divider`, `Verdict`, `Glyph`, `Kv`/`KvRow`, `WRow`; plus
  `components/charts/SegBar.tsx`, `components/charts/MiniHist.tsx`. **Import them — never edit them.**
- Lane A owns `app/globals.css`, `lib/tokens.ts`, `lib/theme.ts`, `app/styles/**`, `app/vf/**`, `app/w2l.css`.
  **Do not edit those.** Instead move your route rules into your own CSS Modules (list below) and report any
  `globals.css` rule that must be deleted, with file + line + selector, for a follow-up commit.
- Lane B owns `/kanban`, `/system`, `/costs`, `/local-ai` and their components. Never touch them.

## Your exclusive file lane

Pages: `app/chat/page.tsx`, `app/crew/page.tsx`, `app/bots/page.tsx`, `app/calendar/page.tsx`,
`app/content-creation/page.tsx`, `app/deliverables/page.tsx`, `app/pipeline/page.tsx`, `app/github/page.tsx`,
`app/projects/page.tsx`, `app/memory/page.tsx`, `app/setup/page.tsx`, `app/login/page.tsx`.

Components: `components/ChatConsole.tsx`, `components/ChatShell.module.css`, `components/AgentConsole.module.css`
(DELETE after folding its surviving rules into ChatShell), `components/LiveChatMirror.tsx`,
`components/ChatContinuityFooter.tsx`, `components/Markdown.tsx`, `components/views/BotsPanel.tsx`,
`components/crew/**`, `components/TickTickCalendar.tsx`, `components/ContentCreationBoard.tsx`,
`components/VideoPromptStudio.tsx`, `components/SignalFeed.tsx`, `components/DeliverablesShelf.tsx`,
`components/deliverables.css`, `components/PipelineBoard.tsx`, `components/Pipeline.module.css`,
`components/RevenuePipeline.tsx`, `components/VaultDocuments.tsx`, `components/vault-documents.css`,
`components/usePipelineRadar.ts`, `components/views/GithubPanel.tsx`, `components/views/ProjectGrid.tsx`,
`components/Tilt.tsx`, `components/views/MemoryGraph.tsx`, `components/views/MemoryStream.tsx`,
`components/ui-settings.tsx`, `lib/pt/theme.ts`, `lib/ticktick.ts`.

New CSS Modules you create: `components/calendar.module.css`, `components/content.module.css`,
`components/github.module.css`, `components/memory.module.css`, `components/setup.module.css`,
`components/login.module.css`.

Tests: `tests/chat-*.test.mjs`, `tests/pt-crew*.test.mjs`, `tests/pt-deliverables*.test.mjs`,
`tests/pt-pipeline*.test.mjs`, `tests/ticktick-inbox.test.mjs`, `tests/vault-docs.test.mjs`,
`tests/revenue-pipeline.test.mjs`.

## Work

Implement plan **§2** for every route above plus every **issue in §4 tagged `C`**. Priority order:

1. **`/chat`** — pick ONE stylesheet (keep `ChatShell.module.css`, fold in `AgentConsole.module.css`'s
   surviving rules, delete the latter). Delete the never-matching `:global(.AgentConsole_filters/.AgentConsole_rowMeta)`
   (`ChatShell:113,123`) and unused `.modeToggle` (`:165`) — issue #15. Flatten glass/glow. Composer prompt
   becomes `friday:~$` and the four helper lines collapse into one `.mc-prompt--foot` line. Thread header →
   `<Prompt host="friday" cmd={`chat ${profile}`} />`. Message bodies → mono. Issue #16 — Herdr mode is
   offered with no availability check while `/api/herdr` is 401: disable that segment with a `herdr  unauthorized`
   hint. `LiveChatMirror` (`:523`) renders nothing and polls every 5s → gate behind document visibility
   (`lib/motion-visibility.ts`) or drop it. **M:** one ≤820 rule (kill the 899 vs 767/768-1023 `!important`
   patches); hide the voice button, Send becomes an icon button.
2. **`/crew`** (and `/bots` redirect) — replace the big h1 + paragraph with the `phone:~$ agent top` widget:
   `agents N  all idle`, `cpu 0% 0B`, `load [segbar] 0%`, `-- agents ------`, one `.mc-wrow` per agent
   (glyph `▶` confirmed+fresh / `·` idle-unknown / `×` needs intervention / `↻` stale, name, current task, age),
   footer `phone:~$`. Add the **BOT DESK** charm card: `BOT DESK   2 idle` + a per-bot line joined from
   `/api/bots` and `/api/crew` (`useCrew.ts:20`); idle = `worker.kind !== 'confirmed-worker' || freshness !== 'fresh'`;
   honour `HIDDEN_BOT_PROFILES`. Text block only — no sprite assets exist. Mount `PageHeader` (crew is the only
   route without one). Fix the never-applied `.fail` rail class (`Roster.tsx:19` vs `Roster.module.css:14`).
3. **`/calendar`** — target: `NOVEMBER 2026 … mon 9` header, 7-col mono grid, today = white chip with black text,
   other days `#0A0F1A`, dim weekday letters. Move the rules (`globals.css:874-1014`) into
   `components/calendar.module.css`. Add the `TODAY … all clear … 0 done / NEXT ○ task tu / 10 done this week ·
   1d streak` summary card. Issues: #14 — `TickTickCalendar.tsx:120-121` never checks `res.ok`, so a 401/429
   shows "CONNECT TICKTICK" → check `res.ok`, show `× ticktick 429`. Replace the emoji `🛠 OPEN SETUP` (`:166`)
   with `> open setup`. **M:** issue #18 — `.mc-week-month {min-width:560px}` (`globals.css:987`, A's file →
   report it) forces horizontal scroll at 412 → `repeat(7, minmax(0,1fr))` with 2-char day cells.
4. **`/content-creation`** — flatten the three card recipes into one `.mc-widget`; `.mc-studio-btn` matrix-green
   → primary `#3B82F6`; fonts → mono; move rules to `components/content.module.css`. Headers `desk:~$ content
   board|studio|signals`. **M:** `.mc-prompt-out {white-space:pre}` → `pre-wrap`; studio prompt card min-height
   ≤560 → auto.
5. **`/deliverables` + `/pipeline`** — issue #12: `lib/pt/theme.ts:2-13` injects `--pt-font-sans: "Geist"`
   (not loaded), a literal JetBrains family that bypasses the next/font face, and a fallback cyan `#00d4ff` on
   both routes → remove the font/colour overrides, keep only the `--pt-launcher-*` hooks pointing at widget
   tokens. `deliverables.css` radius 12 → 16px, hardcoded state colours → `--pt-ok/--pt-error/--pt-warn/--pt-text-dim`,
   sans → mono. `Pipeline.module.css:4` sans → mono; `.radar section` → `.mc-widget`; vault hover glow off.
   Headers `desk:~$ pipeline` + `-- leads 20 --` style lane dividers, `desk:~$ deliverables`.
6. **`/github`, `/projects`, `/memory`, `/setup`, `/login`** — flatten per plan. `/projects`: drop the `Tilt`
   wrapper (`Tilt.tsx:59`) → plain `.mc-widget` tiles `desk:~$ clients`. `/memory`: flat detail panel, 2px
   `#3B82F6` selected stroke. `/setup`: flat groups, 1px `#3B82F6` focus border, mono inputs, and issue #2 —
   preset swatches `key={p.hex}` (`app/setup/page.tsx:282`) has a duplicate hex → `key={p.name}`.
   `/login`: flat card, issue #13 — `'Signing in&hellip;'` (`:127`) renders the literal entity → `'Signing in…'`.
   Issue #17 — `w2l.css:76` sets `grid-template-columns` on the flex `.mc-gh-stats` (dead rule, A's file →
   report it); make `.mc-gh-stats` a 2-col grid ≤520 and `.mc-gh-heatmap-inner` `overflow-x:auto`.
7. **Mobile (412px)** for every route above; the known risks are the calendar month, the chat composer and the
   studio output. Align every breakpoint to the ladder **1400 / 1200 / 980 / 820 / 520**.

## Non-negotiables

- Monospace everywhere except verdict numerals. No emoji (delete every one you find), no traffic lights,
  no blur/glow/gradient/bloom. Cards: `#0A0F1A` fill, `1px #1E293B` border, 16px radius, no `box-shadow`,
  no `backdrop-filter`. Status glyphs `> · × ↻`, LEDs gone.
- All on-screen numbers real — never a stub. If an API is unconfigured or 401 (ticktick, herdr), render the
  honest unavailable state, not a fake.
- Keep every route rendering under `prefers-reduced-motion` and `data-motion="off"`.

## Gates — run these yourself, fix failures, report raw numbers

```bash
npm run typecheck
npx vitest run tests/chat-*.test.mjs tests/pt-crew*.test.mjs tests/pt-deliverables*.test.mjs \
  tests/pt-pipeline*.test.mjs tests/ticktick-inbox.test.mjs tests/vault-docs.test.mjs tests/revenue-pipeline.test.mjs
node node_modules/.bin/next build
```

Do NOT restart the systemd service. Do NOT edit `app/globals.css`. Do NOT commit — the orchestrator merges.

## UPDATED COORDINATION NOTES (read these — they override anything above)

- **You are in a git worktree at `/home/mp/Documents/mc-lane-c`** (branch `lane-c`), branched from
  **`dbe8684` feat(aurora): widget-theme sweep — flat shell + all routes (Lane A)**. Lane A already swept
  every route, including yours, and all gates were green at that commit. Your job is therefore
  **depth + correctness on your routes**, not a fresh rewrite: read Lane A's `docs/lane-a-report.md`
  first, then verify each of your routes against plan §2 and fix what is shallow, wrong or missing.
- **NEVER edit `app/globals.css`** (or `lib/tokens.ts`, `lib/theme.ts`, `app/styles/**`, `app/vf/**`,
  `app/w2l.css`). Lane B runs in parallel and both of you writing that file guarantees an unmergeable
  conflict. Instead put your route rules in the CSS Modules listed above (`components/calendar.module.css`,
  `content.module.css`, `github.module.css`, `memory.module.css`, `setup.module.css`, `login.module.css`,
  plus `ChatShell.module.css` / `Pipeline.module.css`), and **list every `globals.css` block you replaced**
  in your report as `line | selector | reason`. The orchestrator deletes them all in one post-merge pass.
- `node_modules` is a symlink to the main checkout and `data/` was copied in — do not run `npm install`,
  do not touch `data/`, do not run any `git` write command (no `add`, `commit`, `stash`, `checkout`),
  and **do not restart the systemd service**. Just leave your edits in the worktree.

## Return format

Write `docs/lane-c-report.md`: files changed, primitives used, raw gate output, and the list of `globals.css`
rules needing removal by the A owner (file, line, selector, reason). Reply with a <=15 line summary.
