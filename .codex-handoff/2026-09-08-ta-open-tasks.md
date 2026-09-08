# T-A · Home "Open tasks" section — transparency overhaul

WORK DIR: /home/mp/Documents/mission-control (main tree; TSC allowed: npx tsc --noEmit)
MODEL: gpt-6-astra, reasoning effort light, --yolo
Surgical scope: components/HomeTasks.tsx + components/HomeWorkspace.module.css ONLY.
Do not touch HomeSystem, HomeDeck, ActionFeed, HomeChat, kanban page, or any API route.

## Why
Michael's standing directive: every fix dispatched to codex must stay visible as an OPEN
task, and home must show active dispatches clearly ABOVE System telemetry
(the Open-tasks section already sits above System telemetry in DOM order — KEEP IT THERE).
Current defects (verified in live production render):
1. Header count `{snapshot ? tasks.length : '—'}` renders a literal dash and can flash
   wrong values; the "All clear" / loading states are fine, but the count must always show
   a real number once data loads.
2. Only 6 tasks, sorted blocked > running > todo, priority tiebreak. NO time context: a
   job dispatched 10 minutes ago looks identical to a todo from 3 days ago.
3. No visual distinction between "running" (agent actively working right now) and
   "todo" (queued) — that's the whole point of the section.

Task object shape from /api/kanban (live-confirmed): {
  id, title, status (todo|running|in_progress|blocked|failed|done|...),
  assignee (string|null), priority (int), createdAt (ISO str), startedAt (ISO str|null),
  lastHeartbeatAt (ISO str|null), consecutiveFailures (int), createdBy, origin, parentIds
}
Polling already exists (10s) — do not add a second fetch; reuse the snapshot state.

## HomeTasks.tsx changes
1. Count: keep header `<span>{tasks.length}</span>` but ensure it never shows "—"/0
   while loading (keep existing empty/loading states as-is).
2. Time-ago helper: `const ago = (iso?: string | null) => { if (!iso) return ''; const d = Date.now() - new Date(iso).getTime(); if (!Number.isFinite(d) || d < 0) return ''; const m = Math.round(d / 60000); if (m < 1) return 'now'; if (m < 60) return m + 'm'; const h = Math.round(m / 60); if (h < 24) return h + 'h'; return Math.round(h / 24) + 'd' }`.
3. Sort: running/in_progress first, then blocked/failed, then todo by priority.
   For running tasks use `lastHeartbeatAt ?? startedAt` as "last activity" for the label.
4. Show up to 8 tasks (was 6).
5. Each row: keep existing layout (dot / strong title / meta / arrow). Extend meta line:
   - running: `<span>{task.assignee || 'agent'} · running · {ago(lastHeartbeatAt ?? startedAt)} ago</span>` with a `data-running` attribute on the row's Link
   - blocked/failed: assignee · status
   - todo: assignee or 'unassigned' · queued · {ago(createdAt)} ago
6. Row state styling hooks (CSS handles the look):
   - running row: `data-state="running"`
   - blocked/failed row: `data-state="attention"`
   - todo: `data-state="queued"`
   Keep the existing `taskDot` with `data-attention` for attention rows; also give the
   dot `data-running` for running rows.
7. Empty/loading/error states: unchanged. Footer "See all N open tasks →" unchanged.
8. Keep `'use client'`, keep the `closed` set, keep the aria-labelledby structure.

## HomeWorkspace.module.css changes
Scoped to the hashed class names already in this file (tasks list + task rows + taskDot):
- `data-state="running"` row: a soft blue left border or tinted background (use
  `var(--pt-info)` at low alpha), dot pulses (existing keyframes if present, else add a
  2s opacity pulse), meta text uses the info color.
- `data-state="attention"` row: keep/extend current amber/red dot treatment; title stays
  high-contrast.
- `data-state="queued"` row: dimmer (opacity ~0.75), no pulse.
- Time-ago segments in meta: same style as the rest of the meta line, 11.5px (match
  current mobile sizing) — do NOT increase base font sizes.
- Mobile (existing @media block): keep single-column task rows, 13px titles, 11.5px meta
  as currently set. No new overflow: verify no element forces min-width.

## Done criteria
- `npx tsc --noEmit` clean.
- Render at 412x900 (phone) and 1280x900 (desktop): section appears ABOVE the "System
  telemetry" section; count shows the real open-task total; running task rows visibly
  pulse/tint, todos dimmer, blocked amber; time-ago strings present on running + todo rows.
- No console errors, no horizontal overflow at 412px.
- Commit: "feat(home): open-tasks transparency — live count, time-ago, running/attention/queued states"
