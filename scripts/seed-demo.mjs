#!/usr/bin/env node
/**
 * F.R.I.D.A.Y. demo seeder — populates the dashboard with realistic fake data.
 *
 * "An empty dashboard is hard to appreciate." This writes a self-contained
 * demo dataset under data/demo/ (agents, tasks, kanban DB, cron jobs, costs,
 * pipeline leads, approvals, ideas, missions, memory notes) and points
 * data/config.json at it. Everything stays inside the project folder and is
 * gitignored. Safe to re-run; refreshes timestamps so the data looks live.
 *
 * Usage: node scripts/seed-demo.mjs [--force]
 *   --force  overwrite an existing data/config.json (a .bak copy is kept)
 */
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const ROOT = process.cwd()
const DEMO = path.join(ROOT, 'data', 'demo')
const CONFIG_FILE = path.join(ROOT, 'data', 'config.json')

const now = Date.now()
const iso = (msAgo) => new Date(now - msAgo).toISOString()
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000

function write(rel, content) {
  const file = path.join(DEMO, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

export function seedDemo({ force = false } = {}) {
  fs.rmSync(DEMO, { recursive: true, force: true })
  fs.mkdirSync(DEMO, { recursive: true })

  /* ── workspace: memory, ideas, missions, task checklists ── */
  write('workspace/MEMORY.md', `# F.R.I.D.A.Y. — Agent Memory

## Operating principles
- The operator reviews all outbound work before it ships (Flight Director methodology).
- Keys and data stay on this machine; nothing syncs to third-party clouds.

## Current focus
- Demo launch checklist is the active mission.
- Forge owns the deploy pipeline; Echo keeps the vault indexed.
`)
  write('workspace/USER.md', `# Operator profile

- Name: Demo Operator
- Timezone: local
- Review cadence: approvals inbox, twice daily
`)
  write('workspace/memory/architecture.md', `# Harness architecture notes

The dashboard is a read-only projection of agent state on disk: kanban DB,
cron scheduler, session logs, and the pipeline store. Agents write; the
board renders. No orchestration lives in the UI.
`)
  write('workspace/memory/decisions.md', `# Decision log

- 2025-11: adopted approval gates for all outbound email.
- 2025-12: moved model spend tracking to session JSONL logs.
`)
  write('workspace/projects.md', `# Active checklists

- [ ] Fix flaky deploy step in demo pipeline urgent
- [ ] Draft launch announcement for review
- [x] Wire approvals inbox to pipeline gates
- [ ] Weekly cost report cron monitor
- [ ] Research citation manager for study agent
- [x] Index vault memory folder
`)
  write('workspace/ideas.json', JSON.stringify([
    { title: 'Auto-summarize daily agent activity into one briefing', source: 'demo/workspace/ideas.json', status: 'new', timestamp: iso(2 * HOUR) },
    { title: 'Add cost anomaly alerts when a model 5x-es its daily burn', source: 'demo/workspace/ideas.json', status: 'new', timestamp: iso(9 * HOUR) },
    { title: 'One-click export of approved work to a client folder', source: 'demo/workspace/ideas.json', status: 'approved', timestamp: iso(3 * DAY) },
  ], null, 2))
  write('workspace/missions.json', JSON.stringify({ missions: [
    { id: 'm-demo-launch', title: 'Ship the public demo', description: 'Seeded dashboard, screenshots, README hero.', owner: 'forge', priority: 'high', status: 'active', createdAt: iso(6 * DAY), updatedAt: iso(3 * HOUR) },
    { id: 'm-cost-report', title: 'Weekly model-spend report', description: 'Cron summarizes burn by model every Friday.', owner: 'friday', priority: 'medium', status: 'active', createdAt: iso(20 * DAY), updatedAt: iso(1 * DAY) },
    { id: 'm-vault-index', title: 'Index the notes vault', description: 'Echo keeps memory search fresh.', owner: 'echo', priority: 'low', status: 'completed', createdAt: iso(30 * DAY), updatedAt: iso(5 * DAY) },
  ] }, null, 2))

  /* ── vault + project hub ── */
  write('vault/0200 Projects/website-redesign.md', `# Website redesign

- [ ] Collect inspiration set for hero section
- [ ] Ship responsive nav fix today
- [x] Pick typography scale
`)
  write('vault/0200 Projects/agent-harness.md', `# Agent harness

- [ ] Write onboarding docs
- [x] Local-first config module
`)
  write('vault/hub/500 Friday Hub/Active Projects Hub.md', `# Active Projects Hub

- [[Website Redesign]]
- [[Agent Harness|F.R.I.D.A.Y. harness]]
- [[Demo Launch]]
`)
  write('vault/hub/100 Memory System/recall-notes.md', `# Recall notes

Long-term memory lives in markdown; the dashboard only indexes titles and
excerpts. Nothing leaves the machine.
`)
  write('vault/hub/300 Action Logs/last-week.md', `# Action log — last week

Forge shipped the pipeline board; Echo re-indexed 412 notes.
`)

  /* ── inbox + logs ── */
  write('inbox/review-client-brief.md', '# Review: client brief for Harbor Cafe\n\nWaiting on operator read-through.\n')
  write('inbox/receipt-openrouter.txt', 'OpenRouter receipt — $4.20 (demo)\n')
  write('logs/deploy-2025.md', '# Deploy log\n\nAll green.\n')

  /* ── agent sessions (presence) + usage JSONL (costs) ── */
  const sessions = (label, msAgo) => JSON.stringify({
    [label]: { label, sessionId: `sess-${label}`, updatedAt: now - msAgo, systemSent: true, sessionFile: `demo/${label}.jsonl` },
  }, null, 2)
  write('agents/main/sessions/sessions.json', sessions('morning-briefing', 40 * 1000))
  write('agents/code/sessions/sessions.json', sessions('deploy-fix', 2 * MIN))
  write('agents/memory/sessions/sessions.json', sessions('vault-index', 3 * HOUR))

  const MODELS = [
    { model: 'claude-fable-5', provider: 'anthropic', inRate: 3 / 1e6, outRate: 15 / 1e6, weight: 5 },
    { model: 'claude-sonnet-4-6', provider: 'anthropic', inRate: 3 / 1e6, outRate: 15 / 1e6, weight: 3 },
    { model: 'deepseek/deepseek-chat', provider: 'openrouter', inRate: 0.27 / 1e6, outRate: 1.1 / 1e6, weight: 2 },
    { model: 'llama3.2:3b', provider: 'ollama', inRate: 0, outRate: 0, weight: 4 },
  ]
  // Deterministic pseudo-random so re-seeding produces a similar-looking chart.
  let seed = 42
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const usageLines = []
  for (let day = 29; day >= 0; day--) {
    const requests = 3 + Math.floor(rand() * 9)
    for (let r = 0; r < requests; r++) {
      const m = MODELS[Math.floor(rand() * MODELS.length * 0.999)]
      const input = 800 + Math.floor(rand() * 12000)
      const output = 200 + Math.floor(rand() * 3500)
      const cacheRead = rand() > 0.5 ? Math.floor(rand() * 20000) : 0
      usageLines.push(JSON.stringify({
        timestamp: new Date(now - day * DAY - Math.floor(rand() * 14) * HOUR).toISOString(),
        message: {
          model: m.model, provider: m.provider,
          usage: {
            input_tokens: input, output_tokens: output,
            cache_read_tokens: cacheRead, cache_write_tokens: 0,
            cost: { input: input * m.inRate, output: output * m.outRate },
          },
        },
      }))
    }
  }
  write('agents/main/sessions/usage-demo.jsonl', usageLines.join('\n') + '\n')

  /* ── cron jobs ── */
  write('cron/jobs.json', JSON.stringify({ jobs: [
    { id: 'cron-brief', name: 'Friday — Morning briefing', enabled: true, schedule: { kind: 'cron', expr: '0 7 * * *' }, schedule_display: 'daily 07:00', next_run_at: iso(-16 * HOUR), last_run_at: iso(8 * HOUR), last_status: 'ok', prompt: 'Summarize overnight agent activity and today\'s calendar.' },
    { id: 'cron-costs', name: 'Friday — Weekly cost report', enabled: true, schedule: { kind: 'cron', expr: '0 9 * * 5' }, schedule_display: 'fridays 09:00', next_run_at: iso(-3 * DAY), last_run_at: iso(4 * DAY), last_status: 'ok', prompt: 'Aggregate model spend by provider; flag anomalies.' },
    { id: 'cron-index', name: 'Echo — Vault re-index', enabled: true, schedule: { kind: 'cron', expr: '0 */6 * * *' }, schedule_display: 'every 6h', next_run_at: iso(-2 * HOUR), last_run_at: iso(4 * HOUR), last_status: 'ok', prompt: 'Re-index memory folders.' },
    { id: 'cron-outreach', name: 'Scout — Lead sweep', enabled: true, schedule: { kind: 'cron', expr: '30 8 * * 1-5' }, schedule_display: 'weekdays 08:30', next_run_at: iso(-20 * HOUR), last_run_at: iso(26 * HOUR), last_status: 'error', last_error: 'Rate-limited by data source; retry scheduled.', prompt: 'Scan for new local-business leads.' },
    { id: 'cron-backup', name: 'Forge — Nightly workspace backup', enabled: false, schedule: { kind: 'cron', expr: '0 2 * * *' }, schedule_display: 'daily 02:00', next_run_at: null, last_run_at: iso(12 * DAY), last_status: 'ok', prompt: 'Snapshot workspace to local archive.' },
  ] }, null, 2))

  /* ── kanban DB (agent task store) ── */
  const dbFile = path.join(DEMO, 'kanban.db')
  const db = new DatabaseSync(dbFile)
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT, priority INTEGER,
      created_by TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER,
      consecutive_failures INTEGER DEFAULT 0, last_failure_error TEXT,
      last_heartbeat_at INTEGER, current_run_id TEXT, session_id TEXT,
      body TEXT, workspace_path TEXT
    );
    CREATE TABLE task_runs (
      id TEXT PRIMARY KEY, task_id TEXT, status TEXT, outcome TEXT, profile TEXT,
      step_key TEXT, started_at INTEGER, ended_at INTEGER, summary TEXT, error TEXT
    );
    CREATE TABLE task_comments (id TEXT PRIMARY KEY, task_id TEXT, author TEXT, body TEXT, created_at INTEGER);
    CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, run_id TEXT, kind TEXT, payload TEXT, created_at INTEGER);
  `)
  const sec = (msAgo) => Math.floor((now - msAgo) / 1000)
  const tasks = [
    ['t-harbor-build', 'Build Harbor Cafe demo site', 'forge', 'running', 2, sec(5 * HOUR), sec(4 * HOUR), null, sec(90 * 1000)],
    ['t-briefing', 'Compile morning briefing', 'friday', 'done', 1, sec(9 * HOUR), sec(8.5 * HOUR), sec(8 * HOUR), sec(8 * HOUR)],
    ['t-vault', 'Re-index memory vault', 'echo', 'done', 3, sec(30 * HOUR), sec(29 * HOUR), sec(28 * HOUR), sec(28 * HOUR)],
    ['t-leads', 'Qualify new lead batch', 'scout', 'queued', 2, sec(3 * HOUR), null, null, null],
    ['t-citations', 'Verify citation formats', 'sage', 'blocked', 2, sec(2 * DAY), sec(2 * DAY), null, sec(26 * HOUR)],
    ['t-costs', 'Draft weekly cost summary', 'friday', 'queued', 3, sec(1 * HOUR), null, null, null],
    ['t-deploy-fix', 'Fix flaky deploy step', 'forge', 'in_progress', 1, sec(7 * HOUR), sec(6 * HOUR), null, sec(4 * MIN)],
    ['t-inbox', 'Triage operator inbox', 'echo', 'done', 3, sec(3 * DAY), sec(3 * DAY), sec(3 * DAY), sec(3 * DAY)],
  ]
  const insTask = db.prepare(`INSERT INTO tasks (id, title, assignee, status, priority, created_by, created_at, started_at, completed_at, last_heartbeat_at, body, workspace_path)
    VALUES (?, ?, ?, ?, ?, 'demo-seed', ?, ?, ?, ?, ?, ?)`)
  for (const [id, title, assignee, status, priority, created, started, completed, heartbeat] of tasks) {
    insTask.run(id, title, assignee, status, priority, created, started, completed, heartbeat,
      `Demo task: ${title}. Seeded data — replace with your own agents' store.`, `data/demo/workspace`)
  }
  const insEvent = db.prepare('INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)')
  const events = [
    ['t-harbor-build', 'run-1', 'progress', '{"pct":62,"note":"sections scaffolded"}', sec(6 * MIN)],
    ['t-harbor-build', 'run-1', 'progress', '{"pct":48,"note":"scraped brand palette"}', sec(40 * MIN)],
    ['t-deploy-fix', 'run-2', 'progress', '{"note":"reproduced failure"}', sec(10 * MIN)],
    ['t-briefing', 'run-3', 'done', '{"summary":"briefing delivered"}', sec(8 * HOUR)],
    ['t-citations', 'run-4', 'blocked', '{"reason":"needs operator input on style guide"}', sec(26 * HOUR)],
    ['t-leads', null, 'created', '{}', sec(3 * HOUR)],
  ]
  for (const [taskId, runId, kind, payload, at] of events) insEvent.run(taskId, runId, kind, payload, at)
  db.prepare("INSERT INTO task_runs (id, task_id, status, outcome, profile, step_key, started_at, ended_at, summary) VALUES ('run-1','t-harbor-build','running',NULL,'builder','enhance', ?, NULL, 'Scaffold + enhance demo site')").run(sec(4 * HOUR))
  db.prepare("INSERT INTO task_comments (id, task_id, author, body, created_at) VALUES ('c-1','t-citations','sage','Blocked: which citation style does the operator prefer?', ?)").run(sec(26 * HOUR))
  db.close()

  /* ── pipeline store (leads, approvals, live build) ── */
  const lead = (id, business_name, stage, extra = {}) => ({
    id, business_name, stage, vertical: extra.vertical ?? 'local-services',
    location: extra.location ?? 'Springfield, USA', score: extra.score ?? 70,
    rating: extra.rating ?? 4.4, review_count: extra.reviews ?? 120,
    created_at: iso(extra.ageDays ? extra.ageDays * DAY : 4 * DAY), updated_at: iso(extra.updatedH ? extra.updatedH * HOUR : 6 * HOUR),
    history: [{ stage, ts: iso(6 * HOUR) }], ...extra.fields,
  })
  const leads = [
    lead('ld-harbor', 'Harbor Cafe', 'in_development', { score: 92, rating: 4.8, reviews: 342, updatedH: 1, fields: { development: { task_id: 't-harbor-build', status: 'enhancing', progress_pct: 62, milestones: [{ label: 'Scaffold', done: true }, { label: 'Enhance', done: false }, { label: 'Deploy', done: false }] } } }),
    lead('ld-petal', 'Petal & Stem Florist', 'awaiting_approval', { score: 88, rating: 4.7, reviews: 210, updatedH: 3, fields: { approval: { status: 'pending', telegram_sent_at: iso(3 * HOUR) }, concept: { design_direction: 'Soft botanical, editorial type', estimated_scope: '4 pages' } } }),
    lead('ld-anchor', 'Anchor Barbershop', 'awaiting_approval', { score: 84, rating: 4.6, reviews: 156, updatedH: 5, fields: { approval: { status: 'pending', telegram_sent_at: iso(5 * HOUR) }, concept: { design_direction: 'High-contrast retro, bold grotesk', estimated_scope: '3 pages' } } }),
    lead('ld-summit', 'Summit Climbing Gym', 'completed', { score: 90, rating: 4.9, reviews: 501, updatedH: 20, fields: { completed: { preview_url: 'http://localhost:8080/summit-demo', email_status: 'awaiting_signoff', signoff_sent_at: iso(20 * HOUR), email_draft: 'Hi Summit team — we built you a preview…' } } }),
    lead('ld-brew', 'Copper Kettle Brewing', 'concept_ready', { score: 81, reviews: 98, updatedH: 8 }),
    lead('ld-paws', 'Happy Paws Grooming', 'social_scraped', { score: 76, reviews: 64, updatedH: 12 }),
    lead('ld-nook', 'The Book Nook', 'social_scraped', { score: 72, reviews: 88, updatedH: 14 }),
    lead('ld-vine', 'Vine & Dine Bistro', 'leads_found', { score: 79, reviews: 143, updatedH: 22 }),
    lead('ld-forge', 'Iron Forge Fitness', 'leads_found', { score: 74, reviews: 77, updatedH: 26 }),
    lead('ld-tide', 'Tidewater Kayak Rentals', 'leads_found', { score: 68, reviews: 41, updatedH: 30 }),
  ]
  write('pipeline/pipeline.json', JSON.stringify({ leads }, null, 2))
  const pipelineEvent = (msAgo, lead_id, business_name, stage, action, detail) => JSON.stringify({
    agent_id: 'hermes', session_id: 'demo-seed', event_type: 'pipeline_update',
    timestamp: iso(msAgo), payload: { lead_id, business_name, stage, action, detail },
  })
  write('pipeline/events.jsonl', [
    pipelineEvent(30 * HOUR, 'ld-tide', 'Tidewater Kayak Rentals', 'leads_found', 'play_store_scan', 'Scored 68 from 41 reviews'),
    pipelineEvent(20 * HOUR, 'ld-summit', 'Summit Climbing Gym', 'completed', 'email_draft_signoff', 'Preview deployed; email drafted for sign-off'),
    pipelineEvent(5 * HOUR, 'ld-anchor', 'Anchor Barbershop', 'awaiting_approval', 'telegram_notify', 'Concept ready for operator go/no-go'),
    pipelineEvent(3 * HOUR, 'ld-petal', 'Petal & Stem Florist', 'awaiting_approval', 'telegram_notify', 'Concept ready for operator go/no-go'),
    pipelineEvent(1 * HOUR, 'ld-harbor', 'Harbor Cafe', 'in_development', 'claude_code_handoff', 'Build 62% — sections scaffolded'),
  ].join('\n') + '\n')

  /* ── ML content board ── */
  write('ml-content/week-1.json', JSON.stringify({
    generated_at: iso(10 * HOUR),
    ideas: [
      { week: 1, title: 'How my agents earn their keep — cost dashboard tour', project: 'harness', video: '90s screen capture', x_thread: ['Local-first agent ops', 'Every model, one burn chart'], shot_list: ['Deck overview', 'Costs tab', 'Approvals gate'], score: 8.5 },
      { week: 1, title: 'Approval gates: agents propose, you dispose', project: 'harness', video: '60s talking head + overlay', x_thread: ['Go/No-Go like a flight director'], shot_list: ['Approvals inbox', 'One-click approve'], score: 7.9 },
      { week: 1, title: 'Seeding a believable demo in one command', project: 'harness', video: 'devlog', x_thread: ['seed-demo.mjs walkthrough'], shot_list: ['Terminal', 'Populated board'], score: 7.2 },
      { week: 1, title: 'Reading an agent kanban like a control room', project: 'harness', video: 'short', x_thread: ['Blocked tasks float up'], shot_list: ['Tasks drawer'], score: 6.8 },
    ],
  }, null, 2))

  /* ── gateway state (system health) ── */
  write('gateway_state.json', JSON.stringify({ pid: 1, gateway_state: 'running', platforms: { telegram: { state: 'connected' } } }, null, 2))

  /* ── config pointing at the demo dataset ── */
  const demoConfig = {
    appName: 'F.R.I.D.A.Y.',
    appTagline: 'Framework for Running Intelligent Deployed Agents',
    github: { username: '', projectRepo: '' },
    paths: {
      agentsDir: path.join(DEMO, 'agents'),
      workspaceDir: path.join(DEMO, 'workspace'),
      projectWorkspaceDir: path.join(DEMO, 'workspace'),
      vaultDir: path.join(DEMO, 'vault'),
      projectVaultDir: path.join(DEMO, 'vault/hub'),
      usageLogsDir: path.join(DEMO, 'logs'),
      inboxDir: path.join(DEMO, 'inbox'),
      cronJobsFile: path.join(DEMO, 'cron/jobs.json'),
      kanbanDbFile: path.join(DEMO, 'kanban.db'),
      gatewayStateFile: path.join(DEMO, 'gateway_state.json'),
      pipelineDir: path.join(DEMO, 'pipeline'),
      mlContentIdeasDir: path.join(DEMO, 'ml-content'),
    },
  }
  let configAction = 'kept existing data/config.json (pass --force to overwrite)'
  if (!fs.existsSync(CONFIG_FILE) || force) {
    if (fs.existsSync(CONFIG_FILE)) fs.copyFileSync(CONFIG_FILE, CONFIG_FILE + '.bak')
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(demoConfig, null, 2) + '\n', { mode: 0o600 })
    configAction = 'wrote data/config.json pointing at the demo dataset'
  }

  return { demoDir: DEMO, configAction }
}

// CLI entry
if (process.argv[1] && process.argv[1].endsWith('seed-demo.mjs')) {
  const force = process.argv.includes('--force')
  const result = seedDemo({ force })
  console.log(`✔ Demo data seeded at ${path.relative(ROOT, result.demoDir)}/`)
  console.log(`✔ ${result.configAction}`)
  console.log('  Open the dashboard — collectors pick the demo data up immediately.')
}
