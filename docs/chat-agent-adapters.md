# Chat agents (Lane 1)

Local chat sends use `/api/chat` and server-only `lib/agent-adapters.ts`.
The optional `agent` field accepts `hermes`, `pi`, or `codex`; omission selects
Hermes. Unknown agents return 400. Disabled/unavailable agents return 503.
Each agent has one in-process flight; a second send to that agent returns 409.
Different agents can run concurrently. Origin, authorization, rate limit,
4,000-character limit and 180-second timeout retain the existing API policy.
This is not a distributed lock or a detached job service.

## Configuration

`data/config.json` is local-only and gitignored. This worktree initially had no
config file; a minimal local chat configuration was created without reading or
modifying the main checkout. To enable Pi on another installation, add:

```json
{
  "chat": {
    "command": "hermes",
    "agents": [
      { "id": "hermes", "command": "hermes", "enabled": true },
      { "id": "pi", "command": "/absolute/path/to/pi", "enabled": true },
      { "id": "codex", "command": "codex", "enabled": false }
    ]
  }
}
```

Merge these keys into an existing chat section, preserving profiles/remotes.
Without `agents`, only legacy Hermes is enabled. Malformed entries and duplicate
IDs are ignored. Hermes is always represented; its executable falls back to `chat.command`
when omitted from the list. `FRIDAY_CHAT_COMMAND` retains precedence over both.
Commands are executable paths/names, not shell strings with embedded flags.

The picker stores `mc.chat.agent` in localStorage. Changing agents starts a
separate native session; it does not transfer history. Opening a conversation
selects its owning agent. The resume dropdown uses the existing conversation
index, which now includes native Pi sessions for the current project directory.
Hermes profile/device routing and remote conversation sends remain available.
Pi runs locally in the server's working directory; no remote Pi support is added.

## Verified native invocations

Run from `/home/mp/.worktrees/mc-hermes-impl` on 2026-09-13:

```sh
~/.local/bin/pi -p 'reply with OK'
# OK
~/.local/bin/pi --continue -p 'What exact word did you just reply with? Reply with that word only.'
# OK
~/.local/bin/pi --session-id 01a099e1-b567-7510-ae66-f31a4ce27ce2 -p 'What word have you replied with in this conversation? Reply with that word only.'
# OK
~/.local/bin/pi --session-id 28a3b8c2-38a9-4b19-a5a7-f5fa29d7d2ed -p -- 'Reply with OK only.'
# Warns that the ID is new, then returns OK
```

The Pi adapter uses `--session-id <UUID> -p -- <message>` for both creation and
continuation. The `--` protects prompts beginning with flags. It closes the
child's stdin: Pi otherwise waits for redirected input even in print mode.
The first live HTTP test exposed this and timed out; the fixed invocation
returned `L1-PI-OK` in 2,221ms, then recalled it in 3,572ms using the same UUID
`76904e0b-9d25-42e1-9603-f5133230eaf2`. Both responses were HTTP 200.

Pi sessions are read from its native project JSONL directory under
`~/.pi/agent/sessions/--<encoded-cwd>--`, honoring `PI_CODING_AGENT_DIR` and
`PI_CODING_AGENT_SESSION_DIR`. They are not copied into a second database.
Only text/tool-result content is shown; model thinking blocks are excluded.
Use the returned UUID with `pi --session-id <UUID>` from the same directory to
resume on the machine. `/chat?session=<UUID>` opens it in Mission Control.
Existing Hermes deep links continue to resolve through their profile/device.

Hermes legacy sends retain `--continue <session> -z <message> --cli`, including
the `friday-dashboard` fallback. A nonexistent session still fails as before.
The UI explicitly sends `createSession: true` for a new conversation, selecting
`hermes [--profile <profile>] chat --continue <name> --create-if-missing
-q <message> --oneshot --cli -Q`, verified against installed `hermes chat --help`.
The new-session test returned `L1-HERMES-OK`. A subsequent POST with no `agent`
or `createSession` field returned exactly `L1-HERMES-OK` (HTTP 200, 8,980ms),
confirming the legacy default path.
The returned name can be continued; the conversation index exposes native IDs.

Codex is disabled in the picker with “session continuity unsupported”. Its
adapter supports only an explicitly enabled, send-only `codex exec -- <message>`
API invocation. Requests with a Codex session are rejected; no Codex continuity
or handoff is claimed. The installed Pi provider was used as configured; Lane 1
does not change its model or add the later lane's local-model integration.

## Recovery and checks

Unavailable CLI: check the configured executable and agent credentials on the
server, then restart after correcting CLI availability (probes are cached).
409: wait for that agent's flight to finish. A timeout returns 502 and releases
the flight. No browser abort is presented as cancelling native agent work.

Validation uses `npm run typecheck && npm test` in this worktree, a temporary
Next dev server on port **4199**, and real curl POSTs. Port 4176 and the main
checkout are not used. Browser checks cover a 412×915 viewport (document width
412, composer width 386), Codex disabled/tooltip, stored Pi selection, native Pi
deep links, and desktop layout. No gateway, Telegram, Herdr, handoff, theme, or
durable-job work from later lanes is included.

Final gate results: `npm run typecheck` exited 0; `npm test` reported **250 tests,
250 passed, 0 failed, 0 skipped**. The browser confirmed both Hermes and Pi in
the conversation index, restored Pi after reload, loaded Pi's native thread via
its session deep link, and measured document widths of 412 and 1440 at the
corresponding viewports. Temporary screenshots: `/tmp/mc-l1-412.png` and
`/tmp/mc-l1-desktop.png`.
