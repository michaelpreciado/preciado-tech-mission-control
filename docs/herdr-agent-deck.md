# Herdr agent deck

`/kanban` combines a live local agent deck with the existing PAIR-inspired task overview and board. `/bots` still manages crew profiles.

## Operator flow

- Open **New agent**, select Codex, Claude or OpenCode, choose a workspace or enter an absolute directory, and optionally supply a model and opening prompt.
- Select an agent to read its terminal, send a prompt or keys, rename it, focus its Herdr pane, or send Ctrl+C with **Stop / interrupt**. Interrupt leaves the pane open and does not guarantee the process has exited.
- Use the task drawer's **Run task in Herdr** to claim and start a worker in that task's recorded workspace. The comment records the pane and `/kanban?agent=...` link. The worker is instructed to verify and complete the task through Hermes.
- Use **Board** for existing status moves and **Overview** for assignment/dependency navigation. Phone controls wrap, and board columns scroll horizontally.
- When an API bearer is configured, enter it under **Access**. It remains only in page memory and is also used by task mutations. Reloading clears it.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/herdr` | Normalized local agents/workspaces; 2-second shared cache; unavailable server returns empty `available:false` with HTTP 200 |
| `GET /api/herdr/agent/[id]/tail?lines=80` | On-demand, ANSI-stripped text; 1–200 lines; cache/coalescing; no background tail collector |
| `POST /api/herdr/agent` | `spawn`, `prompt`, `send-keys`, `rename`, `focus`, `stop` |
| `POST /api/kanban/[id]` with `action:dispatch-agent` | Claim a local task and launch `kind`/optional `model` in its DB-recorded workspace |

All Herdr reads and writes require `INTERNAL_API_SECRET` bearer when configured; otherwise they require a recognized loopback/trusted-network address. Missing client identity is denied. Same-origin checks and per-client rate limits apply. The inherited forwarded-IP model assumes a private deployment; it is not internet-facing authentication. Terminal contents are private data and are intentionally absent from general dashboard reads and server error logs.

New agent directories must exist. Task dispatch additionally validates canonical paths beneath configured kanban workspace roots and rejects remote-origin tasks and request overrides. Claims are retained when startup is uncertain and the created pane is known; operators must inspect that pane before retrying. Startup or prompt timeouts never imply rollback of commands already delivered.

`HERDR_BIN` optionally overrides the default `~/.local/bin/herdr`. Calls use `execFile` argument arrays and bounded execution. Arbitrary shell command/model-argument input is not exposed. `agent read --format text` returns raw text; other commands return JSON envelopes. IDs are alphanumeric, for example `w3:pA`. Herdr 0.8's prompt parser requires target/text positional arguments and does not accept a `--` separator.

## Verification (2026-09-07)

- Isolated production build and TypeScript pass. Full existing suite plus bridge/auth/request tests pass.
- Folded preview renders at 412px without page overflow; launcher has labelled fields and native-dialog focus handling.
- Live local smoke agent reached Codex interactive readiness. Roster, terminal read, rename, prompt submission, and Ctrl+C were exercised.
- Codex account usage limit prevented a completed model reply. This is an external acceptance limitation, not a successful task-completion test.
- A physical Pixel Fold touch pass remains the operator's acceptance check. No automated check claims hardware validation.

Original plan: `/home/mp/preciado-tech-workspace/docs/plan-herdr-deck-astra.md`. Work log and deployment/QA evidence: `artifacts/2026-09-07/` in the main checkout.
