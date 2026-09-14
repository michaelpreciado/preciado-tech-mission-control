# MC device continuity

MC is served on the Friday box; the recorded phone entry point is
`http://100.79.84.9:4176/chat` over Tailscale. This lane did not probe or change
production. A phone and desktop reaching that server read the same Hermes
conversation store. Select the same profile and conversation in the session
picker; browser agent preference alone does not select a conversation.

Middleware source verification: with application password auth enabled,
untrusted clients need a login cookie or API bearer; trusted IPs bypass that
login. With password auth disabled, middleware passes through. Route write
gates remain independent. In particular, Herdr requires its existing trusted-IP
or bearer authorization plus same-origin checks. A login cookie alone does not
satisfy that gate. ChatConsole currently relies on trusted-client access and
has no bearer-entry UI; an unauthorized continuation is reported as an error.
No credentials were inspected in this lane.

## MC → Herdr → MC

1. Start a local Hermes conversation and send its first message. Pi and remote
   conversations do not offer local Herdr continuation.
2. The location footer shows the server-generated MC conversation key, Hermes
   session identity/profile, and optional Herdr pane. The server persists the
   mapping in `data/chat-continuity.sqlite`, excluded from Git. Named MC sessions
   are linked to their native Hermes ID after the conversation index resolves
   them; until then the footer explicitly labels the name as unresolved.
3. Enter the next message in the footer and choose **Continue in herdr**.
   `/api/herdr/agent` runs the existing write gate, creates a workspace/pane,
   starts Hermes with the same profile and session name (or resumes an existing
   ID), records the pane before startup, and submits the message through
   `herdr agent prompt`. Subsequent requests reuse and validate that pane.
4. MC displays a bounded terminal snapshot when the prompt wait settles.
   This can contain prompts, previous output, and status text; it is not a
   parsed or independently verified model reply. Reopen the conversation to
   read persisted Hermes messages. Regular MC sends refuse an attached session
   so they do not start a second CLI against that session.

GET `/api/chat?session=<name-or-id>&profile=<profile>` returns the protected
continuity record. Normal `/api/chat` POST responses include `continuity`.
Mappings are scoped by profile; aliases for the MC session name and native ID
resolve to the same MC key and pane. SQLite persists across server restarts.
The MC key identifies this mapping, distinct from the native archive ID.

## Reconnect and SSH

The operational SSH entry point supplied by the task is `ssh friday-linux`.
SSH reachability/alias configuration was not tested here. Once on the box,
`herdr agent list` lists agents and `herdr agent focus <target>` focuses the
recorded pane, for example a target shaped like `w3:pA`. Focus changes Herdr's
selection; it does not stream a terminal into the SSH shell or phone browser.
The existing agent deck provides terminal tails and controls.

Verified CLI syntax from installed help (2026-09-14):

- `herdr agent start <name> --kind hermes --pane <id> --timeout 8000 -- <agent args>`
- Hermes agent args: `--profile <profile> chat --continue <name> --no-restore-cwd --cli`
  (default profile omits `--profile`; existing native IDs use `--resume <id>`).
- `herdr agent prompt <target> <text> --wait --until idle --until done --timeout 180000`
- `herdr agent focus <target>` and `herdr pane close <pane_id>`.

The earlier deployed bridge verified `herdr pane read <target> --lines 200
--format text`: output is raw terminal text. Herdr prompt consumes positional
text without a `--` separator; the bridge uses argv arrays. Stop in the deck
sends Ctrl+C and leaves the pane alive. Close a throwaway pane explicitly after
verification; interrupt is not guaranteed process termination.

Herdr's process and terminal live on the server, so a client disconnect does
not inherently terminate them. This does not promise survival of a box reboot,
Herdr shutdown, CLI failure, or process kill. This change adds no daemon.

## Limitations and verification

- Only local Hermes sessions registered by an MC send are attachable. Existing
  archive sessions become registered when sent through MC. Remote and Pi
  sessions remain on their existing paths.
- MC serializes its Hermes turns in one server process. External SSH input and
  multiple MC server processes do not participate in that lock. Do not send
  simultaneous turns from the browser and terminal.
- A prompt timeout or uncertain startup retains the recorded pane. Inspect the
  deck before retrying; retrying a delivered prompt can duplicate a turn.
  Missing, repurposed, or non-idle panes are refused. There is no automatic
  deletion/recreation or detach control in this incremental lane.
- Herdr's wait reports a status transition, not a durable turn identifier.
  Browser disconnection loses the HTTP response; reopen the archive/deck to
  recover output. A terminal snapshot is not a replayable transcript stream.
- Token changes apply only to picker, handoff card, and location footer:
  #050506/#0A0A0B, #00E5FF primary, #38BDF8 secondary,
  rgba(10,12,14,0.72), blur(18px), JetBrains Mono. The existing two-zone chat
  layout is preserved; controls specify 44px minimum targets and wrap long IDs.
- Live throwaway round-trip (verified by Hermes, 2026-09-14, dev server on
  127.0.0.1:4187): an MC chat send registered the session, **Continue in
  herdr** created pane `w9:p1` (agent `mc-chat-54bb23cf`), the pane's Hermes
  agent answered `PANE-FINAL-OK`, and the footer payload returned
  `{herdrPane: w9:p1, hermesSession: 20260914_091203_50491a,
  mcConversationId: 54bb23cf-…}`. End to end: 70s.
- Fresh-pane startup: `herdr agent start` is rejected with `agent_pane_busy`
  until the new pane's shell is ready (measured ~2s). The server retries only
  that case and the startup timeout, for up to ~10s total; every other failure
  aborts immediately. Herdr agent names must be 1–32 chars of `[a-z0-9_-]`.
- A Hermes session held open elsewhere refuses a second attach; the server
  surfaces that pane line ("already has a live owner") instead of the generic
  startup message.
- Rendering (verified by Hermes on the same dev server, CDP viewport
  overrides): 412x915 folded and 900x1000 / 1280x900 unfolded all show no
  horizontal overflow (`scrollWidth == viewport`), the footer and composer fit,
  and the `Continue in herdr` and SEND targets measure 44px. The two-zone
  layout (list + thread) is preserved at desktop width. No physical Fold touch
  verification was performed.
