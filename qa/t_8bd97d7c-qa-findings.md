# /chat adversarial QA — session 1 (t_8bd97d7c)

Harness: `/home/mp/Documents/mission-control/scripts/audit-chat.mjs` (real-gesture, CDP touch drag),
plus focused probes `scripts/qa-debug-chat.mjs`, `scripts/qa-scroll-probe.mjs`, `scripts/qa-touch-probe.mjs`.
Server under test: live MC on `127.0.0.1:4176` (cwd `/home/mp/Documents/mission-control`).
UI findings are against the build that was live at 18:45–19:20 — the four chat-rebuild lanes
(shell/mobile/typography/android) were still mid-flight in worktrees, so the UI pass must be
re-run after they land.

## Confirmed by real execution

### B1 (high) — 502 `detail` can name the WRONG cause, because stdout diagnostics are dropped
Repro:
```
hermes -m definitely-not-a-model:xyz --provider ollama chat --continue qa-cli-probe-190240 \
       --create-if-missing -Q --query-file - < /tmp/q.txt
# exit=1
# stdout: Warning: Unknown toolsets: messaging, moa, rl
#         Custom endpoint didn't answer after 3 attempts — ...
#         Provider said: HTTP 404: model 'definitely-not-a-model:xyz' not found
# stderr: Session 20260921_190240_6fa373 found but has no messages. Starting fresh.
#         session_id: 20260921_190240_6fa373
```
Same request through the API:
```
curl -s -X POST http://127.0.0.1:4176/api/chat -H 'content-type: application/json' \
  -d '{"message":"hi","agent":"hermes","session":"qa-argv-185847","model":"definitely-not-a-model:xyz","provider":"ollama","createSession":true}'
# 502 {"error":"agent run failed — Session 20260921_185848_1e0512 found but has no messages. Starting fresh. ...",
#      "detail":"Session 20260921_185848_1e0512 found but has no messages. Starting fresh. ..."}
```
Expected: the surfaced detail names the real failure (unknown model / HTTP 404).
Actual: `app/api/chat/route.ts` sanitizes only `err.stderr` (`sanitizeCliStderr`), so the only
actionable line (on stdout) is discarded and a benign informational stderr line is shown as the cause.

### B2 (high) — the SSE chat path leaks raw local paths to the browser
Repro:
```
curl -sN -X POST http://127.0.0.1:4176/api/conversations/does-not-exist-qa123 \
  -H 'content-type: application/json' -d '{"message":"hi","profile":"default"}'
# event: done
# data: {"ok":false,"error":"[HERMES_HOME fallback] HERMES_HOME is unset but active profile is 'jarvis'.
#        Falling back to /home/mp/.hermes, which is the DEFAULT profile — not 'jarvis'. ...
#        (see issue #18594)\nhermes -z: agent failed: session not found: does-not-exist-qa123"}
```
Expected: same redaction posture as `/api/chat` (`[path redacted]`, no internal issue numbers).
Actual: raw absolute path + internal issue reference reach the client. `lib/conversation-actions.ts`
returns `detail.trim().slice(0,500)` with no `sanitizeCliStderr` call anywhere on this path.

### B3 (high) — the SSE send path spawns `hermes` without `HERMES_HOME` → writes to the wrong profile
Evidence: the B2 response itself (`HERMES_HOME is unset but active profile is 'jarvis' … falling
back to /home/mp/.hermes, which is the DEFAULT profile`). `lib/agent-adapters.ts::sendAgent` passes
`HERMES_HOME` explicitly; `lib/conversation-actions.ts::build()` does not (opts are only
`{timeout, stdio, cwd}`). The `/chat` streaming send (ChatConsole line ~376) therefore lands sessions
in the default profile store instead of the active profile.

### B4 (medium) — CLI warnings are rendered as chat reply text
`POST /api/chat {model:"gemma4:12b", provider:"ollama", session:"qa-model-e2e", createSession:true}` →
200 in 149s, `reply = "Warning: Unknown toolsets: messaging, moa, rl\nPONG"`. The adapter's
`textReply = stdout.trim() || stderr.trim()` keeps CLI noise in the bubble.

