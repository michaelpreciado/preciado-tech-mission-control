# Lane E — widget heads for the four unthemed routes (2026-11-09)

Plan: `docs/polish-plan-2026-11-09.md` §8.1 P1 / §8.3 E. Card `t_3345d3d9`.

Four routes had **zero** `.mc-widget` at 1440 *and* 412: `/chat`, `/pipeline`,
`/setup`, `/deliverables`. (`/kanban`'s second widget is a responsive twin, and
`/system` was already covered — both need nothing.) Each now opens with one themed head
built only from the Lane A primitives (`Prompt`, `Verdict`, `Kv`/`KvRow`, `Glyph`) —
no new CSS in `globals.css`.

| route | file(s) | head |
|---|---|---|
| `/chat` | `components/ChatConsole.tsx`, `ChatShell.module.css` | `friday:~$ chat` · verdict = session count · kv: bots / profiles / devices |
| `/pipeline` | `components/PipelineBoard.tsx`, `Pipeline.module.css` | `friday:~$ pipeline` · verdict = record count · kv: active / attn / blocked · foot `▶ n live · ↻ n decide` |
| `/setup` | `app/setup/page.tsx`, `components/setup.module.css` | `friday:~$ setup` · verdict = paths set · kv: services / api keys / accent |
| `/deliverables` | `components/DeliverablesShelf.tsx`, `components/deliverables.css` | `friday:~$ deliverables` · verdict = artifact count · kv: verif / await / avail |

Every value comes from data the page already fetches (`/api/conversations` +
`/api/chat`, the pipeline radar envelope, `/api/setup` config, `/api/deliverables`);
nothing is fabricated. Values render `null` (blank) until their fetch resolves rather
than showing a placeholder number.

## Verified

Live DOM census against the built app after `npm run build` + service restart
(`systemctl --user restart mission-control`, active 17:13 PST), `.mc-widget`
total/visible and `scrollWidth - clientWidth`:

| route | 1440×900 | 412×915 |
|---|---|---|
| `/chat` | 1/1, overflow 0 | 1/1, overflow 0 |
| `/pipeline` | 1/1, overflow 0 | 1/1, overflow 0 |
| `/setup` | 1/1, overflow 0 | 1/1, overflow 0 |
| `/deliverables` | 1/1, overflow 0 | 1/1, overflow 0 |

Screenshots: `docs/screenshots/lane-e/{chat,pipeline,setup,deliverables}-{1440,412}.png`.

## Defect caught by the visual review

The `.mc-kv` key column is `7ch`, so `attention` / `verified` / `awaiting` /
`available` ellipsised to `atten…`, `verif…`, `await…`, `avail…` on the phone capture.
Labels shortened to `attn` / `verif` / `await` / `avail` (data unchanged). This is the
one thing DOM metrics did not catch — worth remembering that `7ch` is the budget.

## Still open (not this lane)

`/memory` 44×44 hit areas and graph tap gaps, `/crew`+`/bots` `Roster-module__…__rowTask`
overflow (plan §8.3 lanes F/G).
