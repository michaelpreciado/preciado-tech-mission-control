import fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { google } from 'googleapis'
import type { ActivityItem, CalendarEvent, CostDashboard, CrewId, CrewMember, GitHubActivity, GitHubRepoSignal, Idea, IntegrationState, KanbanActivity, MemoryEntry, Mission, MissionCron, MissionData, MissionProject, MissionTask, ModelUsage, OperationsDashboard, TaskStatus } from './types'
import { logger } from './logger'

const execFileAsync = promisify(execFile)
import { getConfig, joinIf } from './config'

// All roots resolve from lib/config.ts (env > data/config.json > defaults) via
// live getters so /setup saves apply without a restart. A root of '' means
// "not configured" — collectors degrade to empty results.
const ROOTS = {
  get repo() { return getConfig().paths.repoDir },
  get openclaw() { return path.dirname(getConfig().paths.agentsDir) },
  get workspace() { return getConfig().paths.workspaceDir },
  get fridayWorkspace() { return getConfig().paths.projectWorkspaceDir },
  get vault() { return getConfig().paths.vaultDir },
  get fridayVault() { return getConfig().paths.projectVaultDir },
  get cronJobs() { return getConfig().paths.cronJobsFile },
  get kanbanDb() { return getConfig().paths.kanbanDbFile },
  get openclawConfig() { return getConfig().paths.openclawConfigFile },
  get usageLogs() { return getConfig().paths.usageLogsDir },
  get agentSessions() { return getConfig().paths.agentsDir },
  get inbox() { return getConfig().paths.inboxDir },
}

const CREW: Record<CrewId, Omit<CrewMember, 'status' | 'signal' | 'lastRun' | 'nextRun'>> = {
  friday: {
    id: 'friday', name: 'F.R.I.D.A.Y.', role: 'Coordinator', station: 'Command HQ', room: 'COMMAND HQ', accent: '#ff10f0', model: 'gemma4:26b / router',
    sprite: ['  ██  ', ' ████ ', '██████', ' ████ ', '█ ██ █'],
  },
  echo: {
    id: 'echo', name: 'Echo', role: 'Memory Agent', station: 'Archive', room: 'MEMORY ARCHIVE', accent: '#22d3ee', model: 'memory tools',
    sprite: [' ▄▄▄ ', '█░░█ ', '████ ', ' ▀█▀ ', ' █ █ '],
  },
  sage: {
    id: 'sage', name: 'Sage', role: 'Study Agent', station: 'Research Lab', room: 'RESEARCH LAB', accent: '#7dd3fc', model: 'Gemma / research',
    sprite: [' ▟█▙ ', ' ▜█▛ ', '████ ', ' ▐▌  ', ' ▐▌  '],
  },
  forge: {
    id: 'forge', name: 'Forge', role: 'Coding Agent', station: 'Workshop', room: 'WORKSHOP', accent: '#60a5fa', model: 'Codex / Claude',
    sprite: [' ▄█▄ ', '████ ', ' ▟▙  ', ' ███ ', '▟   ▙'],
  },
  ticker: {
    id: 'ticker', name: 'Ticker', role: 'Stock Market Agent', station: 'Trading Desk', room: 'MARKET DESK', accent: '#38bdf8', model: 'market monitor',
    sprite: ['▛▀▀▜', '▌$ ▐', '▙▄▄▟', ' ▐▌ ', ' ▐▌ '],
  },
  scout: {
    id: 'scout', name: 'Scout', role: 'Outreach Agent', station: 'Outpost', room: 'OUTPOST', accent: '#a78bfa', model: 'search / draft',
    sprite: [' ▄▄▄ ', '█   █', ' ███ ', '  █  ', ' █ █ '],
  },
  crypto: {
    id: 'crypto', name: 'Crypto', role: 'Trading Agent', station: 'Trading Floor', room: 'CRYPTO TRADING', accent: '#00d4ff', model: 'nemotron-3-super-120b / agentkit',
    sprite: [' ▄▄▄ ', '█ ₿ █', ' ███ ', '  █  ', ' █ █ '],
  },
}

async function exists(p: string) {
  try { await fs.access(p); return true } catch { return false }
}

async function readText(p: string) {
  try { return await fs.readFile(p, 'utf8') } catch { return '' }
}

async function readJson<T>(p: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(p, 'utf8')) as T } catch { return null }
}

async function walk(dir: string, opts: { extensions?: string[]; max?: number; depth?: number } = {}) {
  const out: string[] = []
  const max = opts.max ?? 800
  const depth = opts.depth ?? 5
  async function visit(current: string, level: number) {
    if (out.length >= max || level > depth) return
    let entries: Dirent[] = []
    try { entries = await fs.readdir(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (out.length >= max) break
      if (entry.name.startsWith('.') && !entry.name.includes('openclaw')) continue
      if (['node_modules', '.next', '.git'].includes(entry.name)) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await visit(full, level + 1)
      else if (!opts.extensions || opts.extensions.some(ext => entry.name.toLowerCase().endsWith(ext))) out.push(full)
    }
  }
  await visit(dir, 0)
  return out
}

function rel(p: string) {
  if (!p) return '(not configured)'
  return p.replace(getConfig().homeDir, '~')
}

function hashId(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i) | 0
  return Math.abs(h).toString(36)
}

function ownerFor(text: string): CrewId {
  const s = text.toLowerCase()
  if (/stock|ticker|market|nvda|ionq|qubt|asti|serv|portfolio/.test(s)) return 'ticker'
  if (/study|course|university|wilmington|citation|research|school|cta|assignment/.test(s)) return 'sage'
  if (/code|github|repo|dashboard|next|react|firmware|robot|bug|build|test|openclaw|ollama/.test(s)) return 'forge'
  if (/memory|vault|obsidian|journal|daily|archive|recall/.test(s)) return 'echo'
  return 'friday'
}

function statusFor(done: boolean, text: string, source: string): TaskStatus {
  if (done) return 'done'
  const s = `${text} ${source}`.toLowerCase()
  if (/error|fail|broken|fix|urgent|risk|attention/.test(s)) return 'attention'
  if (/cron|scheduled|daily|weekly|reminder|monitor/.test(s)) return 'scheduled'
  if (/active|current|today|in progress|working/.test(s)) return 'active'
  return 'backlog'
}

