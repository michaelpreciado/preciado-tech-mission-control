# Task 1 — Codex usage into the costs dashboard

Repo: /home/mp/Documents/mission-control (commit on main when done, do NOT push)

## Context you must know

This codebase already tracks agent LLM usage across providers. The cost dashboard
(`lib/types.ts` `CostDashboard`) has a `billingMode` spine: `metered` / `subscription`
/ … Each mode is reported on its own terms and NEVER added across modes. See the
`modes` array in `CostDashboard` and `billingMode()` in `lib/collectors/costs-usage.ts`.

Claude/Max usage is already wired (`claudeUsage` field + collector). We now need the
same treatment for **OpenAI Codex CLI** (`codex` binary, v0.149.1).

## Data source (verified, do not guess)

Codex writes rollout logs at:

    ~/.codex/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-<uuid>.jsonl

One JSON object per line. Verified shapes (from real files):

1. Session header — line with `"type":"session_meta"`:
       payload: { session_id, timestamp (ISO), cwd, originator, cli_version, source,
                 model_provider, base_instructions: { text, provenance: { type:"model", model:"gpt-5.6" } } }
   The model runs is `base_instructions.provenance.model`. `session_meta` may also
   carry a `model` field at the top level in some versions — read both, prefer
   `base_instructions.provenance.model`, fall back to `payload.model`.

2. Token usage — lines with `"type":"event_msg"` and `payload.type === "token_count"`:
       payload.info.total_token_usage:    { input_tokens, cached_input_tokens,
                                             cache_write_input_tokens, output_tokens,
                                             reasoning_output_tokens, total_tokens }
       payload.info.last_token_usage:     { same shape, per-turn }
       payload.info.model_context_window: number
       payload.rate_limits: { plan_type: e.g. "plus", primary: { used_percent,
                             window_minutes, resets_at }, ... }

   One token_count event fires per turn/model-call. Accumulate `last_token_usage`
   per session; `total_token_usage` is the running session total (do NOT sum it
   — it double-counts).

3. Plan/pricing: Codex runs on an OpenAI subscription. Treat it EXACTLY like Claude
   Max: it is a flat/subscription plan. Report tokens, NOT money.
   - `plan_type` from any token_count event (e.g. "plus")
   - List-rate `notionalCostUsd` is optional; if you add it, compute it clearly and
     keep it OUT of `meteredCostUsd` / real spend.

## Scope

1. `lib/collectors/codex-usage.ts` (new):
   - `collectCodexUsage(now = Date.now())` → an object shaped like `claudeUsage`
     (models[], totalInputTokens, totalOutputTokens, totalCacheTokens, totalTokens,
     daily[{date, tokens, byModel}], monthlyTokens[YYYY-MM], plus codex-specific:
     planType: string|null, sessionsCount: number, lastActivityAt: string|null).
   - Walk ~/.codex/sessions recursively for `*.jsonl`. BOUND THE SCAN:
     only read files modified within the last 35 days (use fs stat, not mtime parse),
     and cap total files read (e.g. 500). Parse line-by-line with a try/catch so one
     bad line never kills the collector.
   - Track model per session from session_meta; if absent, label "codex".
   - Daily + monthly rollups keyed by the SESSION's day (session_meta timestamp),
     same convention as the Claude collector.
   - Degrade to empty (never throw), same contract as sibling collectors.

2. `lib/types.ts`: add `codexUsage?` to `CostDashboard` matching the shape above
   (optional field, mirrors claudeUsage).

3. `lib/collectors/costs.ts`: call `collectCodexUsage` alongside the other collectors
   (Promise.all) and attach it to the returned dashboard object. If it's part of the
   `subscription` billing mode rollup, add its token totals into that mode's
   `models`/`totalTokens`/`nonMetered` rollup the same way Claude/Max usage is
   folded in today — follow whatever pattern `claudeUsage` uses, do not invent a
   new one.

4. UI: find where `claudeUsage` is rendered on the costs view (search for
   `claudeUsage` in app/) and add a Codex panel with the same style/tone:
   - plan badge (plan_type), total tokens, sessions count, last activity
   - the daily sparkline/bar if the Claude panel has one
   - do NOT add Codex tokens to the metered cost figure anywhere.

## Verification (all must pass before you commit)

- `npx tsc --noEmit` clean
- `npm run build` (or the repo's build command) succeeds
- Run the collector standalone once (a tsx/tsx-file or a quick node script you delete
  after): print the object it returns. It must show non-zero tokens (there are 67
  real rollout files in ~/.codex/sessions) and a planType of "plus".
- `git commit` on main with a message like "costs: add Codex CLI usage collector (flat-plan tokens)".
  Do NOT push.

## Style rules (this repo is opinionated)

- TypeScript, node: builtins, no new npm dependencies.
- Keep the file header comment style (short "what/why" block) used by sibling files.
- No inline comments unless explaining a non-obvious judgment call.
- Every source degrades to empty rather than throwing.
- Do not touch files outside the scope above.
