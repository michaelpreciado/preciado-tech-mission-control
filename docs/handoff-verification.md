# L3 Codex handoff verification — t_42c9c083

Status: partial (implementation complete; release gates unverified).
Base: 2501810 on hermes-impl/agent-chooser-sessions. Predecessor authorization
accepted; no board commands, messages, merge, push, or dependency changes.

## Behavior

`POST /api/handoff` accepts `{sessionId, agent: "codex", task}` and optional
`sourceAgent`, `profile`, `device` to disambiguate the originating local session.
The configured `chat.agents` entry must enable the Codex CLI. The API uses the
server cwd, rejects caller-supplied directory/CLI fields, and shares one
process-wide Codex busy guard with chat (409 while occupied).

A private temporary brief inside the repository contains the objective, last
12 user/assistant messages (bounded), cwd and constraints. It explicitly starts
a NEW agent context. The argv is `codex exec -s workspace-write -C <server cwd>
--add-dir <brief dir> -- <prompt>`. No resume/continue flags are used. `/tmp`
outputs require an explicit path in the task; other writes are restricted by
the brief to the declared cwd. The CLI's workspace-write sandbox remains active.

The report contains actual process exit status (null for spawn failure or
signal termination), bounded combined stdout/stderr tail of at most 20 lines,
and Git diff stats before/after against the pre-run HEAD plus untracked paths.
Stats explicitly include pre-existing/concurrent changes; they are not proof
of task completion. New commits during the run remain visible against that
baseline. Temporary briefs are cleaned up. Timeout is 180 seconds.

ChatConsole's conversation Actions menu offers Hand off to Codex. The resulting
system card is kept under the originating conversation even during thread
switches, with running/done/failed state. Cards live in the mounted console's
state, not the originating agent's native history; reload discards them.
The busy guard assumes one server process, matching the existing chat design.

## Commands and observed results

- `npm run typecheck && npm test`: typecheck passed; tests exited 1.
  Test-runner summary is file-level in this sandbox (not individual assertions):

```text
ℹ tests 26
ℹ suites 0
ℹ pass 24
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0

✖ failing tests:
test at tests/agent-adapters.test.mjs:1:1
✖ tests/agent-adapters.test.mjs
  'test failed'
test at tests/handoff.test.mjs:1:1
✖ tests/handoff.test.mjs
  'test failed'
```

- `node --import ./tests/helpers/ts-resolve.mjs tests/handoff.test.mjs`:
  brief/argv, malformed body/origin/cwd refusal, and real route-handler 409
  tests passed. Runner integration stopped at fixture setup:
  `Error: spawnSync git EPERM`, syscall `spawnSync git`, argv `init -q`.
  Do not count subprocess evidence/cleanup/timeout assertions as passed.
- `node --import ./tests/helpers/ts-resolve.mjs tests/agent-adapters.test.mjs`:
  five assertions passed; existing subprocess test failed with
  `Error: Pi returned no reply` at `lib/agent-adapters.ts:34`.
- `node --import ./tests/helpers/ts-resolve.mjs tests/handoff-card.test.mjs`:
  1 test passed, rendering all three card states and escaped content through
  React server rendering. This does NOT verify a browser interaction.
- `codex --version` and `codex exec --help`: both blocked at the mise shim:
  `mise ERROR Failed to install aqua:openai/codex@latest: Read-only file system (os error 30)`.
  Installed version and session/continuity flag availability are UNVERIFIED,
  not asserted unsupported. No installation/bypass was attempted.
- `./node_modules/.bin/next dev -H 127.0.0.1 -p 4187`: exited 1 with
  `Error: listen EPERM: operation not permitted 127.0.0.1:4187`.
- `curl --max-time 5 -sS -X POST http://127.0.0.1:4187/api/handoff -H 'Content-Type: application/json' -d '{"sessionId":"unverified","agent":"codex","task":"create file /tmp/mc-handoff-test.txt containing OK-20260914"}'`:
  exit 7, `Failed to connect to 127.0.0.1:4187`.
- `git diff --check`: passed.

## Hermes rerun required

Outside the sandbox: verify CLI help/version, rerun typecheck/tests, enable
Codex in operator config if necessary, and start the dev server on a spare
port (never 4176). Select a real local Hermes/Pi conversation; hand off the
explicit `/tmp/mc-handoff-test.txt` task with a fresh timestamp. Verify content
on disk, normalized report, and inline browser card; delete that file afterward.
Test a simultaneous second request for HTTP 409 and directory-field refusal
via HTTP. No real Codex execution, timestamp file creation/cleanup, or live
browser gate is claimed by this lane.

## Commit blocked

`git add .gitignore lib/handoff.ts lib/agent-adapters.ts app/api/handoff/route.ts components/ChatConsole.tsx components/HandoffCard.tsx tests/handoff.test.mjs tests/handoff-card.test.mjs docs/handoff-verification.md`
and `git commit -m "feat(chat): add Codex handoff with process evidence reports"`
both failed (exit 128):

```text
fatal: Unable to create '/home/mp/Documents/mission-control/.git/worktrees/mc-hermes-impl/index.lock': Read-only file system
```

No commit was created. This is Git's linked-worktree metadata location; no
command was run in the live checkout. No sandbox bypass was attempted.
Hermes must stage and commit the nine implementation/test/documentation files
listed above outside this sandbox. The pre-existing next-env.d.ts change is
not part of this lane and must remain excluded.
