# Mission Control: Living Command Mesh

**Owner:** Jarvis  
**Approved direction:** Michael granted full creative control  
**Target:** `http://100.79.84.9:4176/`  
**Repository:** `/home/mp/Documents/mission-control`  
**Design system:** Blue Matrix Glass with Preciado Tech periwinkle compatibility  
**Execution:** multi-agent review plus isolated Codex CLI lanes

## Goal

Turn Mission Control into a useful living operating system for Preciado Tech, not a decorative dashboard.

The centerpiece is a real-time animated **Agent Worktree**. Jarvis is the command trunk. Every bot, Codex lane, task, branch, and completion appears as a live node and luminous branch backed by real Herdr, Hermes kanban, git worktree, system, cost, pipeline, and event-bus data.

ASCII is used as an information language: meters, sparklines, heatstrips, utilization rails, state diagrams, and terminal frames. No hand-drawn filler or fake telemetry.

## Product pillars

1. **COMMAND**
   - What needs Michael now
   - Approvals, blocked work, failures, and active missions
   - One obvious path from signal to action

2. **CREW**
   - Every Hermes bot and spawned coding agent
   - Live model, role, host, state, task, branch, elapsed time, and output
   - Animated spawn, work, handoff, completion, and failure states

3. **PIPELINE**
   - Leads, previews, outreach, approvals, deposits, delivery, care plans
   - Revenue and conversion signals without vanity metrics

4. **SYSTEMS**
   - Machine, GPU, memory, disk, services, gateways, model routing, and costs
   - ASCII gauges beside precise values and trends

5. **MEMORY**
   - Conversations, decisions, artifacts, source freshness, and recent completions
   - Traceability from a visible result to its task, agent, branch, and evidence

## Creative direction

### Visual language

- Near-black atmospheric base: `#050506` to `#0A0A0B`
- Blue Matrix Glass surfaces with restrained cyan system light
- Existing Preciado Tech periwinkle remains the brand accent where already canonical
- Hairline borders, terminal corner ticks, scanline texture, dim data rain, fine neural connectors
- Three ink levels only: bright, mid, faint
- Motion is calm and informative: energy flows toward active nodes; completed branches settle; failures pulse semantically red
- No rainbow charts, gamer neon, fake 3D clutter, aggressive glitching, or decorative ASCII doodles

### Agent Worktree

A responsive SVG/DOM or WebGL-assisted tree that remains legible on mobile:

- `JARVIS` command trunk at the root
- First-level branches for business pillars and task parents
- Agent nodes grow beneath their assigned task
- Codex worktree nodes show branch, model, effort, files owned, and gate state
- New agents animate from seed to node when Herdr or the event bus reports creation
- Running work carries a slow directional energy pulse
- Handoffs visibly transfer along branches
- Completion blooms once, then becomes a quiet historical node
- Failure uses semantic red plus a shape/state label, never color alone
- Clicking a node opens the existing Herdr-style panel with status, live terminal tail, task evidence, and controls
- Reduced-motion mode shows the same state without animation

### ASCII telemetry

Use the existing real-data primitives and extend them into a coherent layer:

- `[████████░░░░] 67%` meters for CPU, RAM, VRAM, disk, context, and budget
- `▁▂▃▅▇█` sparklines for cost, tokens, tasks, leads, and uptime
- density heatstrips for activity and model usage
- compact state rails such as `QUEUE > CLAIM > RUN > VERIFY > SHIP`
- gauges always include exact numeric values, units, labels, captions, and freshness

### Chat

- Converge the existing Chat Console with Herdr agent panels
- Left rail: agent roster and health
- Center: terminal-framed conversation stream
- Right/detail sheet: model, host, task, branch, context, live tail, and handoff controls
- One composer, no duplicate input paths
- Preserve session continuity and the current request-cancellation safeguards

## Current constraints

- `main` is ahead of `origin/main` and has an active uncommitted Chat QA/polish set.
- Those files must not be overwritten or stashed without reconciliation.
- Several existing worktrees are active. New lane paths and branch names must be unique.
- `app/globals.css` is coordinator-owned and currently dirty. Feature lanes use route/component CSS modules only.
- Codex lanes cannot bind or curl the app. Jarvis performs live measurements and service verification.
- The live service is healthy on port 4176. Herdr is available but currently has zero active panes.

## Workstreams and ownership

### W0. Baseline custody and integration map