async function collectTasks(): Promise<MissionTask[]> {
  const roots = [ROOTS.workspace, ROOTS.fridayWorkspace, ROOTS.fridayVault, joinIf(ROOTS.vault, '0200 Projects'), joinIf(ROOTS.vault, '0600 University'), joinIf(ROOTS.vault, '0500 3D Printing')].filter(Boolean)
  const files = (await Promise.all(roots.map(r => walk(r, { extensions: ['.md'], max: 400, depth: 5 })))).flat()
  const tasks: MissionTask[] = []
  for (const file of files) {
    const text = await readText(file)
    const lines = text.split(/\r?\n/)
    lines.forEach((line, idx) => {
      const m = line.match(/^\s*[-*]\s+\[([ xX✓])\]\s+(.+)/)
      if (!m) return
      const title = m[2].replace(/\s+#\w+.*$/, '').trim()
      if (!title) return
      const done = ['x', '✓'].includes(m[1].toLowerCase())
      const owner = ownerFor(`${title} ${file}`)
      const status = statusFor(done, title, file)
      const priority = /urgent|broken|fix|error|risk|today/i.test(title) ? 'high' : /someday|later|idea/i.test(title) ? 'low' : 'normal'
      tasks.push({
        id: `task-${hashId(`${file}:${idx}:${title}`)}`,
        title,
        status,
        owner,
        ownerName: CREW[owner].name,
        source: rel(file),
        line: idx + 1,
        priority,
      })
    })
  }
  return tasks.sort((a, b) => {
    const rank: Record<TaskStatus, number> = { attention: 0, active: 1, scheduled: 2, backlog: 3, done: 4 }
    return rank[a.status] - rank[b.status] || a.title.localeCompare(b.title)
  }).slice(0, 400)
}

// Schema of ~/.hermes/cron/jobs.json (Hermes gateway scheduler)
type HermesCronJob = {
  id?: string
  name?: string
  prompt?: string
  skill?: string
  enabled?: boolean
  state?: string
  schedule?: { kind?: string; expr?: string; display?: string }
  schedule_display?: string
  next_run_at?: string | null
  last_run_at?: string | null
  last_status?: string | null
  last_error?: string | null
  deliver?: string | null
}

function cadence(job: HermesCronJob): MissionCron['cadence'] {
  if (job.schedule?.kind === 'at') return 'one-shot'
  const expr = job.schedule?.expr || ''
  if (/^\S+\s+\S+\s+\*\s+\*\s+\*$/.test(expr)) return 'daily'
  return 'recurring'
}

/** Hermes names its jobs "<Agent> — <Purpose>"; prefer that over keyword inference. */
function ownerFromName(name: string): CrewId | null {
  const lead = name.toLowerCase()
  for (const id of Object.keys(CREW) as CrewId[]) {
    if (lead.startsWith(id) || lead.startsWith(CREW[id].name.toLowerCase())) return id
  }
  return null
}

async function collectCron(): Promise<MissionCron[]> {
  const raw = await readJson<{ jobs?: HermesCronJob[] }>(ROOTS.cronJobs)
  const jobs = raw?.jobs || []
  return jobs.map((job, i) => {
    const owner = ownerFromName(job.name || '') ?? ownerFor(`${job.name || ''} ${job.skill || ''} ${job.prompt || ''}`)
    return {
      id: job.id || `cron-${i}`,
      name: job.name || 'Unnamed scheduled job',
      enabled: job.enabled !== false,
      owner,
      ownerName: CREW[owner].name,
      cadence: cadence(job),
      schedule: job.schedule_display || job.schedule?.expr || 'unscheduled',
      nextRunAt: job.next_run_at || undefined,
      lastRunAt: job.last_run_at || undefined,
      lastRunStatus: job.last_status || undefined,
      description: job.last_status === 'error' && job.last_error ? job.last_error.slice(0, 160) : undefined,
      payloadPreview: String(job.prompt || '').slice(0, 220),
      delivery: job.deliver || undefined,
    } satisfies MissionCron
  }).sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.cadence.localeCompare(b.cadence) || a.name.localeCompare(b.name))
}

/** Live multi-agent task state from the Hermes kanban DB (read-only via sqlite3 CLI). */
async function collectKanbanActivity(): Promise<KanbanActivity> {
  const empty: KanbanActivity = { available: false, source: rel(ROOTS.kanbanDb), openTasks: 0, runningTasks: 0, lastEventAt: null, byAssignee: {} }
  if (!(await exists(ROOTS.kanbanDb))) return empty
  const query = async <T>(sql: string): Promise<T[]> => {
    const { stdout } = await execFileAsync('sqlite3', ['-readonly', '-json', ROOTS.kanbanDb, sql], { timeout: 5000 })
    return stdout.trim() ? JSON.parse(stdout) as T[] : []
  }
  try {
    type TaskRow = { assignee: string | null; status: string; n: number; last_ts: number | null }
    type EventRow = { kind: string; assignee: string | null; created_at: number }
    const [taskRows, eventRows] = await Promise.all([
      query<TaskRow>("SELECT assignee, status, COUNT(*) AS n, MAX(COALESCE(last_heartbeat_at, started_at, created_at)) AS last_ts FROM tasks GROUP BY assignee, status"),
      query<EventRow>("SELECT e.kind, t.assignee, e.created_at FROM task_events e LEFT JOIN tasks t ON t.id = e.task_id ORDER BY e.id DESC LIMIT 100"),
    ])
    const byAssignee: KanbanActivity['byAssignee'] = {}
    const touch = (who: string | null) => {
      const key = (who || 'unassigned').toLowerCase()
      return byAssignee[key] ?? (byAssignee[key] = { open: 0, running: 0, failed: 0, lastEventAt: null })
    }
    let openTasks = 0
    let runningTasks = 0
    for (const row of taskRows) {
      const slot = touch(row.assignee)
      const done = ['done', 'completed', 'closed'].includes(row.status)
      if (!done) { slot.open += row.n; openTasks += row.n }
      if (['running', 'in_progress', 'claimed'].includes(row.status)) { slot.running += row.n; runningTasks += row.n }
      if (row.last_ts) {
        const iso = new Date(row.last_ts * 1000).toISOString()
        if (!slot.lastEventAt || iso > slot.lastEventAt) slot.lastEventAt = iso
      }
    }
    let lastEventAt: string | null = null
    for (const ev of eventRows) {
      const iso = new Date(ev.created_at * 1000).toISOString()
      if (!lastEventAt || iso > lastEventAt) lastEventAt = iso
      const slot = touch(ev.assignee)
      if (!slot.lastEventAt || iso > slot.lastEventAt) slot.lastEventAt = iso
      if (['blocked', 'timed_out', 'crashed', 'gave_up', 'protocol_violation'].includes(ev.kind)) slot.failed += 1
    }
    return { available: true, source: rel(ROOTS.kanbanDb), openTasks, runningTasks, lastEventAt, byAssignee }
  } catch (err) {
    logger.error('kanban', err)
    return empty
  }
}

