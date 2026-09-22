# Living Command Mesh — Adversarial QA Matrix

**Parent:** `t_0cfcfa2e`  
**Owner:** Debugger  
**Status:** approved verification contract  
**Execution:** W6 after implementation and baseline reconciliation

## Baseline and source truth

- Capture `git status --short`, commit/branch, and dirty-file manifest. Prove no active Chat files or `app/globals.css` were overwritten. Save `qa/<card>/baseline.txt`.
- For every graph node, edge, and gauge, fixture one canonical source row, event, or worktree and assert displayed ID, title, assignee, status, branch, host, model, value, unit, and freshness equal the source.
- Cover duplicate IDs, missing assignee, unknown status, malformed timestamps, empty/zero sources, and more than 400 rows.
- Do not create synthetic nodes or metrics.
- Compare API JSON to direct source snapshots from the kanban DB, Herdr, event bus, and git worktrees. Save raw JSON and comparator output.
- Verify stable IDs across refresh, reconnect, and reorder.
- Verify a Herdr pane keeps its node ID for that pane lifetime but is not treated as durable identity after pane recreation.
- Verify worktree IDs derive from repository and worktree realpaths rather than branch names; two worktrees on the same branch must remain distinct.
- Compare `git worktree list --porcelain` with separate bounded status probes. Never infer a clean worktree from the inventory alone.
- Verify `/api/agent-graph` exposes no secrets or raw terminal output.
- If a source is unavailable or stale, show explicit source state and freshness. Never display `live` or zero as false truth.
- Zero active agents must still render a useful trunk and empty state.

## SSE lifecycle

- Run `curl -iN --max-time 8 /api/events` and assert `200`, `text/event-stream`, `no-cache`, `no-transform`, keep-alive behavior, and no buffering. Capture headers plus the first frame or keepalive.
- EventSource open means live. Inject named task and agent events and assert one UI update per event.
- Malformed JSON, keepalives, and comments must be ignored without killing the stream.
- Duplicate, out-of-order, and unknown event IDs must not regress state.
- `since=<last id>` reconnect replay must deduplicate and preserve state. Save the event log and browser console.
- Verify a no-cursor connection starts at the current maximum ID, while cursor replay is capped at 1,000. A truncated replay must trigger authoritative snapshot reconciliation rather than imply a complete history.
- Assert monotonic `(origin, event_id)` handling across duplicate, reordered, delayed, and replayed named frames.
- When the event bus is killed or unreachable, transition the UI to stale/offline while retaining last-known truth.
- Recovery must return to live and reconcile missed events.
- Client unmount must close EventSource without listener or timer leaks. Instrument constructor/close and heap/listener counts.
- Verify upstream abort follows browser disconnect using server evidence.
- Multiple tabs must keep independent streams without cross-tab duplicate mutation.

## Lifecycle and states

- Create a disposable task and agent and record source IDs and timestamps.
- Observe `spawned`, `claimed`, and `running` without reload. Branch energy must appear only on the correct node. Capture event timestamps, API snapshots, DOM state, and ARIA.
- Complete the task. Assert the terminal event clears open/running state, preserves one settled historical node, links evidence to task/run/branch, and leaves no stale running badge after two refreshes and reconnects.
- Test `blocked`, `timed_out`, `crashed`, `protocol_violation`, and uncertain Herdr startup.
- Failure must use semantic red plus a text/shape label, never color alone.
- Retry must not duplicate a spawn. An uncertain pane remains visible with a warning.
- Busy/409 actions must be idempotent with no double claim.
- Race tests: done before progress, progress after done, reconnect during spawn, duplicate done, and task reassignment. Final state must be monotonic and agree with the authoritative snapshot.

## Stale, offline, and error behavior

- Freeze heartbeat beyond 180 seconds for stale and beyond 300 seconds/no last-seen for offline.
- Test exact clock boundaries at 179999, 180000, 300000, and 300001 milliseconds.
- A running task with a stale stream must not appear healthy/live.
- Test Herdr unavailable, kanban 500 or invalid JSON, event bus 401/503, and a partially failed graph source.
- Each failure gets a localized alert and retry while preserving last truth, with no uncaught console errors.
- Source availability is per-source. One failed collector must not blank unrelated nodes or gauges.
- Verify retry recovery.

## Terminal-tail privacy and control threat tests