**Owner:** Friday + Forge review, Jarvis integration  
**Model:** no code lane until the active Chat work is classified

- Inventory dirty files, active worktrees, branch lineage, and tests
- Identify which changes belong to the current Chat QA wave
- Preserve all user work
- Establish a clean integration base or a verified dependency order

### W1. Agent Graph data contract

**Owner:** Codex Lane Data  
**Model:** `gpt-5.6-luna`  
**Reasoning:** high

New files only where possible:

- `lib/agent-graph.ts`
- `lib/collectors/agent-graph-tasks.ts`
- `lib/collectors/git-worktrees.ts`
- `app/api/agent-graph/route.ts`
- `tests/agent-graph.test.mjs`

Responsibilities:

- Normalize Herdr agents, the approved `/api/bots` roster, per-task Hermes state, event-bus events, and git worktree metadata
- Keep service and test profiles out of the visible roster
- Query per-task and run rows directly; the existing `collectKanbanActivity()` aggregate is not a graph source
- Collect `git worktree list --porcelain` from a fixed configured repository root with a bounded timeout and sanitized display paths
- Probe dirty state separately with bounded `git -C <worktree> status --porcelain`; porcelain worktree inventory does not report dirtiness
- Use source-scoped node IDs: `mesh:root`, `profile:<name>`, `herdr:pane:<pane-id>`, `kanban:<origin>:task:<task-id>`, `kanban:<origin>:run:<run-id>`, and `git:worktree:<sha256(repo-realpath + NUL + worktree-realpath)>`. Pane identity is stable only for that pane lifetime; branch names are attributes, never identity.
- Deduplicate deterministic edges as `<parent-id>-><child-id>:<kind>`
- Emit explicit `fresh`, `stale`, or `unavailable` source state with `observedAt` and `ageMs`; omit unknown fields rather than fabricating values
- Use Kanban 2-5 second, Herdr 2 second, git 10-15 second, and existing remote-board 30 second cache semantics unless measurements justify a documented change
- No secrets or raw terminal contents in the graph endpoint
- Exclude raw event payloads, task bodies/comments, prompts, command lines, terminal tails, credentials, and absolute sensitive paths. Any recent-events list must be bounded and allowlist fields only.
- Return partial source failures without converting the whole graph route into a 500
- Deterministic fixtures and tests for named SSE topics, replay truncation, duplicate/out-of-order IDs, source failure, secret scrubbing, stable IDs across reorder/reload, task/run/profile/worktree edges, empty Herdr, and source-count comparison

### W2. Living Agent Worktree UI

**Owner:** Codex Lane Visual  
**Model:** `gpt-6-astra`  
**Reasoning:** medium

New files only:

- `components/AgentWorktree.tsx`
- `components/AgentWorktree.module.css`
- `components/agent-worktree-types.ts`

Responsibilities:

- Responsive animated tree using real graph props
- Blue Matrix Glass styling
- Branch energy, spawn, completion, failure, selection, and focus states
- Keyboard navigation and accessible labels
- Reduced-motion and low-power behavior
- No global CSS edits

### W3. ASCII Signal Instrumentation

**Owner:** Codex Lane Instruments  
**Model:** `gpt-6-astra`  
**Reasoning:** medium

New files only:

- `components/SignalInstruments.tsx`
- `components/SignalInstruments.module.css`
- `tests/signal-instruments.test.mjs`

Responsibilities:

- Reusable labeled meter, sparkline, heatstrip, queue rail, and freshness badge
- Real values only, no fabricated samples
- Correct units, captions, and ARIA semantics
- Compact phone variants and reduced motion

### W4. Integration and route composition

**Owner:** Forge-directed Codex integration lane  
**Model:** `gpt-5.6-luna`  
**Reasoning:** high

Runs only after W0-W3 are reviewed.

- W4 exclusively leases `app/kanban/page.tsx` and every route-composition file it touches; no parallel lane may edit those files
- Mount the Agent Worktree prominently on `/kanban`
- Connect to `/api/agent-graph` and `/api/events`
- Reuse the selected-node Herdr panel rather than building a second control path
- Add signal instruments to Home, Kanban, System, Costs, Pipeline, and Memory only where they answer a real operational question
- Keep route ownership and CSS modules partitioned

### W5. Chat convergence

**Owner:** Dum-E + Forge-directed Codex lane  
**Model:** `gpt-6-astra` for presentation, `gpt-5.6-luna` for API/state changes  
**Reasoning:** medium/high