async function githubSnapshot(repo: string) {
  try {
    const [issues, prs, commits] = await Promise.all([
      execFileAsync('gh', ['issue', 'list', '--repo', repo, '--state', 'open', '--json', 'number', '--limit', '100'], { timeout: 7000 }),
      execFileAsync('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--json', 'number', '--limit', '100'], { timeout: 7000 }),
      execFileAsync('gh', ['api', `repos/${repo}/commits`, '--jq', '.[0].commit.message'], { timeout: 7000 }),
    ])
    return {
      repo,
      openIssues: JSON.parse(issues.stdout || '[]').length,
      openPrs: JSON.parse(prs.stdout || '[]').length,
      recentCommit: commits.stdout.trim().split('\n')[0],
    }
  } catch {
    return { repo }
  }
}

async function collectProjects(tasks: MissionTask[]): Promise<MissionProject[]> {
  const projects: MissionProject[] = []
  const activeHub = joinIf(ROOTS.fridayVault, '500 Friday Hub/Active Projects Hub.md')
  const activeText = activeHub ? await readText(activeHub) : ''
  const links = [...activeText.matchAll(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g)]
  for (const m of links) {
    const label = (m[2] || m[1]).trim()
    const relevant = tasks.filter(t => `${t.title} ${t.source}`.toLowerCase().includes(label.toLowerCase().split(/\s+/)[0] || label.toLowerCase()))
    // No progress number: nothing on disk measures completion, so we don't invent one.
    projects.push({
      id: `obs-${hashId(label)}`,
      name: label,
      kind: 'obsidian',
      source: rel(activeHub),
      signal: 'Listed in Active Projects Hub',
      tasks: relevant.length,
    })
  }
  const pinnedRepo = getConfig().github.projectRepo
  if (pinnedRepo) {
    const github = await githubSnapshot(pinnedRepo)
    projects.unshift({
      id: `github-${hashId(pinnedRepo)}`,
      name: pinnedRepo.split('/')[1] || pinnedRepo,
      kind: 'github',
      source: `github.com/${pinnedRepo}`,
      signal: github.recentCommit ? `Latest commit: ${github.recentCommit}` : 'GitHub reachable; commit detail unavailable',
      tasks: tasks.filter(t => /dashboard|github|mission|code|next/i.test(`${t.title} ${t.source}`)).length,
      github,
    })
  }
  const dirs = [ROOTS.repo, ROOTS.fridayWorkspace]
  for (const d of dirs) {
    if (await exists(d)) {
      projects.push({ id: `ws-${hashId(d)}`, name: path.basename(d), kind: 'workspace', source: rel(d), signal: 'Live filesystem workspace', tasks: tasks.filter(t => t.source.includes(path.basename(d))).length })
    }
  }
  return projects.slice(0, 16)
}

async function collectMemory(): Promise<MemoryEntry[]> {
  const files = [
    joinIf(ROOTS.workspace, 'MEMORY.md'),
    joinIf(ROOTS.workspace, 'USER.md'),
    ...(await walk(joinIf(ROOTS.workspace, 'memory'), { extensions: ['.md'], max: 20, depth: 2 })),
    ...(await walk(joinIf(ROOTS.fridayVault, '100 Memory System'), { extensions: ['.md'], max: 20, depth: 3 })),
    ...(await walk(joinIf(ROOTS.fridayVault, '300 Action Logs'), { extensions: ['.md'], max: 20, depth: 3 })),
  ].filter(Boolean)
  const unique = [...new Set(files)]
  const entries: MemoryEntry[] = []
  for (const file of unique) {
    const text = await readText(file)
    if (!text.trim()) continue
    const stat = await fs.stat(file).catch(() => null)
    const title = text.match(/^#\s+(.+)$/m)?.[1] || path.basename(file, '.md')
    const excerpt = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('---') && !l.startsWith('tags:')).slice(0, 4).join(' ').slice(0, 260)
    entries.push({ id: `mem-${hashId(file)}`, title, source: rel(file), excerpt, updatedAt: stat?.mtime.toISOString() })
  }
  return entries.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 40)
}

function collectCrew(tasks: MissionTask[], cron: MissionCron[], kanban: KanbanActivity): CrewMember[] {
  const FRESH_MS = 1000 * 60 * 90
  return (Object.keys(CREW) as CrewId[]).map(id => {
    const memberTasks = tasks.filter(t => t.owner === id && t.status !== 'done')
    const memberCron = cron.filter(c => c.owner === id)
    const kb = kanban.byAssignee[id]
    const last = memberCron.map(c => c.lastRunAt).filter(Boolean).sort().at(-1)
    const next = memberCron.map(c => c.nextRunAt).filter(Boolean).sort().at(0)

    // Live kanban state is the strongest signal: a running task means the agent
    // is actually doing something right now, not merely scheduled to.
    if (kb && kb.lastEventAt && Date.now() - Date.parse(kb.lastEventAt) < FRESH_MS) {
      const status: CrewMember['status'] = kb.failed > 0 ? 'attention' : kb.running > 0 ? 'active' : 'standby'
      return {
        ...CREW[id],
        status,
        lastRun: kb.lastEventAt,
        nextRun: next,
        signal: `kanban: ${kb.running} running · ${kb.open} open${kb.failed ? ` · ${kb.failed} failed` : ''}`,
      }
    }

    // Attention should mean a real runtime/scheduler problem, not just a queued task that contains words like "fix" or "risk".
    const attention = memberCron.some(c => c.enabled && c.lastRunStatus === 'error')
    // Visual "active" should mean the agent actually ran recently, not merely that it owns an active-looking task.
    const active = memberCron.some(c => c.lastRunAt && Date.now() - Date.parse(c.lastRunAt) < FRESH_MS)
    const status: CrewMember['status'] = attention ? 'attention' : active ? 'active' : memberCron.length ? 'standby' : memberTasks.length ? 'on-demand' : 'sleeping'
    return {
      ...CREW[id],
      status,
      lastRun: last,
      nextRun: next,
      signal: `${memberTasks.length} open tasks · ${memberCron.length} scheduled systems`,
    }
  })
}


