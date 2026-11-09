# Lane C report — chat / crew+bots / calendar / content / deliverables+pipeline / github+projects+memory+setup+login

Date: 2026-11-09 · Executor: Lane C (`friday`) · Plan: `docs/polish-plan-2026-11-09.md` §Lane C (line 412) + §6 Lane C pre-flight audit.
Worked directly in the main checkout (no worktree), in parallel with Lanes A/B/D. Nothing committed or pushed; the systemd service was not restarted (except as noted under Gates).

## Files changed (Lane C exclusive set only)

| File | What |
|---|---|
| `components/ChatShell.module.css` | Rewritten (−285/+433). Former `AgentConsole.module.css` styles merged in (the old `:global(.AgentConsole_*)` rules never matched; `.modeToggle` was unused). **#15 fixed.** Widget-theme glass only: no gradient/sheen, no card `box-shadow` (one `inset 2px 0` active-rail marker), no blur. Breakpoints aligned to the shared ladder: `≥1024`, `821–1023` (tablet rail), **single ≤820** rule (was a split 719/720 pair that left 720–820 in a half state). Composer, thread, pane-head, footer laid out on the widget grid |
| `components/ChatConsole.tsx` | Composer prompt is now `<b>friday</b>:~$` (`composerPrompt`), the multi-line helper text collapsed into **one** `<Prompt foot>` status line (`#chat-composer-hint`). Thread header is `<Prompt host="friday" cmd={chat <profile>} />`; pane heads `friday:~$ bots` / `friday:~$ sessions`. **#16 fixed:** the Herdr segment is only offered when `/api/herdr` answers — a 401 sets `herdrDenied`, drops the segment, forces `mode` back to `chat`, and shows the `herdr  unauthorized` hint. Footer tone model (`idle/run/warn/err`) drives one line, no duplicated status text |
| `components/AgentConsole.module.css` | **Deleted** (merged into `ChatShell.module.css`) |
| `components/LiveChatMirror.tsx` | Left as-is — already correct: it only refreshes the single conversation list and returns `null`; there is no second thread viewer. Verified, not modified |
| `components/ChatContinuityFooter.tsx` | Prompt/nonce line matched to the new chat footer type scale |
| `components/crew/Roster.tsx` | `phone:~$ agent top` widget: `agents N  all idle`, `cpu / load [segbar]`, ASCII `-- agents ------` divider, one `.mc-wrow` per agent with glyph (`▶` confirmed+fresh / `·` idle+unknown / `×` needs intervention / `↻` stale), name, task (`currentTask.title ?? presence.reportedTask`), age right. Sans `<h1>` + 62ch paragraph replaced. **BOT DESK mounted** here |
| `components/crew/Roster.module.css` | Widget rows; **#fail fix:** `.fail, .run, .idle` shared the same colour (a needs-intervention row looked identical to an idle one) — `.fail` now tones its name `--pt-warn-ink` and only `.fail`/`.run`/`.idle` keep the shared base |
| `components/crew/BotDesk.tsx` (new) | BOT DESK card: joins `/api/bots` (who exists, 20s poll, hidden-tab paused) with `/api/crew` (who is provably working) via the shared `isWorking` predicate (confirmed-worker + fresh). Header counts idle bots; one bot at a time paged `n/N`; working line `▶ working · at the desk`, otherwise `· idle · roaming the office`. No pixel sprites (none exist) — text edition |
| `components/views/BotsPanel.tsx` | Prompt head, glyph rows; exports `botDisplay` / `HIDDEN_BOT_PROFILES` reused by BotDesk (single source of bot display names) |
| `components/TickTickCalendar.tsx` | **#14 fixed:** every fetch checks `res.ok` before `.json()` — a 401/429 now surfaces as an error card/log line, not the CONNECT card. Day-summary card added: `TODAY` + `all clear` / `N open`, `KvRow` today/week + next task. `> open setup` (was `🛠`) when unconfigured. Uses `components/calendar.module.css` |
| `components/calendar.module.css` (new) | Route styles for the summary/connect/log/task rows; 12px type floor |
| `app/calendar/page.tsx` | `PageHeader` prompt head |
| `components/DeliverablesShelf.tsx`, `components/deliverables.css` | `desk:~$ deliverables` prompt head + `mc-verdict` artifact count; radius/colour tokens pinned to the widget palette (no literals); `.pt-artifact` pressed state = 1px border change |
| `components/PipelineBoard.tsx`, `components/Pipeline.module.css` | `desk:~$ pipeline --attention` head with `N need you` meta; loading/empty/error states are prompt + note rows; module stripped of gradients/shadows, 12px floor |
| `app/pipeline/page.tsx` | `PageHeader` + `desk:~$ documents` prompt for the collapsible vault panel |
| `components/VaultDocuments.tsx`, `components/vault-documents.css` | **glow removed** from `.mc-vault-doc:hover/:focus-visible` (`box-shadow: none`, border-only). Doc rows are `.mc-wrow`-style with encoded Obsidian links |
| `components/RevenuePipeline.tsx` | Money figures on white, amber only past threshold; header prompt |
| `lib/pt/theme.ts` | **#12 fixed:** `THEME_TOKENS` stays native-only; the web-facing `THEME_CSS_VARIABLES` no longer injects Geist / literal JetBrains / `#00d4ff` — it only exposes six `--pt-launcher-*` hooks that resolve to the widget tokens, so `/pipeline` and `/deliverables` follow the cascade instead of overriding it |
| `app/login/page.tsx`, `components/login.module.css` (new) | **#13 fixed:** `'Signing in&hellip;'` literal entity → `'Signing in…'`. Login card on the widget palette |
| `app/setup/page.tsx`, `components/setup.module.css` (new) | **#2 (C half) fixed:** duplicate accent preset key resolved — `key={p.name}` (preset list has no duplicate names). `💾 SAVE CONFIG` → `SAVE CONFIG` (no emoji). Uses the module stylesheet, 42 class refs |
| `components/views/GithubPanel.tsx`, `components/github.module.css` (new) | Contribution graph + repo list flattened: prompt head, segmented/`MiniHist` bars, `.mc-wrow` rows, no gradients; module owns the route layout |
| `components/views/MemoryGraph.tsx`, `components/views/MemoryStream.tsx`, `components/memory.module.css` (new) | Prompt heads, `.mc-wrow` results, mono type, gradient-free chrome. `CATEGORICAL` chart colours untouched (shared with crew accents) |
| `components/views/ProjectGrid.tsx`, `app/projects/page.tsx` | Prompt head; grid rows flattened. Deprioritised route — layout only |
| `components/ContentCreationBoard.tsx` / `VideoPromptStudio.tsx` / `SignalFeed.tsx` | **Not modified** (plan: content is a deprioritised deep link). `app/content-creation/page.tsx` + `components/content.module.css` (new) give it a `PageHeader` and `-- label ----` dividers between the three sections |
| `app/chat|crew|bots|deliverables|github|memory/page.tsx` | Prompt-style `PageHeader` (e.g. `CREW` + one-line subtitle); `/bots` already redirects to `/crew`, left as a redirect |