- Unauthenticated, cross-origin, wrong bearer, trusted/untrusted IP tail requests must receive the correct 401/403 behavior.
- Rate limiting must return 429 plus `Retry-After`.
- Assert no raw stdout, stderr, path, or secret appears in error envelopes, graph endpoint, logs, DOM, or URL.
- Inject ANSI, NUL, shell metacharacters, absolute paths, `TOKEN=`, bearer-like strings, HTML event payloads, and more than 100 KB of output into a controlled Herdr tail.
- Assert control characters are stripped, output is bounded to the last 100 KB, HTML remains text, and no credentials, paths, or CLI diagnostics leak.
- Verify target regex, lines 1 through 200 bounds, distinct-tail cap at 64/65, and concurrent identical tails sharing one read.
- Spawn, prompt, rename, and send-keys validation must reject flag-like names, relative cwd, invalid model/name, and unsupported keys before subprocess execution.
- Assert argv-array execution with the exact target and no shell. Stop sends only `ctrl+c`.
- Preserve request/response, sanitized server log, and DOM evidence.

## Security release blockers

External and remote deployment is fail-closed until groups A-H pass.

### A. Anonymous route sweep

- Enumerate every GET/POST route from source and probe it from an external unauthenticated client. Only intentionally public login/auth/health routes may succeed.
- Sensitive conversations, task detail, agent activity, events, vault, relay, graph, Herdr reads, and control mutations must return 401/403 without opening a stream or returning sensitive metadata.
- Valid session/bearer access must succeed only within the caller's ownership/profile/device scope.

### B. Proxy identity spoofing

- Exercise direct-socket and trusted-proxy matrices with spoofed `X-Forwarded-For`, `X-Real-IP`, Host, forwarded Host, and Origin values.
- Only the socket peer or final explicitly trusted proxy may establish client identity. Missing/unknown addresses must never become loopback.
- Verify valid proxy chains only when the final hop matches `MC_TRUSTED_PROXIES`.

### C. CSRF and browser mutation boundary

- Test foreign, null, missing, ambiguous, and same-origin Origin/Host combinations against every browser mutation.
- Canonical approved hosts pass; foreign, ambiguous, and missing identity fail according to the documented non-browser exception policy.

### D. Relay and event-bus confinement

- Verify each allowlisted path/method succeeds and blocked auth/config/secret/admin/arbitrary paths return 404 without upstream contact.
- Unauthorized SSE/relay requests fail; stream lifetime, idle timeout, reconnect, per-client limits, and concurrency/rate-limit behavior are deterministic.
- Assert server bearer tokens and forwarded auth headers never appear in responses, logs, errors, browser telemetry, or SSE frames.

### E. Spawn and destructive-action approval

- Approved worktree roots succeed only with a valid one-time human approval token and produce one audit event.
- Reject `/etc`, other users' homes, traversal, symlink escapes, unapproved roots, unknown executables/models/providers, shell wrappers, unauthenticated requests, destructive prompts/actions, and approval-token replay.
- Resolve allowlisted executables to approved absolute binaries and keep execution argv-only.

### F. Tail isolation and hostile-output handling

- Deny cross-task/cross-owner pane access. Enforce documented byte, line, rate, and concurrency caps.
- Redact secret fixtures and sensitive paths. Render injected instructions and HTML inert; never promote terminal text into a system/developer instruction.
- Require explicit confirmation before copied terminal output can enter a prompt or control action.

### G. Secret and metadata scan

- Scan API bodies, SSE, browser DOM/telemetry, PDFs/artifacts, sanitized logs, and production client bundles for bearer tokens, cookies, API keys, environment contents, raw stderr, home/vault/provider paths, SSH key paths, and unapproved service URLs.
- Verify errors use approved aliases and do not hydrate secrets into client code.

### H. Audit integrity and persistence

- Every login/logout/auth failure, approval, config write, spawn, prompt, send-keys, stop, focus, bot action, tail access, and relay produces exactly one redacted correlated audit record.
- Records include actor/session/device, target, repository/worktree alias, action, result, timestamp, request ID, and policy decision, but never prompt bodies, terminal text, credentials, cookies, environment values, Authorization headers, or raw child stderr.
- Restart the service and prove records persist; verify hash-chain or equivalent tamper/sequence detection.

### I-J. Required defense-in-depth coverage

- Remote SSH uses strict host-key verification, approved hosts/users/key aliases/database paths, bounded timeout, and no arbitrary command/path injection.
- Spawned agents cannot linger after task completion without an explicit marked state; stop/restart authorization and audit are verified.
- Verify distinct rotatable `MC_SESSION_SECRET`, shorter session TTL, logout/revocation, canonical host allowlist, production CSP/frame/referrer/permissions/HSTS headers, no-store on sensitive reads, and user/session/global quotas.

## Keyboard and accessibility