/** Consecutive days (ending today or yesterday) with at least one contribution. */
function streakFromCalendar(weeks: GitHubActivity['weeks']): number {
  const days = weeks.flatMap(w => w.contributionDays).sort((a, b) => a.date.localeCompare(b.date))
  const today = new Date().toISOString().slice(0, 10)
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].date > today) continue
    if (days[i].contributionCount > 0) streak++
    else if (days[i].date === today) continue // today can still get commits; don't break the streak on it
    else break
  }
  return streak
}

async function collectGithub(): Promise<GitHubActivity> {
  const username = getConfig().github.username
  const empty: GitHubActivity = { username, weeks: [], repos: [], recentEvents: [], source: 'gh cli + GitHub API' }
  if (!username) return { ...empty, source: 'not configured — set github.username in data/config.json' }
  try {
    // No from/to → GitHub returns its natural rolling-year calendar (the exact
    // 52/53-week window the profile page shows). contributionLevel is GitHub's
    // own quartile bucket, so heatmap colors match the real graph rather than a
    // naive min(4, count) approximation.
    const query = `query($login:String!) { user(login:$login) { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } } } repositories(first: 18, orderBy:{field:PUSHED_AT, direction:DESC}, ownerAffiliations:[OWNER]) { totalCount nodes { name url description isPrivate updatedAt pushedAt stargazerCount primaryLanguage { name } issues(states:OPEN) { totalCount } pullRequests(states:OPEN) { totalCount } } } } }`
    const gql = await execFileAsync('gh', ['api', 'graphql', '-f', `query=${query}`, '-f', `login=${username}`], { timeout: 12000 })
    const json = JSON.parse(gql.stdout)
    const user = json.data?.user
    const calendar = user?.contributionsCollection?.contributionCalendar
    type GitHubGraphQLRepo = {
      name: string; url: string; description?: string; isPrivate: boolean; updatedAt: string; pushedAt: string
      stargazerCount?: number; issues?: { totalCount: number }; pullRequests?: { totalCount: number }; primaryLanguage?: { name: string }
    }
    const repos: GitHubRepoSignal[] = (user?.repositories?.nodes || []).map((r: GitHubGraphQLRepo) => ({
      name: r.name, url: r.url, description: r.description || undefined, private: Boolean(r.isPrivate), updatedAt: r.updatedAt, pushedAt: r.pushedAt, stars: r.stargazerCount || 0, openIssues: r.issues?.totalCount || 0, openPrs: r.pullRequests?.totalCount || 0, language: r.primaryLanguage?.name,
    }))
    const eventsRaw = await execFileAsync('gh', ['api', `users/${username}/events/public`, '--jq', '.[:12] | map({type, repo: .repo.name, createdAt: .created_at})'], { timeout: 8000 }).catch(() => ({ stdout: '[]' }))
    type GitHubEventRaw = { type?: string; repo?: string; createdAt?: string }
    const recentEvents = (JSON.parse(eventsRaw.stdout || '[]') as GitHubEventRaw[]).map((event, index) => ({
      type: String(event.type || 'Event'),
      repo: String(event.repo || 'unknown/repo'),
      createdAt: String(event.createdAt || new Date(0).toISOString()),
      // Keep an index-stabilized server shape because GitHub can return repeated event type/repo/timestamp tuples.
      key: `${event.type || 'Event'}-${event.repo || 'unknown'}-${event.createdAt || 'unknown'}-${index}`,
    }))
    // GitHub's quartile level → 0-4 intensity (exact match to the profile graph).
    const LEVEL_MAP: Record<string, number> = {
      NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4,
    }
    type GitHubCalDay = { date: string; contributionCount: number; contributionLevel?: string }
    const weeks = (calendar?.weeks || []).map((w: { contributionDays: GitHubCalDay[] }) => ({
      contributionDays: w.contributionDays.map((d: GitHubCalDay) => ({
        date: d.date,
        contributionCount: d.contributionCount,
        level: d.contributionLevel != null ? (LEVEL_MAP[d.contributionLevel] ?? Math.min(4, d.contributionCount)) : Math.min(4, d.contributionCount),
      })),
    }))
    // The contribution calendar counts automated pushes too (e.g. sync bots
    // committing daily), so the streak is labeled rather than presented as personal.
    const hasAutomation = repos.some(r => /claude-sync|auto-?commit|sync-?bot/i.test(r.name))
    return {
      ...empty,
      totalContributions: calendar?.totalContributions,
      weeks,
      repos,
      recentEvents,
      currentStreak: streakFromCalendar(weeks),
      streakNote: hasAutomation ? 'includes automated claude-sync commits' : undefined,
      syncedAt: new Date().toISOString(),
    }
  } catch {
    return empty
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONL log lines have unbounded shape
function usageFromObject(obj: Record<string, any>) {
  const message = obj?.message || obj?.response || obj
  const usage = message?.usage || obj?.usage || obj?.response?.usage
  if (!usage) return null

  const input = usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens ?? usage.input ?? 0
  const output = usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens ?? usage.output ?? 0
  const cacheRead = usage.cache_read_tokens ?? usage.cacheReadTokens ?? usage.cacheRead ?? 0
  const cacheWrite = usage.cache_write_tokens ?? usage.cacheWriteTokens ?? usage.cacheWrite ?? 0
  const explicitTotal = usage.total_tokens ?? usage.totalTokens
  const total = Number(explicitTotal ?? (Number(input) + Number(output) + Number(cacheRead) + Number(cacheWrite))) || 0
  const billableTokens = (Number(input) || 0) + (Number(output) || 0) + (Number(cacheWrite) || 0)

  const model = message.model || obj.model || usage.model || obj.providerMetadata?.model || 'unknown'
  const provider = message.provider || obj.provider || message.api || obj.api || obj.providerName || (String(model).includes('/') ? String(model).split('/')[0] : 'unknown')
  const costObj = usage.cost || {}
  const costInput = Math.max(0, Number(costObj.input ?? 0) || 0)
  const costOutput = Math.max(0, Number(costObj.output ?? 0) || 0)
  const costCacheRead = Math.max(0, Number(costObj.cacheRead ?? costObj.cache_read ?? 0) || 0)
  const costCacheWrite = Math.max(0, Number(costObj.cacheWrite ?? costObj.cache_write ?? 0) || 0)
  const rawCost = Number(costObj.total ?? usage.estimatedCostUsd ?? usage.costUsd ?? obj.costUsd ?? (costInput + costOutput + costCacheRead + costCacheWrite))
  // Some provider logs use negative placeholder values when billing metadata is unavailable.
  // Treat those as unknown/zero so dashboard totals do not show impossible negative spend.
  const cost = Number.isFinite(rawCost) && rawCost > 0 ? rawCost : 0
  const timestamp = obj.timestamp || message.timestamp || obj.createdAt || message.createdAt
  const iso = typeof timestamp === 'number' ? new Date(timestamp).toISOString() : String(timestamp || '')
  const failed = Boolean(message.errorMessage || message.stopReason === 'error' || obj.error || obj.status === 'error')

  return {
    model: String(model),
    provider: String(provider),
    input: Number(input) || 0,
    output: Number(output) || 0,
    cacheRead: Number(cacheRead) || 0,
    cacheWrite: Number(cacheWrite) || 0,
    total,
    billableTokens,
    cost,
    costInput,
    costOutput,
    costCacheRead,
    costCacheWrite,
    timestamp: iso,
    failed,
  }
}

async function resolveOpenRouterKey(): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  // Fallback: read from the configured provider env file (never logged/returned)
  const cfg = getConfig()
  if (cfg.keys.openrouterApiKey) return cfg.keys.openrouterApiKey
  if (!cfg.paths.providerEnvFile) return null
  const providerEnv = await readText(cfg.paths.providerEnvFile)
  const match = providerEnv.match(/OPENROUTER_API_KEY\s*=\s*(\S+)/)
  return match?.[1] ?? null
}

async function fetchOpenRouterUsage(): Promise<CostDashboard['openRouterLive'] | null> {
  const key = await resolveOpenRouterKey()
  if (!key) return null
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${key}`, 'X-Title': getConfig().appName },
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json() as {
      data?: {
        usage?: number; usage_monthly?: number; usage_weekly?: number; usage_daily?: number
        limit?: number; limit_remaining?: number; label?: string
      }
    }
    const d = json?.data
    if (!d) return null
    return {
      usageUsd: Number(d.usage ?? 0),
      usageMonthly: Number(d.usage_monthly ?? d.usage ?? 0),
      usageWeekly: Number(d.usage_weekly ?? 0),
      usageDaily: Number(d.usage_daily ?? 0),
      limit: d.limit != null ? Number(d.limit) : null,
      limitRemaining: d.limit_remaining != null ? Number(d.limit_remaining) : null,
      label: String(d.label || 'OpenRouter'),
    }
  } catch {
    return null
  }
}

async function collectClaudeUsage(): Promise<CostDashboard['claudeUsage']> {
  const claudeProjects = path.join(getConfig().homeDir, '.claude/projects')
  const files = await walk(claudeProjects, { extensions: ['.jsonl'], max: 2000, depth: 6 })
  const byModel = new Map<string, { inputTokens: number; outputTokens: number; cacheTokens: number; totalTokens: number }>()
  const byDay = new Map<string, { tokens: number; byModel: Record<string, number> }>()

  for (const file of files) {
    const text = await readText(file)
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || !line.includes('tokens')) continue
      let obj: Record<string, unknown>
      try { obj = JSON.parse(line) } catch { continue }
      const msg = (obj.message || obj) as Record<string, unknown>
      const usage = (msg.usage || {}) as Record<string, unknown>
      const model = String(msg.model || obj.model || 'claude-unknown')
      if (!model.startsWith('claude')) continue
      const input = Number(usage.input_tokens ?? 0)
      const output = Number(usage.output_tokens ?? 0)
      const cache = Number(usage.cache_creation_input_tokens ?? 0) + Number(usage.cache_read_input_tokens ?? 0)
      if (!input && !output && !cache) continue
      const total = input + output + cache
      const cur = byModel.get(model) ?? { inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0 }
      cur.inputTokens += input; cur.outputTokens += output; cur.cacheTokens += cache; cur.totalTokens += total
      byModel.set(model, cur)
      const ts = String(obj.timestamp || msg.timestamp || (obj as Record<string, unknown>).createdAt || '')
      const date = ts.slice(0, 10) || 'unknown'
      const day = byDay.get(date) ?? { tokens: 0, byModel: {} }
      day.tokens += total
      day.byModel[model] = (day.byModel[model] ?? 0) + total
      byDay.set(date, day)
    }
  }

  const models = [...byModel.entries()].map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
  const daily = [...byDay.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)

  return {
    models,
    totalInputTokens: models.reduce((s, m) => s + m.inputTokens, 0),
    totalOutputTokens: models.reduce((s, m) => s + m.outputTokens, 0),
    totalCacheTokens: models.reduce((s, m) => s + m.cacheTokens, 0),
    totalTokens: models.reduce((s, m) => s + m.totalTokens, 0),
    daily,
  }
}

async function collectCosts(): Promise<CostDashboard> {
  const files = await walk(ROOTS.agentSessions, { extensions: ['.jsonl'], max: 900, depth: 5 })
  const byModel = new Map<string, ModelUsage>()
  const byDay = new Map<string, { date: string; requests: number; tokens: number; billableTokens: number; cost: number; byModel: Record<string, { tokens: number; cost: number }> }>()
  for (const file of files) {
    const text = await readText(file)
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || !line.includes('usage')) continue
      let obj: Record<string, unknown>
      try { obj = JSON.parse(line) } catch { continue }
      const u = usageFromObject(obj)
      if (!u) continue
      const key = `${u.provider}::${u.model}`
      const current = byModel.get(key) || {
        model: u.model,
        provider: u.provider,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        billableTokens: 0,
        estimatedCostUsd: 0,
        costInputUsd: 0,
        costOutputUsd: 0,
        costCacheReadUsd: 0,
        costCacheWriteUsd: 0,
        failedRequests: 0,
        lastUsedAt: undefined,
        tokenShare: 0,
        costShare: 0,
      }
      current.requests += 1
      current.inputTokens += u.input
      current.outputTokens += u.output
      current.cacheReadTokens += u.cacheRead
      current.cacheWriteTokens += u.cacheWrite
      current.totalTokens += u.total
      current.billableTokens += u.billableTokens
      current.estimatedCostUsd += u.cost
      current.costInputUsd += u.costInput
      current.costOutputUsd += u.costOutput
      current.costCacheReadUsd += u.costCacheRead
      current.costCacheWriteUsd += u.costCacheWrite
      current.failedRequests += u.failed ? 1 : 0
      if (u.timestamp && (!current.lastUsedAt || u.timestamp > current.lastUsedAt)) current.lastUsedAt = u.timestamp
      byModel.set(key, current)
      const date = String(u.timestamp || obj.timestamp || obj.createdAt || '').slice(0, 10) || 'unknown'
      const day = byDay.get(date) || { date, requests: 0, tokens: 0, billableTokens: 0, cost: 0, byModel: {} }
      day.requests += 1; day.tokens += u.total; day.billableTokens += u.billableTokens; day.cost += u.cost
      const modelKey = u.model || 'unknown'
      if (!day.byModel[modelKey]) day.byModel[modelKey] = { tokens: 0, cost: 0 }
      day.byModel[modelKey].tokens += u.total
      day.byModel[modelKey].cost += u.cost
      byDay.set(date, day)
    }
  }
  const allModels = [...byModel.values()]
  const totalTokensAll = allModels.reduce((s, m) => s + m.totalTokens, 0)
  const totalCostAll = allModels.reduce((s, m) => s + m.estimatedCostUsd, 0)
  const models = allModels
    .map(m => ({ ...m, tokenShare: totalTokensAll ? m.totalTokens / totalTokensAll : 0, costShare: totalCostAll ? m.estimatedCostUsd / totalCostAll : 0 }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 60)
  // Fetch live OpenRouter billing data
  const orUsage = await fetchOpenRouterUsage()
  const warnings: string[] = models.length ? [] : ['No model usage entries found in local session logs.']
  let orLive: import('./types').ModelUsage | null = null
  if (orUsage) {
    // Find if we already have any openrouter model entries from logs
    const loggedOrCost = models.filter(m => /openrouter/i.test(`${m.provider} ${m.model}`)).reduce((s, m) => s + m.estimatedCostUsd, 0)
    orLive = {
      model: orUsage.label,
      provider: 'openrouter-api',
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      billableTokens: 0,
      estimatedCostUsd: orUsage.usageUsd,
      costInputUsd: 0,
      costOutputUsd: 0,
      costCacheReadUsd: 0,
      costCacheWriteUsd: 0,
      failedRequests: 0,
      tokenShare: 0,
      costShare: 0,
    }
    if (orUsage.limit != null) {
      const pct = Math.round((orUsage.usageUsd / orUsage.limit) * 100)
      warnings.push(`OpenRouter live: $${orUsage.usageUsd.toFixed(4)} used of $${orUsage.limit} limit (${pct}%)`)
    }
    if (loggedOrCost > 0 && Math.abs(orUsage.usageUsd - loggedOrCost) > 0.01) {
      warnings.push(`OpenRouter log vs API discrepancy: logs=$${loggedOrCost.toFixed(4)}, API=$${orUsage.usageUsd.toFixed(4)}`)
    }
  }
  const claudeUsage = await collectClaudeUsage()
  const allCostUsd = models.reduce((s, m) => s + m.estimatedCostUsd, 0) + (orLive ? orLive.estimatedCostUsd : 0)
  return {
    source: `${rel(ROOTS.agentSessions)} session usage logs`,
    totalRequests: models.reduce((s, m) => s + m.requests, 0),
    totalTokens: models.reduce((s, m) => s + m.totalTokens, 0),
    totalBillableTokens: models.reduce((s, m) => s + m.billableTokens, 0),
    totalInputTokens: models.reduce((s, m) => s + m.inputTokens, 0),
    totalOutputTokens: models.reduce((s, m) => s + m.outputTokens, 0),
    totalCacheReadTokens: models.reduce((s, m) => s + m.cacheReadTokens, 0),
    totalCacheWriteTokens: models.reduce((s, m) => s + m.cacheWriteTokens, 0),
    estimatedCostUsd: allCostUsd,
    openRouterLive: orUsage ?? undefined,
    claudeUsage: claudeUsage ?? undefined,
    models,
    openRouterModels: models.filter(m => /openrouter/i.test(`${m.provider} ${m.model}`)),
    daily: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30),
    warnings,
  }
}


function fileKind(file: string): ActivityItem['kind'] {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.md') return 'markdown'
  if (['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.mjs'].includes(ext)) return ext === '.json' ? 'config' : 'code'
  if (['.jsonl', '.csv', '.sqlite', '.db'].includes(ext)) return 'data'
  return 'other'
}

// NB: roots may be '' (unconfigured) and ''.startsWith is always true — guard each.
function under(file: string, root: string): boolean {
  return Boolean(root) && file.startsWith(root)
}

function areaFor(file: string): ActivityItem['area'] {
  if (under(file, ROOTS.inbox)) return 'inbox'
  if (under(file, ROOTS.repo)) return 'repo'
  if (under(file, ROOTS.vault)) return 'vault'
  if (under(file, ROOTS.workspace) || under(file, ROOTS.fridayWorkspace)) return 'workspace'
  if (under(file, ROOTS.usageLogs)) return 'logs'
  return 'workspace'
}

async function activityItem(file: string, event: ActivityItem['event']): Promise<ActivityItem | null> {
  const stat = await fs.stat(file).catch(() => null)
  if (!stat?.isFile()) return null
  const title = path.basename(file).replace(/\.[^.]+$/, '')
  const owner = ownerFor(`${title} ${file}`)
  return {
    id: `act-${hashId(`${file}:${stat.mtimeMs}:${event}`)}`,
    path: rel(file),
    area: areaFor(file),
    kind: fileKind(file),
    event,
    title,
    updatedAt: stat.mtime.toISOString(),
    ageMinutes: Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 60000)),
    owner,
    ownerName: CREW[owner].name,
  }
}

/** Run up to `limit` promises at a time from the array of thunks. */
async function throttled<T>(thunks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = []
  let i = 0
  async function next(): Promise<void> {
    while (i < thunks.length) {
      const idx = i++
      results[idx] = await thunks[idx]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, () => next()))
  return results
}

async function collectOperations(): Promise<OperationsDashboard> {
  const scanRoots = [ROOTS.repo, ROOTS.workspace, ROOTS.fridayWorkspace, ROOTS.fridayVault, ROOTS.usageLogs].filter(Boolean)
  const files = (await Promise.all(scanRoots.map(r => walk(r, { extensions: ['.md', '.ts', '.tsx', '.js', '.json', '.jsonl', '.css'], max: 500, depth: 6 })))).flat()
  const items = (await throttled(files.map(f => () => activityItem(f, under(f, ROOTS.usageLogs) ? 'log-update' : 'recent-change')), 50)).filter(Boolean) as ActivityItem[]
  const recentFiles = items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 40)
  const inboxFiles = ROOTS.inbox ? await walk(ROOTS.inbox, { extensions: ['.md', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.json'], max: 80, depth: 4 }) : []
  const inbox = ((await Promise.all(inboxFiles.map(f => activityItem(f, 'inbox-item')))).filter(Boolean) as ActivityItem[]).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 20)
  const hour = recentFiles.filter(i => i.ageMinutes <= 60).length
  const day = recentFiles.filter(i => i.ageMinutes <= 1440).length
  return {
    source: `${rel(ROOTS.repo)} + ${rel(ROOTS.workspace)} + ${rel(ROOTS.fridayVault)} polled from filesystem mtimes`,
    recentFiles,
    inbox,
    hotspots: [
      { label: 'changed <1h', count: hour, tone: hour ? 'green' : 'slate' },
      { label: 'changed <24h', count: day, tone: day ? 'blue' : 'slate' },
      { label: 'inbox items', count: inbox.length, tone: inbox.length ? 'amber' : 'green' },
      { label: 'repo writes', count: recentFiles.filter(i => i.area === 'repo').length, tone: 'blue' },
      { label: 'vault writes', count: recentFiles.filter(i => i.area === 'vault').length, tone: 'blue' },
    ],
  }
}

type CalendarResult = {
  events: CalendarEvent[]
  status: { configured: boolean; ok: boolean; syncedAt: string | null; detail: string }
}

async function getCalendarEvents(): Promise<CalendarResult> {
  const credsPath = getConfig().paths.googleCalendarCredsFile
  const credsExists = credsPath ? await exists(credsPath) : false

  if (!credsExists) {
    return { events: [], status: { configured: false, ok: false, syncedAt: null, detail: `No service-account credentials at ${rel(credsPath)} — calendar is not bound to a live source` } }
  }

  try {
    const creds = JSON.parse(await fs.readFile(credsPath, 'utf-8'))
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    })
    
    const calendar = google.calendar({ version: 'v3', auth })
    
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      maxResults: 20,
      singleEvents: true,
      orderBy: 'startTime',
    })
    
    const events = (response.data.items || []).map(event => ({
      id: event.id || '',
      summary: event.summary || '(no title)',
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      htmlLink: event.htmlLink || '',
    }))
    return { events, status: { configured: true, ok: true, syncedAt: new Date().toISOString(), detail: `Synced ${events.length} event(s) from Google Calendar (service account, next 7 days)` } }
  } catch (err) {
    logger.error('calendar', err)
    return { events: [], status: { configured: true, ok: false, syncedAt: new Date().toISOString(), detail: 'Google Calendar sync failed — credentials exist but the API call errored' } }
  }
}

async function integrations(): Promise<IntegrationState[]> {
  const checks: IntegrationState[] = []
  checks.push({ name: 'OpenClaw workspace', status: await exists(ROOTS.workspace) ? 'connected' : 'missing', detail: rel(ROOTS.workspace) })
  checks.push({ name: 'Obsidian vault', status: await exists(ROOTS.vault) ? 'connected' : 'missing', detail: rel(ROOTS.vault) })
  checks.push({ name: 'Hermes cron scheduler', status: await exists(ROOTS.cronJobs) ? 'connected' : 'missing', detail: rel(ROOTS.cronJobs) })
  checks.push({ name: 'Hermes kanban DB', status: await exists(ROOTS.kanbanDb) ? 'connected' : 'missing', detail: rel(ROOTS.kanbanDb) })
  checks.push({ name: 'GitHub CLI', status: await exists(path.join(getConfig().homeDir, '.config/gh/hosts.yml')) ? 'connected' : 'partial', detail: 'gh used server-side for repo snapshots' })
  const gcalCreds = getConfig().paths.googleCalendarCredsFile
  const gcalExists = gcalCreds ? await exists(gcalCreds) : false
  checks.push({ name: 'Google Calendar', status: gcalExists ? 'connected' : 'missing', detail: gcalExists ? 'Service account configured' : 'No credentials found' })
  // Stripe — check for live/test key presence in workspace .env
  const envText = ROOTS.fridayWorkspace ? await readText(path.join(ROOTS.fridayWorkspace, '.env')) : ''
  const hasStripe = /stripe/i.test(envText)
  checks.push({ name: 'Stripe', status: hasStripe ? 'connected' : 'missing', detail: hasStripe ? 'Ticker Signals Pro — live keys present' : 'No Stripe keys in .env' })
  // Resend — check for Resend API key presence
  const hasResend = /resend/i.test(envText)
  checks.push({ name: 'Resend', status: hasResend ? 'connected' : 'missing', detail: hasResend ? 'Email API — signals delivery configured' : 'No Resend keys in .env' })
  return checks
}

type IdeasResult = { ideas: Idea[]; status: { path: string; exists: boolean } }

async function collectIdeas(): Promise<IdeasResult> {
  const ideasPath = path.join(ROOTS.workspace, 'ideas.json')
  const fileExists = await exists(ideasPath)
  const raw = fileExists ? await readJson<Idea[]>(ideasPath) : null
  const ideas = Array.isArray(raw) ? raw : []
  return { ideas: ideas.slice(0, 100), status: { path: rel(ideasPath), exists: fileExists } }
}

type MissionsResult = {
  missions: Mission[]
  status: { path: string | null; updatedAt: string | null; stale: boolean }
}

const MISSIONS_STALE_MS = 7 * 24 * 60 * 60 * 1000

async function collectMissions(): Promise<MissionsResult> {
  const candidates = [
    path.join(process.cwd(), 'missions.json'),
    joinIf(ROOTS.fridayWorkspace, 'missions.json'),
  ].filter(Boolean)
  for (const p of candidates) {
    const raw = await readJson<Mission[] | { missions: Mission[] }>(p)
    const arr = Array.isArray(raw) ? raw : (raw && Array.isArray((raw as { missions: Mission[] }).missions) ? (raw as { missions: Mission[] }).missions : null)
    if (arr && arr.length > 0) {
      const stat = await fs.stat(p).catch(() => null)
      const updatedAt = stat?.mtime.toISOString() ?? null
      const missions = arr.map((m, i) => ({
        id: m.id || `mission-${i}`,
        title: m.title || 'Untitled mission',
        description: m.description,
        assignedTo: (m as Mission & { owner?: string }).owner || m.assignedTo,
        priority: m.priority || 'medium',
        status: m.status || 'pending',
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        labels: (m as Mission & { labels?: string[] }).labels,
      })).slice(0, 100)
      return { missions, status: { path: rel(p), updatedAt, stale: !updatedAt || Date.now() - Date.parse(updatedAt) > MISSIONS_STALE_MS } }
    }
  }
  return { missions: [], status: { path: null, updatedAt: null, stale: true } }
}

/** Wrap a collector so one failure doesn't take down the whole dashboard. */
async function safeCollect<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    logger.error('collector', err, { collector: name })
    return fallback
  }
}

export async function getMissionData(): Promise<MissionData> {
  const emptyGithub: GitHubActivity = { username: getConfig().github.username, weeks: [], repos: [], recentEvents: [], source: 'unavailable' }
  const emptyCosts: CostDashboard = { source: 'unavailable', totalRequests: 0, totalTokens: 0, totalBillableTokens: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheWriteTokens: 0, estimatedCostUsd: 0, models: [], openRouterModels: [], daily: [], warnings: ['Cost collection failed'] }
  const emptyOps: OperationsDashboard = { source: 'unavailable', recentFiles: [], inbox: [], hotspots: [] }
  const emptyCalendar: CalendarResult = { events: [], status: { configured: false, ok: false, syncedAt: null, detail: 'Calendar collection failed' } }
  const emptyIdeas: IdeasResult = { ideas: [], status: { path: rel(path.join(ROOTS.workspace, 'ideas.json')), exists: false } }
  const emptyMissions: MissionsResult = { missions: [], status: { path: null, updatedAt: null, stale: true } }
  const emptyKanban: KanbanActivity = { available: false, source: rel(ROOTS.kanbanDb), openTasks: 0, runningTasks: 0, lastEventAt: null, byAssignee: {} }

  const [tasks, cron, memory, integrationStates, github, costs, operations, calendarResult, ideasResult, missionsResult, kanban] = await Promise.all([
    safeCollect('tasks', collectTasks, []),
    safeCollect('cron', collectCron, []),
    safeCollect('memory', collectMemory, []),
    safeCollect('integrations', integrations, []),
    safeCollect('github', collectGithub, emptyGithub),
    safeCollect('costs', collectCosts, emptyCosts),
    safeCollect('operations', collectOperations, emptyOps),
    safeCollect('calendar', getCalendarEvents, emptyCalendar),
    safeCollect('ideas', collectIdeas, emptyIdeas),
    safeCollect('missions', collectMissions, emptyMissions),
    safeCollect('kanban', collectKanbanActivity, emptyKanban),
  ])
  const [projects, vaultFiles] = await Promise.all([collectProjects(tasks), walk(ROOTS.vault, { extensions: ['.md'], max: 1000, depth: 8 })])
  const warnings = integrationStates.filter(i => i.status === 'attention').map(i => `${i.name}: ${i.detail}`)
  // Tag every record with the producing agent so the frontend can attribute data.
  // OpenClaw is the default filesystem-based producer; Hermes records (cron,
  // kanban) are tagged hermes at the source.
  const aid = 'openclaw' as const
  const tagList = <T extends { agent_id?: import('./types').AgentId }>(arr: T[]): T[] =>
    arr.map(item => item.agent_id ? item : { ...item, agent_id: aid })
  const tagObj = <T extends { agent_id?: import('./types').AgentId }>(obj: T): T =>
    obj.agent_id ? obj : { ...obj, agent_id: aid }

  return {
    generatedAt: new Date().toISOString(),
    agent_id: aid,
    roots: Object.fromEntries(Object.entries(ROOTS).map(([k, v]) => [k, rel(v)])),
    counts: {
      tasks: tasks.length,
      openTasks: tasks.filter(t => t.status !== 'done').length,
      doneTasks: tasks.filter(t => t.status === 'done').length,
      cronJobs: cron.length,
      enabledCronJobs: cron.filter(c => c.enabled).length,
      projects: projects.length,
      memoryFiles: memory.length,
      vaultMarkdown: vaultFiles.length,
      calendarEvents: calendarResult.events.length,
    },
    tasks: tagList(tasks),
    cron: cron.map(c => ({ ...c, agent_id: 'hermes' as const })),
    projects: tagList(projects),
    crew: tagList(collectCrew(tasks, cron, kanban)),
    memory: tagList(memory),
    github: tagObj(github),
    costs: tagObj(costs),
    operations: tagObj(operations),
    integrations: tagList(integrationStates),
    calendar: tagList(calendarResult.events),
    ideas: tagList(ideasResult.ideas),
    missions: tagList(missionsResult.missions),
    kanban,
    sources: {
      calendar: calendarResult.status,
      ideas: ideasResult.status,
      missions: missionsResult.status,
      kanban: { available: kanban.available, source: kanban.source, lastEventAt: kanban.lastEventAt },
    },
    warnings,
  }
}
