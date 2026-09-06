# Task 1 — Fair-use burn band: plan-usage guard against the ChatGPT Plus ceiling

Repo: /home/mp/Documents/mission-control (start from CURRENT main HEAD — verify with `git log -1`; do NOT push when done)

## Context — why this exists

- The only billed subscription is **ChatGPT Plus** ($20 flat → Codex CLI).
- The home COST tile already shows monthly in-plan token burn (`components/HomeDeck.tsx`, ~line 121: `${formatCompact(planTokens)} in-plan tokens`), added in the 09-04 tasks — that part is DONE, do not rebuild it.
- Read on Sep 4: roughly **113M in-plan tokens burned in a single week-ish window**. Flat plans have fair-use ceilings that throttle without warning; the owner wants to see *distance to the ceiling* before he learns about it by hitting it.

## What to build

### A. Config: owner-settable ceiling (`data/config.json` + `lib/config.ts`)

- Add to the `billing` block:
  ```json
  "fairUse": {
    "codexTokens": 500000000,
    "note": "Owner estimate of ChatGPT Plus fair-use ceiling (tokens/month, Codex). Adjust as OpenAI changes policy."
  }
  ```
- `lib/config.ts`: bake a matching fallback (500M default) next to the existing `defaultPlan` fallback pattern so the view never crashes if config is missing.
- Threshold is an **estimate, not a published OpenAI number** — the UI MUST say "estimate" somewhere (subline or title attribute), never imply OpenAI confirmed 500M.

### B. Costs view: "FAIR-USE GUARD" band (`components/views/CostsPanel.tsx`)

New section **below** the "SUBSCRIPTION TOOLS — USE & KEEP" panel, **above** the raw daily tables:

1. **Burn bar** — horizontal bucket, 0 → `fairUse.codexTokens`, filled by `billing[0].codexTokens` (already in `data.costs`, do not add a collector or API route).
   - Color scale: teal under 70% → amber 70–90% → red ≥90% (existing mc cost-panel palette vocabulary; do NOT introduce a new color system).
2. **Trend tick** — 7-day daily cadence from the existing daily token map the costs collector already exposes (see the `daily`/`byDay` window in `lib/collectors/costs.ts`), rendered as a small sparkline or tick strip beside the bar so "is the burn accelerating" is answerable at a glance without a new data source.
3. **Verdict line** — one of three computed strings, no emoji:
   - `<70%`: `COMFORT · NN% of estimated ceiling`
   - `70–90%`: `WATCH · NN% of estimated ceiling`
   - `≥90%`: `THROTTLE RISK · NN% of estimated ceiling`

### C. Do NOT

- Do not touch `lib/collectors/costs.ts` if the daily + monthly token data is already present there (it is — verify first; only add fields if genuinely missing).
- Do not touch the home COST tile (done in 09-04).
- Do not add a new API route, no new dependencies.

## Verification gate

- `npm run build` green in an isolated worktree on the same filesystem (Turbopack rejects symlinked node_modules — hardlink copy or real dir on /home).
- `npm run typecheck` clean.
- Screenshot the /costs FAIR-USE GUARD section at a real data state; save to `.codex-handoff/artifacts/2026-09-05-fairuse.png`.
- Commit on main with a message ending in `(kanban fair-use 09-05)`.