- Run keyboard-only coverage with Playwright/CDP.
- Tab order reaches trunk, nodes, detail/tail, and controls.
- Enter/Space select and activate. Escape closes the sheet and restores trigger focus.
- Focus must not escape a modal trap and must remain visible at 200% zoom.
- Add Arrow/Home/End navigation if the tree interaction model implements it.
- No keyboard-only action may be hidden behind hover or drag.
- Accessibility snapshot must show tree role/name/state, status through text/ARIA rather than color, non-spamming live/stale/error announcements, labeled focusable terminal tail, labeled buttons/inputs, unique IDs, and no nested interactive controls.
- Axe result: zero serious or critical findings.
- Save AX tree, axe JSON, and focus trace.

## Reduced motion and low power

- Emulate `prefers-reduced-motion: reduce` and the app low-power flag.
- Disable CSS animation, transition, and rAF energy pulses while retaining spawn, running, completed, failure, and directional meaning through static labels and edges.
- Save computed styles and before/after DOM.
- Verify no flashing.

## Pixel Fold and responsive geometry

- Test 390×844 and 390×915 at DPR 1 and 3, plus folded/unfolded states.
- Assert `document.documentElement.scrollWidth <= clientWidth`.
- Keep every primary action, node, and detail sheet within the viewport.
- No clipped labels. Minimum interactive target is 44×44 CSS pixels.
- Terminal tail wraps or scrolls internally.
- Composer and fixed navigation must not overlap.
- No horizontal page scroll.
- Cover long IDs/titles, zero nodes, 20 or more nodes, error/stale banners, and an open detail sheet.
- Save geometry JSON and screenshots.
- Regression widths: 412×915, 768×1024, and 1440×900.

## Performance and resilience

- Seed 0, 10, 100, and 500 nodes plus 1,000 events.
- Measure first graph paint, SSE-to-DOM latency, long-task count, heap after ten minutes/reconnect cycles, retained-event cap, idle/reduced-motion rAF, and documented polling timers.
- Suggested gates: no more than 50 retained events per agent and no more than 400 total; no event-burst long task over 200 ms; no unbounded DOM/listeners; 100 events in one second remains responsive.
- Save Chrome trace, performance metrics, and console.

## Full build and service gates

- After baseline reconciliation, run `npm run typecheck`, `npm test`, and `npm run build`. Capture exact stdout, exit codes, and test count.
- Record the actual listening PID, command, working directory, bound port, service unit, and deployed SHA before every route sweep. `package.json` defaults to port 4175 while the approved live service is port 4176; a sweep against 4175 does not prove the live deployment.
- Make the isolated validation port and production port explicit in every artifact and reject evidence whose base URL, PID, or SHA does not match the intended instance.
- Start the built service on an isolated port if production restart approval is unavailable.
- Verify expected status and content type for `/`, `/kanban`, `/chat`, `/system`, `/costs`, `/pipeline`, `/memory`, `/api/agent-graph`, `/api/herdr`, and `/api/events`.
- Verify no 5xx or browser console errors and that the built CSS contains the mesh selectors.
- Jarvis restarts `mission-control.service`, records service status, journal tail, listening port, and deployed SHA, then repeats the route sweep at `http://100.79.84.9:4176/`.
- Live lifecycle proof must be disposable and cleaned up: create task/agent, record source and event IDs, observe spawn through completion, capture DOM/API/SSE evidence, then stop, close, delete, or archive it and prove no residue.
- Never claim deployed/live without URL, route status, and build SHA.

## Evidence bundle

Every gate records:

- command
- UTC timestamp
- exit code
- exact raw response or event log
- source snapshot
- expected-versus-actual comparator
- screenshot and geometry where visual
- browser console
- cleanup record

Fail closed when evidence is missing.

## Existing risks to recheck

- `qa/t_8bd97d7c-qa-findings.md` documents SSE raw-path leakage and `HERMES_HOME` profile fallback.
- `lib/herdr-bridge.ts` already bounds and sanitizes tails; verify the exact behavior rather than reimplementing it.
- `lib/telemetry.ts` defines 180-second stale, 300-second offline, and 40/400 retention caps.
- `/api/events` may idle-stream upstream failures. Test its actual semantics rather than assuming an HTTP error.
- `useSubAgentTelemetry` owns an EventSource and 15-second staleness tick, while `KanbanBoard` currently has separate 15-second polling and its own EventSource. Instrument fetches, EventSource construction/closure, and state updates to prove the mesh does not duplicate refreshes, listeners, or connections. Consolidate into a shared source when implementation permits, and verify unmount cleanup.
