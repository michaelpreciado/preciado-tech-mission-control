# Task 4 — Single ChatGPT Plus plan + "worth keeping" tool-usage panel

Repo: /home/mp/Documents/mission-control (commit on main when done, do NOT push)

## Context — what changed for the owner

- No Claude Pro / Claude Max anymore. Exactly ONE subscription exists now:
  **ChatGPT Plus** (flat $20/month), which powers Codex CLI.
- Claude Code is still being USED (it has 100M+ tokens of logged history under
  ~/.claude/projects), but it is NOT what the owner wants billed as a Claude plan.
  Codex usage already self-reports `plan_type: "plus"` in its session logs.
- The cost page must let the owner compare **Codex vs Claude Code real usage**
  to decide if each tool is worth keeping.

## Part 1 — Fix the plan attribution (config)

`data/config.json` → `billing` block:
- Keep `"2026-07"` and `"2026-08"` exactly as they are (they are historical
  facts about months that already passed).
- Add `"2026-09": { "plan": "ChatGPT Plus", "amount": 20 }`.
- Change `"defaultPlan"` to `{ "plan": "ChatGPT Plus", "amount": 20 }`.

`lib/config.ts` — the baked-in fallback (around line 260–262, the
`file.billing?.defaultPlan ?? { plan: 'Claude Pro', amount: 20 }` default and
any per-month subscription defaults right next to it): update the fallback
`defaultPlan` to `{ plan: 'ChatGPT Plus', amount: 20 }`. Leave the historical
month entries in the fallback as-is if they exist, but make the CURRENT and
future default ChatGPT Plus.

Do NOT touch the collector logic in `lib/collectors/costs.ts` for the plan —
it already reads from config. The rollup will then name the current month
"ChatGPT Plus" automatically.

## Part 2 — "Worth keeping" comparison panel in the costs view

`components/views/CostsPanel.tsx` — add a new section (below the existing
billing/plan area, above the raw daily tables) titled something short like
**"SUBSCRIPTION TOOLS — USE & KEEP"** comparing the two CLI tools side by side
using data already in `data.costs`:

For each tool (Claude Code, then Codex):
- **Name row**: `Claude Code` / `Codex`
- **30-day tokens** (sum of the trailing 30 days of `daily`) — the "how much am
  I actually getting" number, big and prominent.
- **All-time tokens** (from `totalTokens`).
- **Sessions**: Codex uses `codexUsage.sessionsCount`. Claude Code has no
  sessionsCount field — add one: in `collectClaudeUsage()` in
  `lib/collectors/costs.ts`, count distinct session files (each `.jsonl` under
  `~/.claude/projects/**` is one session; the walk already enumerates them) and
  expose it as `claudeUsage.sessionsCount` (add to the type in `lib/types.ts`
  with a one-line comment "session file count over all history").
- **Last active**: `daily` last entry date for Claude; `lastActivityAt` for
  Codex. Show `Xd ago` style (repo already has a relative-time helper somewhere
  — reuse it; if none, a 3-line `timeAgo()` in the component is fine).
- **Top model**: first entry of `models`.
- **Codex only**: show `planType` (it will read `plus`) as a small tag, e.g.
  `via ChatGPT Plus`.
- A one-line **delta line** under the two cards: e.g.
  `Claude Code: 41.2M tokens this month · Codex: 3.9M · Claude Code is the
  heavier workload` — compute which is larger dynamically, handle the equal/zero
  cases without crashing.

Style: follow the section/card conventions already in CostsPanel (same panel
chrome, same type scale, dark theme, no new fonts). No markdown tables — the
component renders divs/spans. Keep it legible at a glance: the 30-day number is
the hero, everything else is small supporting text.

If a tool's collector returned nothing (missing/empty), render the card with
dimmed "no usage logged" text rather than breaking the layout.

## Verification

- `npx tsc --noEmit` clean.
- Run the collector standalone (tsx script, same pattern as prior tasks) and
  confirm: `billing[0].plan === 'ChatGPT Plus'`, `planAmount === 20`,
  `claudeUsage.sessionsCount > 0`, codex `planType === 'plus'` still intact.
  Report those live values.
- Visual: start the dev server if it doesn't interfere (check ports 3000-3002
  first, use free port), load /costs, take a screenshot of the new section, OR
  at minimum confirm via the data path that all card fields resolve. A
  screenshot path in your report is a plus.
- `git commit` on main: "costs: single ChatGPT Plus plan + Codex/Claude tool-use comparison".
  Do NOT push.

## Report

Files changed, tsc result, live collector values (plan, planAmount,
claude sessionsCount, codex planType, 30-day tokens for each tool), screenshot
path if you got one, commit sha.
