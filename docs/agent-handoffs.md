# Mission Control agent handoffs

Lane 2 verification: 2026-09-13 (America/Los_Angeles), task `t_1e2c647b`.
Base: `131bc3b` on `hermes-impl/agent-chooser-sessions`. The orchestrator
authorized this base without merging main. All commands below ran from
`/home/mp/.worktrees/mc-hermes-impl`; the live checkout was not used.

## Invocation contract

- Hermes: inherited from Lane 1. Existing turns use
  `hermes [--profile <profile>] --continue <session> -z <message> --cli`.
  Creation uses `hermes [--profile <profile>] chat --continue <session>
  --create-if-missing -q <message> --oneshot --cli -Q`.
  Lane 2 did not repeat Hermes inference; see [Lane 1 evidence](chat-agent-adapters.md).
- Pi: `pi --session-dir <absolute-directory> --session-id <UUID> -p -- <message>`.
  Lane 1 already implemented this except for the explicit session directory.
  The installed CLI help confirms that an exact ID is created if missing.
  The same UUID selects subsequent turns. The adapter closes stdin so print
  mode receives EOF and returns trimmed stdout; stderr alone is not a reply.
  Execution uses `execFile` argument arrays, with no shell interpolation.
- Codex: inherited send-only `codex exec -- <message>`; continuity remains
  unsupported and the picker remains disabled. Not verified in Lane 2.

Pi runs in the server's cwd. Both sender and native JSONL reader now resolve
the same absolute session directory: `PI_CODING_AGENT_SESSION_DIR`, or
`<PI_CODING_AGENT_DIR-or-~/.pi/agent>/sessions/--<encoded-cwd>--`.
Use absolute environment paths (shell `~` expansion does not happen inside
environment values). Different worktrees have different default stores.
Resume outside MC with the same cwd/directory and UUID; `--continue` alone
selects the latest session in that directory, not necessarily the MC thread.
The application uses exact IDs to avoid that ambiguity. No history is
transferred between agents. Pi sessions remain native JSONL, not a second DB.

The index and resume options display Pi UUIDs. After a successful new send,
the resume selector follows its indexed UUID instead of showing “New session”.
Pi enablement, availability probing and reply labels are inherited from Lane 1.
`--version` availability means the executable runs, not that inference auth works.

## Fresh live attempts: blocked before inference

These attempts preceded the adapter changes. No credential contents were
inspected or copied, and no home-directory write permission was requested.
Only the session directory under this worktree was created.

```sh
mkdir -p .verification/pi-sessions
PI_OFFLINE=1 PI_TELEMETRY=0 /home/mp/.local/bin/pi \
  --session-dir "$PWD/.verification/pi-sessions" -p -- \
  'Remember the marker L2-COPPER-731. Reply with that marker only. Do not use tools.' </dev/null
```

Exit 1: settings loading tried to create `~/.pi/agent/settings.json.lock` on
the read-only filesystem, then reported “No API key found for the selected model.”
An explicit provider/model was tried to bypass the unavailable default settings:

```sh
PI_OFFLINE=1 PI_TELEMETRY=0 /home/mp/.local/bin/pi \
  --provider openai-codex --model gpt-5.4 \
  --session-dir "$PWD/.verification/pi-sessions" -p -- \
  'Remember the marker L2-COPPER-731. Reply with that marker only. Do not use tools.' </dev/null
PI_OFFLINE=1 PI_TELEMETRY=0 /home/mp/.local/bin/pi \
  --provider openai-codex --model gpt-5.4 \
  --session-dir "$PWD/.verification/pi-sessions" --continue -p -- \
  'What marker did I just ask you to remember? Reply with that marker only. Do not use tools.' </dev/null
```

Both exited 1: “Credential store read failed for openai-codex” because Pi
tried to create `~/.pi/agent/auth.json.lock` on the read-only filesystem.
Neither produced a model reply. This does not establish provider/model readiness
or continuity, and these flags were not added as application defaults.

## Concrete skill reuse attempt

The existing Hermes skill
`~/.hermes/skills/software-development/codebase-inspection/SKILL.md` describes
repository metrics using pygount. The installed Pi help supports a file path
as `--append-system-prompt`. The exact attempted handoff was:

```sh
PI_OFFLINE=1 PI_TELEMETRY=0 /home/mp/.local/bin/pi \
  --provider openai-codex --model gpt-5.4 \
  --session-dir "$PWD/.verification/pi-sessions" \
  --append-system-prompt /home/mp/.hermes/skills/software-development/codebase-inspection/SKILL.md \
  -p -- 'Use the appended codebase-inspection skill to count lib/pi-sessions.ts with pygount. Work only in /home/mp/.worktrees/mc-hermes-impl. Do not install anything or access secrets. If pygount is unavailable, report that and stop.' </dev/null
```

Exit 1 with the same credential lock error, before any skill/tool execution.
`command -v pygount` also found no executable. No installation was attempted.
This is a reproducible attempted handoff, **not a working skill reuse claim**.

## Validation and remaining gates

`npm run typecheck && npm test` passed with `TMPDIR` inside this worktree.
The initial sandboxed run suppressed child-process stdout (also reproduced
with a standalone `execFile` of `console.log(42)`); rerunning with normal
child-process access passed. Tail:

```text
ℹ tests 251
ℹ suites 0
ℹ pass 251
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Regression coverage checks shared directory resolution, literal prompt argv,
stdin EOF, malformed JSONL rows/content, and rejecting empty Pi stdout instead
of treating a startup warning as a successful reply.

A temporary Next dev server used `127.0.0.1:4198` (never 4176), with
`PI_CODING_AGENT_SESSION_DIR="$PWD/.verification/pi-sessions"` and worktree-local
`TMPDIR`. Playwright opened `/chat`, waited for hydration, clicked NEW and
selected Pi. At 412×915, document width was 412px; picker rectangles were
`x=25, width=342, height=44` and `x=25, width=362, height=44`. The screenshot
was visually checked: both controls fit without horizontal overflow.
No UI message was sent: allowing the server to listen does not authorize Pi
to write locks outside the worktree. Evidence is retained locally under
`artifacts/l2-verification/` (ignored, not committed).

Fresh live Pi reply, same-session recall, successful skill execution, and a
real UI send with its new UUID in the index remain **unverified**. The readonly
home restriction prevents Pi startup; do not infer these gates passed from
Lane 1 evidence or unit fixtures. Rerun them in an execution environment that
can satisfy Pi's lock requirement within the authorized filesystem scope.
