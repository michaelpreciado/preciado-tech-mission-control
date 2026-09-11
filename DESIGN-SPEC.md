# W3B — Revenue Pipeline panel on Home

## Goal
Turn Mission Control Home into the business cockpit: a **REVENUE PIPELINE** section
that shows the money actually in motion — active leads, their $ offer, live preview
links, time-in-stage and follow-up deadline chips — with a one-click approval
control. It sits ABOVE System Metrics (the standing home directive) per the
reading order comment already in HomeDeck. Target audience: Michael, on M1,
mid-morning, deciding what to approve or follow up. Not a full board — the full
board lives at /pipeline.

## Ground truth (verified 09-09)
- Data: `/api/pipeline` GET already returns the full store (324 leads). Fields that
  exist on leads today: `id`, `business_name`, `stage`, `preview_url`
  (e.g. `https://preciado-tech.com/previews/baker-roofing.html`),
  `extra_data.offer_estimate` (number, e.g. 600), `extra_data.price_range` (string),
  `extra_data.next_action` (ISO string or null), `approval`
  (`{status: pending|approved|rejected, telegramSentAt}`), `first_seen_at`,
  `updated_at`. The 4 roofing leads (baker/carter/avalon/all-weather) are now at
  `awaiting_approval` with preview_url set. `in_development` has 1 lead
  (lead-roofing-modesto-pro), `completed` has 1.
- Write path: `POST /api/pipeline` with `{lead_id, stage, fields, detail}` via
  `lib/pipeline-data.ts` `upsertLead` — the single stored write path already used
  by the Telegram bridge. Do NOT add a second write path; extend THIS shape.
- UI patterns to copy: `components/PipelineBoard.tsx` (POLL_MS 12000, SkeletonPanel,
  fmtDate from `./ui`), `components/HomeDeck.tsx` (section composition),
  `HomeTasks.tsx` for compact card sizing. Design tokens: `--pt-*` in
  `app/globals.css` (periwinkle #9db4ec, dark surfaces, scanline/halo are page-level;
  do NOT add new global CSS files).
- Type home: `lib/types.ts` (`PipelineData`, `PipelineLead`, `PipelineStage`,
  `PipelineLeadApproval` — extend, don't fork).

## Deliverables
1. `components/RevenuePipeline.tsx` ('use client'):
   - Fetches `/api/pipeline`, polls 12s (same cadence as PipelineBoard).
   - Renders **only the pipeline that matters**: all `awaiting_approval` +
     `in_development` leads, plus up to 3 most recent `completed` (by updated_at).
     Footer line: `+315 more in the pipeline → /pipeline` (link).
   - Per-lead row/card (compact, one line each, stacked list):
     `▲ BUSINESS NAME` · stage glyph · **$ offer** (extra_data.offer_estimate ??
     price_range ?? '—') · `time-in-stage` (human: e.g. '2d', '5h') ·
     deadline chip (extra_data.next_action: past → red 'OVERDUE +2d'; future →
     amber `DUE 09-15`; absent → no chip) ·
     `◉ preview` link (preview_url, target _blank) if set ·
     approval state: pending → `⏳ AWAITING` chip; approved → `✓`; rejected → `✗`.
   - **Approval control**: on each `awaiting_approval` card, a small
     `Approve for send` / `Hold` pair (two mc-btn-size buttons). Approve sets
     approval to approved + writes extra_data.reviewed_at (call the new
     endpoint below, then refetch). Hold is a visual no-op (re-fetch) EXCEPT it
     writes `extra_data.reviewed_at` too with review status noted — keep it
     dumb, do NOT send email from the dashboard (email stays a separate
     approval-gated step in the Telegram bridge; the dashboard button records
     Michael's decision, the bridge does the send).
   - Sort: awaiting_approval first (oldest updated_at first), then in_development,
     then completed (newest first).
   - Skeleton: use `SkeletonPanel` exactly like PipelineBoard.
   - Empty state: nothing active → one dim line `No active revenue — pipeline is
     quiet.`
   - Zero new CSS files: inline styles / existing `mc-*` utility classes +
     `--pt-*` tokens only.
2. New route `app/api/pipeline/review/route.ts`:
   - `POST {lead_id, review: 'approved'|'held'}` (same origin + auth pattern
     copied from `app/api/pipeline/route.ts`): writes
     `extra_data.reviewed_at` (now) + `extra_data.review` + leaves
     `approval.status` on approved. Must use `upsertLead` from
     `lib/pipeline-data.ts` — read that file first and match its signature
     exactly. 404 on unknown lead_id, 400 on missing fields, 500 w/
     `logger('pipeline/review', err)`.
   - `GET {lead_id}` returns just that lead's record (so the UI can confirm its
     write).
3. HomeDeck: insert `<RevenuePipeline />` between `<HomeChat />` and the
   `overview` div. Update the `w2l-home-jumps` nav to add a
   `Revenue ↓` anchor. Match the existing comment about reading order.
4. `tests/revenue-pipeline.test.mjs`: node:test, ts-resolve helper (see sibling
   tests for the pattern) covering: the review route handler import path +
   field-shape logic (stage/approval transitions), time-in-stage format function
   (export it from the component or lib so tests can reach it), and deadline-chip
   classification (overdue/due/none). Do NOT mock fetch in a way that bypasses
   the real handler — keep it handler-level.

## Gates (all in the worktree)
`npm run typecheck` (0), `npm test` (all pass), `npm run build` (clean).
Proof required in the handoff note: grep the built chunk for `REVENUE PIPELINE`
literal + curl the review route on a temp port (`npm run start -- -p 4199`)
against a THROWAWAY lead id (use `lead-roofing-modesto-pro` for real POSTs so the
pipeline store stays truthful — it IS in_development, reviewed_at on it is fine).

## Non-goals
- No new global CSS, no new fonts, no 3D. No writing email sends here. No
  touching PipelineBoard (the full board stays its own page). No node_modules
  edits. No pushing to origin — merge to main happens by the reviewer.

## Style
Conventional commit, one commit max, branch already exists: revenue/w3b.