Runs after the current uncommitted Chat QA set is landed or explicitly reconciled.

- Preserve the existing dirty Chat work
- Match Herdr panel hierarchy and live-tail behavior
- Keep one composer and current abort/race protections
- Expose task, branch, model, and host context without leaking secrets

### W6. Verification and deployment

**Owner:** Debugger, Dum-E QA, Jarvis final gate

- `npm run typecheck`
- `npm test`
- `npm run build`
- restart `mission-control.service` from the main checkout
- verify `/`, `/kanban`, `/chat`, `/system`, `/costs`, `/pipeline`, `/memory`, `/api/agent-graph`, `/api/herdr`, `/api/events`
- desktop geometry and 390px mobile geometry
- no horizontal overflow
- keyboard navigation and focus order
- reduced-motion verification
- real lifecycle proof: create an agent/task, observe spawn/running, complete it, observe settled state
- compare displayed counts against source data

## Agent assignments

- **Friday:** machine state, worktree safety, build/service/restart plan
- **Forge:** architecture, contracts, and integration sequencing
- **Dum-E:** visual direction and responsive interaction critique
- **Debugger:** adversarial QA and truth checks
- **Tinker:** event-bus, Herdr, git-worktree, and live-data feasibility audit
- **Sage:** source map, documentation, and Obsidian build record
- **Scout:** business usefulness and pipeline decision signals
- **Pepper:** privacy, authorization, terminal-tail, and control-surface threat review
- **Jarvis:** product decisions, lane briefs, merge judgment, visual measurement, deployment, and final acceptance

## Merge and file-safety rules

- Do not touch the active dirty Chat files from parallel lanes.
- `app/globals.css` has one writer: Jarvis after lane review.
- Each Codex lane owns an isolated worktree and disjoint file list.
- No lane pushes, merges, restarts services, sends messages, or changes secrets.
- Every lane leaves work reviewable and reports exact tests.
- Jarvis reads every diff and verifies every claim.
- Main is rebuilt after merge before service restart.

## Documentation and evidence records

Extend existing canonical documentation rather than duplicating it. The shipped system will add:

- `docs/architecture/mission-control-living-command-mesh.md` — architecture decision record, graph contract, lifecycle, ownership, and integration order
- `docs/architecture/living-command-mesh-data-provenance.md` — UI field to collector/API/source/cache/freshness/privacy matrix
- `docs/visual/living-command-mesh-visual-grammar.md` — Blue Matrix Glass, node and edge states, ASCII instrumentation, motion, accessibility, and anti-patterns
- `docs/operations/living-command-mesh-runbook.md` — custody, lane boundaries, merge order, deploy, rollback, stale-source diagnosis, and lifecycle smoke tests
- `docs/evidence/2026-09-21-living-command-mesh-build-record.md` — exact build, test, route, source-truth, geometry, lifecycle, deployment, and limitation evidence
- `docs/architecture/README.md` — short index only

The final Obsidian inbox note is written only after deployment and links to these records. It must include the deployed URL, commit, verification state, evidence paths, and explicit unverified items without copying raw telemetry, terminal output, secrets, or full source prose.

## Audit locks before implementation

- Reconcile and verify the existing Chat QA/polish wave before creating Living Mesh writer lanes. Preserve all tracked and untracked evidence; do not reset, stash, or blindly cherry-pick overlapping worktrees.
- Seed the graph from Kanban, Herdr, and bounded git-worktree snapshots. The event stream is a transition/invalidation source, not a complete initial snapshot.
- Consume the event bus's named SSE topics (`task.created`, `task.assigned`, `task.progress`, `task.done`, `task.failed`, `agent.status`) and reconnect with `since=<last id>`. Default `message` listeners alone are insufficient.
- Preserve monotonic `(origin, event_id)` cursors, deduplicate replay, and reconcile snapshots after reconnect because replay is capped at 1,000 and a connection without `since` starts at the current maximum event ID.
- Reconcile Herdr spawn acknowledgements with a targeted snapshot because Herdr creation is not currently published to the Kanban event bus.
- Refresh git worktree metadata and dirty-state probes in one bounded batch per TTL. Never poll per node and never infer worktree identity from branch text alone.
- Use one shared EventSource/application store. Coalesce affected task IDs for 250-500 ms with bounded detail-fetch concurrency; snapshot only on initial load, reconnect, and mutation acknowledgment. The 15-second staleness timer remains client-only.
- Use deterministic scoped IDs: `mesh:root`, `profile:<name>`, `herdr:pane:<pane_id>`, `kanban:<origin>:task:<task_id>`, `kanban:<origin>:run:<run_id>`, and a hash of repository plus worktree real paths.
- Mark every source independently as fresh, stale, or unavailable. A partial collector failure must not blank unrelated nodes or manufacture zero values.
- Before remote deployment, close the security P0s: default-deny sensitive APIs and SSE, trustworthy client-IP handling, strict relay allowlists, approved-root and approval-token spawn policy, pane/task-scoped redacted tails, path minimization, and append-only redacted control-plane audit records.