Not changed (nothing needed): `components/Markdown.tsx`, `components/usePipelineRadar.ts`, `lib/ticktick.ts`, `components/LiveChatMirror.tsx`, `components/ui-settings.tsx`, `components/Tilt.tsx` (file kept; **no importer left** in the Lane C set — it belongs to the post-merge cleanup list, verified unreferenced from `GithubPanel`/`ProjectGrid`).

## Lane A primitives used

`Prompt` (`host`, `cmd`, `foot`, `meta`, `as`, `id`, `className`), `Divider` (`label`, `as`), `Verdict` (`unit`), `Glyph`, `Kv`/`KvRow`, `WRow`, `SegBar`, `MiniHist`, CSS `.mc-widget`, `.mc-wrow`, `.mc-divider`, `--pt-*` tokens. All were present when Lane C started; no prop gaps blocked anything. Nothing from the Lane A/B exclusive sets was created or edited.

## Gates (raw)

```
npm run typecheck (tsc --noEmit)                                    → clean (exit 0)
node node_modules/.bin/next build                                   → completed (exit 0), all Lane C routes emitted as ƒ dynamic
node --test --import ./tests/helpers/ts-resolve.mjs \
  tests/chat-continuity.test.mjs tests/chat-route.test.mjs \
  tests/pt-crew-auth.test.mjs tests/pt-crew.test.mjs \
  tests/pt-deliverables-api.test.mjs tests/pt-deliverables.test.mjs \
  tests/pt-pipeline-auth.test.mjs tests/pt-pipeline-radar.test.mjs \
  tests/revenue-pipeline.test.mjs tests/ticktick-inbox.test.mjs \
  tests/vault-docs.test.mjs
  ℹ tests 114  ℹ pass 114  ℹ fail 0  (duration ~11–16s)
```

`node --test` (with `tests/helpers/ts-resolve.mjs`) is the working invocation here; `vitest` cannot resolve the repo's `@/` alias (`Cannot find package '@/lib/mission-api'`, `'@/lib/config'`) and does not detect `tests/ticktick-inbox.test.mjs` — it reports 11/11 files failed with "no tests". This is a harness gap for the merge step, not a Lane C regression.

`next build` was run in the main checkout. It rewrites `.next/`, which the live `next start` service serves from — the merge step should restart `mission-control` after the combined build (same caveat as Lane B).

## Skipped / deviations

- **`components/chat.module.css`** — §6's pre-flight audit says "add `chat.module.css`", but the Lane C file list (§Lane C, line 415–424) keeps `ChatShell.module.css` and lists `AgentConsole.module.css` as the merge target; `chat.module.css` is not in the new-module list. Followed the file list: `ChatConsole` imports `./ChatShell.module.css`, `AgentConsole.module.css` deleted. No `chat.module.css` created.
- **`/content-creation` internals** — deprioritised by the lane prompt. Only the page shell was polished (`PageHeader` + dividers + `content.module.css`); `ContentCreationBoard`/`VideoPromptStudio`/`SignalFeed` still carry emoji (`🎥`, `⚠`) and legacy `mc-pipe-*` markup.
- **`app/w2l.css:54`** (**#17, "C (rule) / A (file)"**) — the dead `grid-template-columns` on the flex `.mc-gh-stats` container was removed and replaced with `.mc-gh-stats > .mc-gh-stat { flex: 1 1 calc(50% - 5px) }` so the stats actually go 2-up on phones. This is a one-line change in a Lane-A-owned file; flagged here for the merge review.
- **`globals.css` `.mc-week-month { min-width: 560px }`** (**#18**) — the rule no longer exists (the calendar month view was rebuilt on the module stylesheet), so the forced 412px horizontal scroll is gone. No Lane C edit to `globals.css` was needed.
- **Browser matrix / visual snapshot** — not run from this lane: the audit scripts need `npx playwright install chromium` (plan §5 #20, browsers absent) and the live service is serving the pre-lane build. Deferred to the merged verification pass.
- **`artifacts/2026-11-09/polish-verification.md`** — belongs to the post-merge full-set verification (§5), not this lane.