### B5 (scope decision, not a bug) — model picker
`GET /api/models` → `{current:{deepseek/deepseek-v4.1-flash,openrouter}, groups:[CURRENT, LOCAL · OLLAMA
(5 models incl. gemma4:12b), OPENROUTER]}`. End-to-end through the Home picker path
(`HomeChat.tsx` posts `{model, provider}` to `/api/chat`): verified — picked `gemma4:12b`/`ollama`
reached argv (`-m gemma4:12b --provider ollama`, proven by the negative control in B1 where the CLI
itself reported `model 'definitely-not-a-model:xyz' not found`) and a reply arrived.
Gap: `/chat` has NO picker. `components/ChatConsole.tsx` never calls `/api/models` and its send
(line ~390) posts no `model`/`provider`; the shell lane's spec makes the header chip display-only.
The QA-matrix item "model picker end-to-end" therefore needs either a picker in `/chat` or an
explicit ruling that it means the Home picker.

### B6 (medium) — error-status semantics on `/api/chat`
`{session:"qa-argv-proof"}` with no such session → 502 (server fault) rather than 404/409;
`{createSession:true}` on a session that exists but is empty → 502 "found but has no messages".
Clients cannot distinguish "bad input" from "backend down".

## Passing (real execution)
- `GET /api/models` 200, three groups, no credentials in the body.
- 400s are specific: `model id has an unexpected character`, `model override is not supported for this agent`,
  `message required`.
- 409 busy: two concurrent sends on `agent=hermes` → second returns
  `409 {"error":"agent is already handling a message — wait for it to finish"}`.
- 502 does carry `detail` on the failure paths exercised, and `sanitizeCliStderr` redacts
  `key=value` credentials, `ENV_VAR=value`, URLs and posix paths (unit-level read of `app/api/chat/route.ts:41`).
- 502/200 real send: `POST /api/chat` with `-m gemma4:12b --provider ollama` returned `PONG`
  in 149s with continuity `{mcConversationId, hermesSession, profile:"default", selector:"name"}`.

## UI / gesture pass (current live build, pre-rebuild)
4 viewports (412×915, 768×1024, 375×812, 1440×900), boot overlay suppressed deterministically,
staged taps roster→conversations→thread, real CDP touch drags.
- 0 high findings: no horizontal overflow of `.mc-main` at any width, no element spilling past the
  viewport right edge, nothing hidden behind the fixed bottom nav, composer fully in-viewport and
  reachable (`elementFromPoint` returns the textarea) at 412/768/1440, and the composer survives
  scrolling a 300-message thread.
- Thread panes open at the newest message and scroll back through history with a real finger drag.
- Open observation: rAF rate while scrolling a 300-message thread under headless chromium measured
  1–37/s; the app's animated background dominates that number, so it needs a real-device measurement
  before it is treated as a chat regression.

## Harness lessons (encoded in the script)
1. `Input.synthesizeScrollGesture` (touch mode) does NOT scroll this app's panes: on the same page a
   manual `Input.dispatchTouchEvent` drag moved the thread 245px while the synthetic gesture moved it
   0px. The harness synthesises the drag itself.
2. The launch film (`sessionStorage['mc:boot:w2i']`) races every probe — set it before navigation.
3. The thread is bottom-anchored, so a downward *page* swipe cannot move it; only a finger drag that
   pulls history back can. A one-direction gesture test reports false failures.
4. The console is staged (`data-stage` = roster → conversations → thread); reaching the composer
   needs two real taps, and the roster's bot rows bounce the stage back if tapped as if they were
   conversations.
5. Playwright is not installed in `node_modules`; the harness resolves it through a symlink to
   `/home/mp/.hermes/hermes-agent/node_modules/playwright` (remove before packaging).