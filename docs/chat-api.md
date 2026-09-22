# Chat API contract (`/chat`)

Everything the chat surface calls, so the desktop page, the Android WebView and
any future TWA can be built against one written contract instead of reading the
route handlers. Route source lives under `app/api/`; shared policy lives in
`lib/mission-api.ts`.

Scope: the endpoints `components/ChatConsole.tsx`, `ChatContinuityFooter.tsx`,
`LiveChatMirror.tsx` and `HomeChat.tsx` actually call. The bot roster route is
listed because the chat's roster pane is its consumer. Nothing here is a
public API — this is a local-first dashboard, not a service.

## Page and PWA contract

`app/chat/page.tsx` renders `ChatConsole`. The `<head>` for `/chat` comes from
the root `app/layout.tsx`, so it is shared with the rest of the dashboard:

| Need | Where | Value |
| --- | --- | --- |
| Edgeless layout, safe-area insets | `viewport` in `app/layout.tsx` | `viewportFit: 'cover'` |
| Browser chrome colour | `themeColor` in `app/layout.tsx` | void black `#010407` |
| iOS standalone | `appleWebApp` in `app/layout.tsx` | `capable`, `statusBarStyle`, `title` |
| Android standalone | `other.mobile-web-app-capable` | `yes` |
| Install prompt / icons | `manifest` in `app/layout.tsx` | `/manifest.json` |
| Accent + background | `public/manifest.json` | `theme_color` cyan `#00d4ff`, `background_color` void black `#010407` |
| Maskable icon | `public/manifest.json` | `icon-192-maskable.png`, `icon-512-maskable.png` |

`display: standalone` + `launch_handler.client_mode: navigate-existing` mean a
WebView resume reuses the existing page rather than reloading it, which is why
the continuity keys below matter.

Metadata URLs (og:image, canonical) resolve against `metadataBase`, which reads
`MC_PUBLIC_ORIGIN` and falls back to the local dev origin. Set it to whatever
origin the dashboard is actually reached on (Tailscale name, LAN address, cloud
host) so a phone never receives `localhost` URLs in the page head.

### Relative paths and same-origin

Every request goes through `apiFetch` from `lib/api-base.ts` with a
root-relative path (`/api/...`). No chat component contains a host, port or IP:
a hardcoded `100.x` address is how a phone build silently stops talking to a
desktop one. The base is resolved at call time, highest wins:

1. `window.__MC_API_BASE__` — injected per request by `app/layout.tsx` from the
   server env `MC_API_BASE` (runtime knob, no rebuild; cloud mode sets
   `/api/upstream` so the relay proxies to the home instance);
2. `NEXT_PUBLIC_API_BASE` — build-time knob, for static/CDN hosts;
3. `''` — same-origin, the default and the safe fallback.

A base may be a path prefix (`/api/upstream`) or a full origin. Setting a
cross-origin base also requires extending `connect-src` in `next.config.ts`.
Everything in this document is written as the root-relative path; the base is
applied for you.

## Authorization posture

Two modes, decided per request in `lib/mission-api.ts`:

- **Unset `INTERNAL_API_SECRET`** — the caller IP must be loopback or inside
  `FRIDAY_TRUSTED_IPS`. This is the desktop + Tailscale case.
- **Set `INTERNAL_API_SECRET`** — every request needs
  `Authorization: Bearer <secret>`; IP is no longer consulted. Mobile clients
  that leave the trusted ranges use this.

Write endpoints (`POST`) additionally call `assertSameOrigin`: a browser request
carrying an `Origin` that does not match `Host` is rejected `403`. A missing
`Origin` (curl, server-to-server) is allowed. Rate limits are per-IP, per-route
and in-process — a restart clears them. They are not a fairness guarantee.

Ids and text are validated on every route: message text is trimmed and capped,
conversation/profile ids must match a conservative charset, and unknown JSON
fields are rejected rather than ignored where the route accepts a fixed shape.

## Endpoints

### `GET /api/chat` — agent availability and roster status

No body. Returns the configured agents and whether each CLI is runnable.

```json
{
  "available": true,
  "command": "hermes",
  "busy": false,
  "agents": [
    { "id": "hermes", "enabled": true, "available": true, "continuity": "session", "busy": false }
  ]
}
```

`available` mirrors the first configured agent (Hermes). Availability is probed
once per process (`<command> --version`, 15s timeout) and cached; a cached
"available" can go stale until the server restarts.

With `?session=<id>&profile=<name>` it instead returns
`{ "continuity": <record|null> }` — the Herdr/CLI continuity record for that
session. **This form is authorized** (401 without credentials) because the
record can name a Herdr pane; the roster form is not.

