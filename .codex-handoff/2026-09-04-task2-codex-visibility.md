# Task 2 — Codex agent visibility on the office floor

Repo: /home/mp/Documents/mission-control (commit on main when done, do NOT push)

## Context

The office floor (`AgentActivity`) lights up a channel desk only when that agent
channel genuinely has work happening. Today the sources are: agent state DB
(sessions/messages), `who` (terminals), gateway state (platform connectivity).
See `lib/agent-activity.ts` and `lib/types.ts` (`AgentActivity` / `AgentChannel`).

We now want the same liveness signal for **OpenAI Codex CLI** (`codex` binary).
A Codex run is an independent agent channel that should light up the floor.

## Data source (verified, do not guess)

Codex writes rollout logs at:

    ~/.codex/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-<uuid>.jsonl

- Liveness = file mtime within the existing `LIVE_WINDOW_MS` (5 min) in
  `lib/agent-work.ts` — a Codex run appends lines as it works, so mtime is accurate.
- The model for a session is in the `session_meta` line (JSON, one per first line):
  `payload.base_instructions.provenance.model` (e.g. "gpt-5.6"), fallback
  `payload.model`, fallback "codex".
- `session_meta.payload.cwd` tells where it runs; useful for `currentTask`.
- `session_meta.payload.originator` (e.g. "codex_exec") — display as task context.

## Scope

1. `lib/agent-activity.ts`: add a `codex` channel to `CHANNELS` (place it after
   `cli`, before `desktop` — or wherever reads most naturally in the floor order).
   Add a `readCodex(now)` function that:
   - Recursively walks `~/.codex/sessions` (bounded: only files mtime < 1 hour old,
     then cap at 100 files) using `fs.glob` or manual recursive readdir.
   - For each in-window file: read the FIRST LINE ONLY (session_meta) for the
     model + cwd. That's enough for visibility; don't parse the whole rollout.
     Use `fs.open` + a small fd read, or just read the first ~4KB and JSON.parse
     the first line (the first line is small).
   - Return `{ live: number; model: string | null; cwd: string | null; lastActivityAt: string | null }`.
   - Degrade to empty on any error (missing dir, unreadable, bad JSON) — same
     contract as the other readers.
   - Wire it into the channel map: `live: result.live > 0`, `kind: 'building'` when
     live (Codex is a coding agent — it builds), `sessionCount: result.live`,
     `lastActivityAt`, `model`.
   - For `connected`: derive from whether any codex session exists at all
     (`sessions.length > 0`) so the desk shows it exists even when idle.

2. `lib/types.ts`: no change needed if `AgentChannel` already carries `model` and
   `connected` (it does). If you need a new field to show the cwd/task, add it to
   `AgentChannel` as optional.

3. `data/agents.json`: add a new agent entry for Codex so the office floor roster
   includes it. Match the existing shape exactly:
   - id: "codex", name: "Codex", role: "Deep Build Agent", station: "Deep Work",
     room: "DEEP WORK BAY", accent: "#f97316" (orange, matches OpenAI/Codex brand),
     model: "gpt-5.6 / codex", status: "idle", signal: null, currentTask: null,
     lastRun: null.

4. UI: find where `AgentActivity` / the office floor channels are rendered (search
   for `AGENT_CHANNELS` or `channels` in app/). The codex entry should render
   automatically since it comes from the API — but if the roster is hardcoded in
   the UI rather than driven by `data/agents.json`, add it there too. Do not change
   the visual style, just make sure the new channel shows.

## Verification

- `npx tsc --noEmit` clean.
- Run the app briefly (or hit the API route that serves AgentActivity) and confirm
  the response includes a channel with `id: "codex"`. You can trigger a real codex
  run in a temp dir to test liveness:
    `cd $(mktemp -d) && git init && codex exec "print hello" &`
  Then curl the activity endpoint and confirm `live: true` appears within 5 min.
  If you can't start the dev server easily, call the collector function directly
  in a tsx file you delete after.
- `git commit` on main: "office: add Codex agent channel to floor activity"
  Do NOT push.

## Style

- Match sibling file conventions (header comment block, no inline comments unless
  non-obvious, node: builtins, no new deps).
- Bounded scan, degrade-to-empty.
- Do not touch files outside scope.