## Security hardening contract

This lane runs after the clean W0 baseline and before W1. External or remote deployment remains on hold until all seven P0 controls and QA groups A-H pass.

1. **Default-deny sensitive routes.** Apply the Mission Control session/bearer gate to sensitive reads, writes, and streams, including conversations, Hermes task detail, agent activity, events, vault, upstream relay, graph, and Herdr controls. Add ownership/profile/device scope where a global login is insufficient.
2. **Trust only verified network identity.** Determine client identity from the socket peer and explicitly configured final trusted proxies. Never treat missing/unknown addresses as loopback and never trust client-supplied forwarding headers directly.
3. **Constrain relay and event bus.** Use a fixed upstream origin, strict path/method allowlists, bounded stream lifetime/idle behavior, concurrency and rate limits, and no token/header reflection. Block auth, config, secret, and admin relay paths.
4. **Protect spawn and destructive controls.** Restrict cwd to approved repository/worktree roots after realpath/symlink checks; allowlist absolute agent executables, models, and providers; require an explicit one-time human approval token; reject replay; keep execution argv-only.
5. **Treat terminal output as hostile data.** Scope panes to their owner/task, lower and enforce byte/line caps, redact known secret/path patterns, rate-limit access, render output inert, and require confirmation before copying it into prompts or actions.
6. **Minimize metadata.** Replace absolute paths, provider/service URLs, SSH key locations, environment-file paths, and infrastructure details with approved aliases unless an explicitly authorized local-only view requires them.
7. **Persist redacted audit events.** Record one append-only event for login/logout/failure, configuration writes, approvals, spawn, prompt, send-keys, stop, focus, bot actions, tails, and relays. Include actor/session/device, target, repository/worktree alias, action, result, timestamp, request ID, and policy decision. Exclude prompt bodies, terminal text, credentials, cookies, environment values, Authorization headers, and raw child stderr; provide tamper/sequence detection and restart persistence.

P1 immediately follows P0: use a distinct high-entropy rotatable `MC_SESSION_SECRET`, shorter revocable sessions, canonical host/origin checks, security response headers, user/session/global quotas, SSH host-key and remote-path allowlists, and server-policy-controlled model/provider selection.

## Acceptance criteria

1. A real spawned agent appears in the tree without page reload.
2. A real running task visibly energizes the correct agent/branch.
3. A completed task settles with verifiable evidence and no stale running state.
4. Every displayed gauge is tied to a named source, unit, value, and freshness.
5. The tree remains useful with zero active agents and with many agents.
6. Chat reads and behaves like the Herdr bot panel system while preserving continuity.
7. Desktop and Pixel Fold layouts have no clipping or hidden primary actions.
8. Reduced-motion mode retains all state meaning.
9. Typecheck, tests, build, live route sweep, and source-truth comparisons pass.
10. The deployed result is verified at `http://100.79.84.9:4176/`.
11. Anonymous-route, proxy-spoof, CSRF, relay/SSE, spawn approval, tail isolation/redaction, secret-scan, and audit-persistence suites pass with retained evidence.

## Rollout

1. Preserve and classify the current dirty baseline.
2. Reconcile, test, and land the existing Chat QA/polish baseline without losing overlapping lane work.
3. Run the security hardening lane against the clean baseline and pass its route/auth/privacy tests.
4. Run W1-W3 as isolated, disjoint Codex lanes.
5. Review with all specialist agents and integrate accepted pieces in W4.
6. Run W5 as a narrow convergence pass, not a replacement Chat implementation.
7. Run the complete W6 gate and deploy once.
8. Record the shipped architecture and evidence in Obsidian and Mission Control.