### `POST /api/chat` — send one turn

```json
{ "agent": "hermes", "session": "<id>", "message": "<text>", "profile": "<name>",
  "createSession": true, "model": "<id>", "provider": "<name>" }
```

- `agent` — `hermes` (default), `pi` or `codex`. Unknown → `400`.
- `session` — continuity key. `hermes` defaults to `friday-dashboard`; `pi`
  requires a UUID; `codex` rejects any session (`400
  session continuity unsupported`).
- `message` — required, trimmed, max **4000** chars.
- `model` / `provider` — per-turn override, **Hermes only**. Any other agent
  returns `400 model override is not supported for this agent`. The override
  goes into argv and never rewrites `config.yaml`.

Response `200`:

```json
{ "reply": "<text>", "continuity": { "...": "..." }, "elapsedMs": 4120,
  "session": "<id>", "agent": "hermes" }
```

`session` echoes the caller's id (or the generated one) and is absent for Codex.

Errors: `400` bad body/field, `401` unauthorized, `403` cross-origin,
`409` agent busy (one in-flight run per agent) or `Session lives in Herdr`,
`429` rate limited, `502` agent run failed or exceeded **180s** (killed), `503`
agent CLI unavailable on this machine. `502` bodies may carry a `detail` field
with a **sanitized** stderr tail — URLs, paths, credentials and env values are
redacted before they leave the server. Treat `detail` as diagnostics, not UI copy.

### `GET /api/models` — picker catalogue

Returns the models actually usable on this box, grouped. Cached ~60s
in-process. Sources that are absent contribute nothing rather than failing:
`config.yaml` `model:` block (group `CURRENT`), `ollama list`
(group `LOCAL · OLLAMA`), and the CLI provider cache (one group per provider,
capped at 60 ids each).

```json
{ "generatedAt": "2026-09-21T18:00:00.000Z",
  "current": { "model": "qwen3.8:27b", "provider": "ollama" },
  "groups": [ { "label": "CURRENT", "models": [ { "id": "...", "provider": "ollama", "note": "configured default" } ] } ] }
```

A model keyed by `provider::id`; the same id can exist on two providers. The
picker is an enhancement — if this call fails, chat still runs on the agent's
own configured default. `401` when unauthorized. No credential ever appears in
the response.

### `GET /api/conversations` — conversation archive

Query: `q`, `profile`, `device`, `agent`, `limit`. All optional.

```json
{ "generatedAt": "...", "conversations": [ { "id": "...", "profile": "...", "device": "...",
  "agent": "hermes", "title": "...", "preview": "...", "lastActiveAt": 0, "source": "...", "active": false } ],
  "devices": [ { "name": "...", "isLocal": true } ], "profiles": ["default"],
  "stats": { "...": "..." } }
```

`stats` describes the whole archive deliberately — it does not shrink while the
user types in the search box, so the intel panel stays stable. Read-only.

### `GET /api/conversations/[id]` — one thread

Query: `profile` (default `default`), `device`, `agent` (`pi` or `hermes`).
`id` must match `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$` or the route returns `400`.
Returns `{ id, profile, device, messages }`. Read-only. The client polls this
every 5s while a thread is open.

### `POST /api/conversations/new` — start a conversation (SSE)

Body `{ message, profile?, device?, model?, provider? }`. Used for a **remote**
device send (a Hermes profile on another machine). `model` and `provider` are
per-turn overrides passed to Hermes; they do not rewrite config. Message max
**8000** chars. `503` with a message when the agent CLI is not available on
that device. `409`-style concurrency is not used here; the CLI flight guard
still applies.

### `POST /api/conversations/[id]` — continue a conversation (SSE)

Body `{ message, profile?, device?, model?, provider? }`. Same stream shape. On
success the `done` event carries the full refreshed `messages` array, so the
client replaces the thread rather than appending.

**SSE event contract** (both routes, `text/event-stream`, `Cache-Control:
no-store`, `X-Accel-Buffering: no`):

| Event | Data | Meaning |
| --- | --- | --- |
| `start` | `{ profile, device }` | Stream accepted; agent run beginning |
| `heartbeat` | `{ elapsedMs }` | Every 5s while the run is alive |
| `done` | `{ ok: true, reply, profile, device }` or `{ ok: true, reply, messages }` | Completed |
| `done` | `{ ok: false, error }` | Agent run failed |

A stream that closes **without** a `done` event is an interrupted run, not a
success. The client must surface that explicitly (see retry, below) — do not
treat EOF as an empty reply.

