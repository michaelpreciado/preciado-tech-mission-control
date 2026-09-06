# Task 3 — Surface in-plan token burn on the home COST tile

Repo: /home/mp/Documents/mission-control (commit on main when done, do NOT push)

## What we want (small, tight scope)

The home page's COST status tile (`components/HomeDeck.tsx`, `StatusTiles()`)
today shows money only:

    const billing = data.costs?.billing?.[0]
    const costMonth = billing ? `$${(billing.planAmount + (billing.openRouterUsd ?? 0))...}` : '—'
    ...
    { key: 'cost', label: 'COST · THIS MO', glyph: '$', value: costMonth, sub: costSub, ... }

The `billing[0]` row already carries `claudeTokens` and `codexTokens` (added in
the Codex costs task). Add a compact in-plan token-burn cue so the home tile
answers "how hard am I using my subscriptions this month" without a trip to /costs.

## Exact change

In `StatusTiles()` in `components/HomeDeck.tsx`:

1. Derive the combined in-plan token count for the current month:
       const planTokens = billing ? (billing.claudeTokens ?? 0) + (billing.codexTokens ?? 0) : 0
   (Guard with `billing` so it's 0 when the rollup is absent.)

2. Fold it into the `sub` line. Keep the existing freshness + local-saved logic,
   and only append the token cue when `planTokens > 0`. Suggested shape (you may
   adjust wording to fit the tile width, keep it SHORT — this is a compact tile):
       - no tokens → unchanged (`⚠ data Nd old` / `this month · local saved $X` / `this month`)
       - with tokens → append ` · ${formatCompact(planTokens)} in-plan tokens`
   Use a compact formatter (e.g. 31.2M / 1.4K). The repo has a token-formatter
   elsewhere (check `lib/conv-format.ts` or wherever `tok()` lives — see the
   Codex costs work) — reuse it or write a 4-line compact helper. Do NOT invent a
   new global util in a shared file for this one tile.

3. Do not change the `value` (still the money figure) or the label. Only the sub
   line grows. Keep `tone` logic unchanged (staleness still wins).

## Constraints

- ONE file: `components/HomeDeck.tsx`. If you must add a tiny local helper, keep
  it in that file (module-scope), don't touch shared libs.
- Reuse the existing billing rollup — do not call a new collector or fetch.
- Match surrounding style (no comments unless non-obvious, existing tone/key/
  label conventions).
- If `billing` has no `codexTokens` (older type shape), `?? 0` handles it — keep
  it defensive.

## Verification

- `npx tsc --noEmit` clean.
- Render check: start the dev server OR call the data path — confirm when
  `billing[0].claudeTokens/codexTokens` are non-zero, the home COST tile sub
  line reads like `this month · local saved $N · 31M in-plan tokens` (or your
  compact variant) and when they're zero it stays exactly as before.
- `git commit` on main: "home: show in-plan (claude+codex) token burn on cost tile"
  Do NOT push.

## Report

When done: files changed, tsc result, the exact sub-line string you render for a
non-zero and a zero case, and the commit sha.