### `GET /api/chats/live` — live pane mirror

Query `since` (ms epoch; `0`/absent = 5-minute lookback). Read-only; the live
pane polls ~3s. Returns `{ generatedAt, since, sessions }` with every recent
session across local profiles that has messages newer than the cursor.

### `GET /api/chats/[session]` — live pane detail

Query `profile`. Returns `{ session, profile, messages }` for one local session.
Read-only; used by the live pane's click-through.

### `POST /api/handoff` — seed a Codex work lane

Body: `{ sessionId, agent: "codex", task, sourceAgent?, profile?, device? }`.
`task` 1–4000 chars. Any other field is **rejected** — `cwd` is fixed to the
server repository and no caller-controlled directory or CLI argument is
accepted. The named session must exist locally exactly once (`404` otherwise),
Codex must be enabled in `chat.agents` (`503`), and a second concurrent handoff
returns `409`.

The response is a **process report**, not a task verdict:
`{ ok, exitCode, diffStat, outputTail }`. Exit code 0 means the process
returned; it does not mean the work is done or correct. The UI labels it that
way on purpose.

### `POST /api/herdr/agent` — continue in a Herdr pane

Body `{ op: 'continue-chat', session, profile, text }` (`text` ≤ 4000). The
session must already be registered by a local Mission Control Hermes send, else
`404 Send a local MC Hermes message first to register this session.` Herdr
content is private terminal output, so this route is gated harder than the rest:
same-origin **and** trusted IP/bearer, with separate read/write rate buckets.
Responses return terminal text — it may include a shell prompt or unrelated
prior output. The UI says so.

### `GET /api/bots` — bot roster

The Bot Mode roster: each local Hermes profile with model, gateway status,
session/message counts, last activity and its `[bot:<name>]` cron routines.
Read-only. The chat roster pane renders this data; mutate operations
(create/rename/delete) belong to `app/api/bots/actions` and are not part of the
chat contract.

## Session continuity

The `/chat` page survives reload, and the Android WebView being resumed from the
background, through two storage keys written by `ChatConsole`:

| Key | Store | Holds | Lifetime rule |
| --- | --- | --- | --- |
| `mc.chat.session` | `localStorage` | `{ agent, device, profile, id, mode }` — the last open thread and its mode | Standing place; survives tab close, like `mc.chat.model` |
| `mc.chat.draft:<conversationId>` | `sessionStorage` | Unsent composer text for that conversation | This tab only; never becomes a queue of stale text across browser restarts |

Related keys in the same family: `mc.chat.model` (`localStorage`, HomeChat model
pick), `mc.chat.agent` (agent pick).

Rules the client must keep:

- **Restore once.** The archive refreshes every 20s. Continuity is applied on
  first index load only; re-applying it would drag a user who deliberately went
  back to the list straight back into the thread.
- **Resume only what still exists.** A stored conversation the archive no longer
  lists is ignored — fall back to the list, not to an error screen.
- **Deep links win.** `?session=&profile=&device=&agent=` beats stored state.
- **Leaving on purpose clears the pointer.** Going back to the conversation list
  removes `mc.chat.session`, so the next reload lands where the user asked.
- **Ids are validated on read.** A storage value that does not match the route's
  id charset is discarded, never spliced into a request URL.

## Connection loss

A rejected `fetch` (offline, DNS failure, TLS reset, connection dropped
mid-stream) is treated as its own state, distinct from an HTTP error the server
answered. On any of these paths the client keeps the user's text and offers a
retry instead of showing a bare `Failed to fetch`:

- send → "Connection lost — your message is saved below. Check the connection,
  then retry." plus a **Retry** button that resends the kept text;
- thread load → explicit offline copy with Retry;
- archive load → explicit offline copy with Retry;
- availability check → explicit offline copy with Retry availability.

The composer is never left looking live while sends silently evaporate. An HTTP
error from the server (400/409/429/503) keeps the server's own message — that is
an answer, not a lost connection.

## Input and pointer

No affordance in the chat is hover-only or assumes a fine pointer, and the
controls are already sized for touch: composer buttons, inputs and selects carry
a 44px minimum height (`components/ChatShell.module.css`), the composer submits
from the button or `Ctrl/Cmd+Enter` (IME composition respected), and the thread
follows `window.visualViewport` resize and scroll so the on-screen keyboard
cannot hide the input. Hover is decoration only — it changes border and
background, never the sole affordance — and `components/AgentConsole.module.css`
strips the design system's hover glow and filter, so the coarse-pointer WebView
gets the identical control set with no lost state.
