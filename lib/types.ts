export type CrewId = 'friday' | 'echo' | 'sage' | 'forge' | 'ticker' | 'scout' | 'crypto'

export type AgentId = 'openclaw' | 'hermes' | 'jarvis' | 'crypto'

export type TaskStatus = 'active' | 'backlog' | 'scheduled' | 'done' | 'attention'

export type MissionTask = {
  id: string
  title: string
  status: TaskStatus
  owner: CrewId
  ownerName: string
  source: string
  line?: number
  priority: 'high' | 'normal' | 'low'
  detail?: string
  agent_id?: AgentId
}

export type MissionCron = {
  id: string
  name: string
  enabled: boolean
  owner: CrewId
  ownerName: string
  cadence: 'daily' | 'recurring' | 'one-shot'
  schedule: string
  timezone?: string
  nextRunAt?: string
  lastRunAt?: string
  lastRunStatus?: string
  description?: string
  payloadPreview?: string
  delivery?: string
  agent_id?: AgentId
}

export type MissionProject = {
  id: string
  name: string
  kind: 'obsidian' | 'github' | 'workspace'
  source: string
  signal: string
  tasks: number
  /** Open to-do tasks wired to this project (non-done kanban/task records). */
  todo?: { id: string; title: string; ownerName: string; priority: MissionTask['priority']; status: string }[]
  updatedAt?: string
  github?: {
    repo: string
    openIssues?: number
    openPrs?: number
    recentCommit?: string
  }
  agent_id?: AgentId
}

export type CrewMember = {
  id: CrewId
  name: string
  role: string
  station: string
  room: string
  status: 'active' | 'standby' | 'sleeping' | 'on-demand' | 'attention' | 'offline'
  model?: string
  signal: string
  lastRun?: string
  nextRun?: string
  accent: string
  agent_id?: AgentId
}

export type MemoryEntry = {
  id: string
  title: string
  source: string
  excerpt: string
  updatedAt?: string
  agent_id?: AgentId
}

/**
 * Obsidian vault node graph (Memory tab). A node is either a real note
 * (`kind: 'note'`) or a synthetic tag hub (`kind: 'tag'`, `id: "tag:<name>"`)
 * that fans out to every note carrying that tag — see
 * lib/obsidian-graph.ts for the parsing/graph-building rules.
 */
export type MemoryGraphNode = {
  id: string
  title: string
  folder: string
  tags: string[]
  kind: 'note' | 'tag'
  excerpt?: string
  updatedAt?: string
  /** Vault-relative note path (posix, no `.md`) for `obsidian://open` deep links — note nodes only. */
  path?: string
  /** True when the note has neither an outgoing/incoming link nor a tag. */
  isolated: boolean
  /** Tag nodes only: how many notes carry this tag. */
  noteCount?: number
}

export type MemoryGraphEdge = {
  source: string
  target: string
  kind: 'link' | 'tag'
}

export type MemoryGraph = {
  nodes: MemoryGraphNode[]
  edges: MemoryGraphEdge[]
  totalNotes: number
  connectedNotes: number
  /** Obsidian vault name (folder basename) for `obsidian://open` deep links. */
  vaultName?: string
}

export type GitHubRepoSignal = {
  name: string
  url: string
  description?: string
  private: boolean
  updatedAt?: string
  pushedAt?: string
  stars: number
  openIssues: number
  openPrs?: number
  language?: string
  agent_id?: AgentId
}

export type GitHubActivity = {
  username: string
  totalContributions?: number
  currentStreak?: number
  /** Caveat shown beside the streak, e.g. when automated repos inflate it. */
  streakNote?: string
  longestStreak?: number
  /** Rolling-year contribution calendar. `level` is GitHub's own quartile
   * intensity (0-4) so the heatmap colors match the real profile graph. */
  weeks: { contributionDays: { date: string; contributionCount: number; level?: number }[] }[]
  /** ISO timestamp the calendar was last fetched (drives the "synced" badge). */
  syncedAt?: string
  repos: GitHubRepoSignal[]
  recentEvents: { type: string; repo: string; createdAt: string; key?: string; agent_id?: AgentId }[]
  source: string
  agent_id?: AgentId
}

/** How a model's usage was paid for. Figures from different modes are never
 *  summed. See billingMode() in lib/collectors/costs-usage.ts. */
export type BillingMode = 'metered' | 'subscription' | 'local' | 'cloud-routed'

export type ModelUsage = {
  model: string
  provider: string
  mode: BillingMode
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  billableTokens: number
  estimatedCostUsd: number
  costInputUsd: number
  costOutputUsd: number
  costCacheReadUsd: number
  costCacheWriteUsd: number
  failedRequests: number
  lastUsedAt?: string
  tokenShare: number
  costShare: number
  agent_id?: AgentId
}

export type CostDashboard = {
  source: string
  totalRequests: number
  totalTokens: number
  totalBillableTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  estimatedCostUsd: number
  models: ModelUsage[]
  /** Calendar days covered by `daily` / `claudeUsage.daily` — the real window
   *  behind every "last N days" label on the costs view. */
  dailyWindowDays: number
  /** Per-billing-mode rollup. The dashboard's spine: each mode is reported on
   *  its own terms and the modes are never added together. */
  modes: {
    mode: BillingMode
    models: number
    requests: number
    billableTokens: number
    cacheReadTokens: number
    totalTokens: number
    /** Split of the billable side. `outputTokens` is the closest thing to
     *  "work produced" that is comparable across all four modes — unlike totals,
     *  nothing inflates it and Ollama reports it the same way OpenRouter does. */
    inputTokens: number
    outputTokens: number
    /** Real per-token spend. Meaningful ONLY for `metered`; zero elsewhere. */
    costUsd: number
    /** List-rate cost the client computed for usage a flat plan already paid
     *  for. Reported so the tokens aren't invisible, never added to spend. */
    notionalCostUsd: number
  }[]
  /** Per-token spend from METERED usage only — the only log-derived figure that
   *  corresponds to an invoice. `estimatedCostUsd` is the legacy all-provider
   *  sum and is retained only for the all-time burn chart. */
  meteredCostUsd: number
  openRouterLive?: {
    usageUsd: number
    /** Lifetime spend for the key — never mixed into monthly/total figures. */
    usageLifetime: number
    usageMonthly: number
    usageWeekly: number
    usageDaily: number
    limit: number | null
    limitRemaining: number | null
    label: string
  }
  claudeUsage?: {
    models: { model: string; inputTokens: number; outputTokens: number; cacheTokens: number; totalTokens: number }[]
    totalInputTokens: number
    totalOutputTokens: number
    totalCacheTokens: number
    totalTokens: number
    /** session file count over all history */
    sessionsCount: number
    /** Trailing `dailyWindowDays` calendar days. `models`/`totalTokens` above
     *  are all-time and are NOT limited to this window. */
    daily: { date: string; tokens: number; byModel: Record<string, number> }[]
    /** `YYYY-MM` → tokens, over ALL history. Monthly billing reconciles against
     *  this rather than `daily`, which only reaches back one window. */
    monthlyTokens: Record<string, number>
  }
  codexUsage?: {
    models: { model: string; inputTokens: number; outputTokens: number; cacheTokens: number; totalTokens: number }[]
    totalInputTokens: number
    totalOutputTokens: number
    totalCacheTokens: number
    totalTokens: number
    daily: { date: string; tokens: number; byModel: Record<string, number> }[]
    monthlyTokens: Record<string, number>
    planType: string | null
    sessionsCount: number
    lastActivityAt: string | null
  }
  daily: { date: string; requests: number; tokens: number; billableTokens: number; cost: number; byModel: Record<string, { tokens: number; billable: number; cost: number; requests: number }>; agent_id?: AgentId }[]
  /** Local (Ollama) inference analytics — token volume, tok/s throughput, and
   * cost avoided vs. the blended rate this month's real paid usage implies.
   * Absent (not just empty) when no local inference has been logged. */
  localCompute?: {
    totalTokens: number
    totalRequests: number
    daily: { date: string; tokens: number; requests: number }[]
    models: { model: string; tokens: number; requests: number; avgTokensPerSec: number | null }[]
    avgTokensPerSec: number | null
    /** Median and 95th-percentile tok/s. The mean is dragged around by a
     *  handful of near-zero turns (a 35B model on CPU logs 0.2 tok/s), so the
     *  median is the honest "what it usually does" number. */
    medianTokensPerSec: number | null
    p95TokensPerSec: number | null
    /** Wall-clock seconds the rig actually spent generating, summed over every
     *  sampled turn — the closest thing to "GPU time bought for free". */
    generationSeconds: number
    inputTokens: number
    outputTokens: number
    /** Highest-volume single day on record. */
    busiestDay: { date: string; tokens: number } | null
    sampleCount: number
    dailyThroughput: { date: string; avgTokensPerSec: number; samples: number }[]
    /** $/million tokens implied by real logged paid (non-local) usage; null if none is logged. */
    blendedApiRatePerMTokens: number | null
    /** The raw $ and token totals the blended rate was computed from, for an honest scope note. */
    blendedRateBasis: { costUsd: number; billableTokens: number } | null
    costAvoidedMonthUsd: number
    costAvoidedAllTimeUsd: number
    /** Ollama models routed to Ollama's HOSTED hardware (`:cloud`). Excluded
     * from every local figure above — they aren't this rig's compute and
     * aren't free — but surfaced so the tokens aren't silently unaccounted. */
    cloudRouted: { tokens: number; requests: number; models: string[] }
  }
  /** Per-month billing reconciliation: Claude subscription plan + flat cost for
   * that month, real OpenRouter billed $ (current month only — the key API only
   * exposes the current month + lifetime), and token/buildings per source. */
  billing?: {
    month: string
    plan: string
    planAmount: number
    fairUse: { codexTokens: number; note: string }
    openRouterUsd: number | null
    apiTokens: number
    claudeTokens: number
    codexTokens: number
    localTokens: number
    totalTokens: number
    logCost: number
  }[]
  /** The Claude subscription in effect for the current month. */
  subscription?: { month: string; plan: string; amount: number }
  /** Freshness of the usage data (newest parsed session timestamp). Used for self-healing staleness alerts. */
  freshness?: { lastLoggedAt: string | null; staleDays: number | null }
  warnings: string[]
  agent_id?: AgentId
}

export type ActivityItem = {
  id: string
  path: string
  area: 'workspace' | 'vault' | 'repo' | 'inbox' | 'cron' | 'logs'
  kind: 'markdown' | 'code' | 'config' | 'data' | 'other'
  event: 'recent-change' | 'inbox-item' | 'scheduled-run' | 'log-update'
  title: string
  updatedAt: string
  ageMinutes: number
  owner: CrewId
  ownerName: string
  agent_id?: AgentId
}

export type OperationsDashboard = {
  source: string
  recentFiles: ActivityItem[]
  inbox: ActivityItem[]
  hotspots: { label: string; count: number; tone: 'blue' | 'green' | 'amber' | 'red' | 'slate' }[]
  agent_id?: AgentId
}

export type IntegrationState = {
  name: string
  status: 'connected' | 'partial' | 'missing' | 'attention'
  detail: string
  agent_id?: AgentId
}

export type MissionData = {
  generatedAt: string
  roots: Record<string, string>
  counts: {
    tasks: number
    openTasks: number
    doneTasks: number
    cronJobs: number
    enabledCronJobs: number
    projects: number
    memoryFiles: number
    vaultMarkdown: number
    calendarEvents: number
  }
  tasks: MissionTask[]
  cron: MissionCron[]
  projects: MissionProject[]
  crew: CrewMember[]
  memory: MemoryEntry[]
  github: GitHubActivity
  costs: CostDashboard
  operations: OperationsDashboard
  integrations: IntegrationState[]
  calendar: CalendarEvent[]
  ideas: Idea[]
  missions: Mission[]
  kanban: KanbanActivity
  telemetry: SystemTelemetry
  /** Honest provenance for panels whose backing data may be missing or stale. */
  sources: {
    calendar: { configured: boolean; ok: boolean; syncedAt: string | null; detail: string }
    ideas: { path: string; exists: boolean }
    missions: { path: string | null; updatedAt: string | null; stale: boolean }
    kanban: { available: boolean; source: string; lastEventAt: string | null }
  }
  warnings: string[]
  agent_id?: AgentId
}

/** Live multi-agent task state read from the Hermes kanban DB. */
export type KanbanActivity = {
  available: boolean
  source: string
  openTasks: number
  runningTasks: number
  lastEventAt: string | null
  byAssignee: Record<string, { open: number; running: number; failed: number; lastEventAt: string | null }>
}

export type CalendarEvent = {
  id: string
  summary: string
  start: string
  end: string
  htmlLink: string
  agent_id?: AgentId
}

export type Idea = {
  title: string
  description?: string
  source: string
  status: 'new' | 'approved' | 'rejected'
  timestamp: string
  agent_id?: AgentId
}

export type Mission = {
  id: string
  title: string
  description?: string
  assignedTo?: string
  owner?: string
  labels?: string[]
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'active' | 'completed' | 'failed' | 'backlog'
  createdAt?: string
  updatedAt?: string
  agent_id?: AgentId
}

export type AgentHeartbeat = {
  id: string
  status: 'working' | 'idle' | 'error'
  currentTask?: string
  idea?: { title: string }
  receivedAt: number
}

/* ── Web Dev Pipeline (web-dev-pipeline skill) ─────────── */

export type PipelineStage =
  | 'leads_found'
  | 'social_scraped'
  | 'concept_ready'
  | 'awaiting_approval'
  | 'in_development'
  | 'completed'

export type PipelineLead = {
  id: string
  stage: PipelineStage
  businessName: string
  location?: string
  playStoreUrl?: string
  score?: number
  vertical?: string
  phone?: string
  website?: string
  rating?: number
  reviewCount?: number
  qualified?: boolean
  socials?: { instagram?: string; facebook?: string; linkedin?: string }
  extraData?: Record<string, string>
  concept?: {
    designDirection?: string
    inspirationSources?: string[]
    estimatedScope?: string
  }
  approval?: {
    telegramSentAt?: string
    status?: 'pending' | 'approved' | 'rejected'
    decidedAt?: string
  }
  development?: {
    taskId?: string
    status?: string
    progressPct?: number
    milestones?: { label: string; done: boolean }[]
  }
  completed?: {
    previewUrl?: string
    emailDraft?: string
    emailStatus?: 'draft' | 'awaiting_signoff' | 'approved' | 'sent'
    signoffSentAt?: string
  }
  history?: { stage: PipelineStage; ts: string; action?: string; note?: string }[]
  createdAt?: string
  updatedAt?: string
}

export type PipelineEvent = {
  ts: string
  leadId: string
  businessName?: string
  stage: PipelineStage
  action?: string
  detail?: string
}

export type PipelineData = {
  generatedAt: string
  source: string
  // Display set — per-stage caps applied (leads_found: top 20 by score;
  // other stages: newest 50). `counts` holds the TRUE per-stage totals.
  leads: PipelineLead[]
  counts: Record<PipelineStage, number>
  leadsTotal: number
  events: PipelineEvent[]
}

/* ── Hermes kanban (read-only view of ~/.hermes/kanban.db) ── */

export type HermesTask = {
  id: string
  title: string
  status: string
  assignee?: string
  priority: number
  createdBy?: string
  createdAt?: string
  startedAt?: string
  completedAt?: string
  consecutiveFailures: number
  lastFailureError?: string
  lastHeartbeatAt?: string
  currentRunId?: number
  sessionId?: string
  /** Which board this task came from: the local hostname or a remote name (e.g. 'friday-macbook'). */
  origin?: string
  /** Ids of parent tasks this task depends on (task_links where task is child). Additive. */
  parentIds?: string[]
}

export type HermesTaskRun = {
  id: number
  status: string
  outcome?: string
  profile?: string
  stepKey?: string
  startedAt?: string
  endedAt?: string
  summary?: string
  error?: string
}

export type HermesTaskComment = {
  id: number
  author: string
  body: string
  createdAt?: string
}

export type HermesTaskEvent = {
  id: number
  runId?: number
  kind: string
  payload?: string
  createdAt?: string
}

export type HermesTaskDetail = HermesTask & {
  body?: string
  workspacePath?: string
  runs: HermesTaskRun[]
  comments: HermesTaskComment[]
  events: HermesTaskEvent[]
}

export type HermesKanbanSnapshot = {
  generatedAt: string
  available: boolean
  counts: Record<string, number>
  tasks: HermesTask[]
}

/** Per-board status for the multi-machine kanban mirror (origin + availability). */
export type KanbanSourceStatus = {
  name: string
  origin: string
  available: boolean
  counts: Record<string, number>
}

export type KanbanMultiSnapshot = HermesKanbanSnapshot & {
  sources: KanbanSourceStatus[]
}

/* ── System health ─────────────────────────────────────── */

export type ServiceHealth = {
  id: string
  name: string
  status: 'up' | 'warn' | 'down'
  detail: string
  latencyMs?: number
}

export type SystemHealthData = {
  generatedAt: string
  services: ServiceHealth[]
  problems: number
}

/* ── System CORE telemetry (real host stats) ──────────── */

export type SystemTelemetry = {
  generatedAt: string
  cpu: { load1: number; load5: number; load15: number; cores: number } | null
  memory: { totalKb: number; availableKb: number } | null
  disk: { usedBytes: number; totalBytes: number } | null
  gpus: { index: number; name: string; utilPct: number; memUsedMb: number; memTotalMb: number; tempC: number }[] | null
  ollama: { name: string; sizeGb: number; vramGb: number }[] | null
}

/* ── Content Creation idea hub (ml-content skill) ─────────── */

export type MLContentIdea = {
  /** Deterministic id derived from week+title via deriveMLContentIdeaId — stable across GET requests reading the same static JSON files. */
  id: string
  week: number
  title: string
  project: string
  video: string
  x_thread: string[]
  shot_list: string[]
  score: number
  source_tweet?: string
  updated_at?: string
  /** Merged in from the dispatch sidecar file (data/ml-content-dispatched.json) — not present in the raw week-N.json source. */
  dispatched?: boolean
  dispatchedAt?: string
}

export type MLContentData = {
  generated_at: string
  ideas: MLContentIdea[]
}

/** Deterministic, non-random id for dispatch-tracking — must be stable across
 *  repeated GETs of the same static week-N.json idea. */
export function deriveMLContentIdeaId(idea: { week: number; title: string }): string {
  const slug = idea.title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `${idea.week}-${slug || 'untitled'}`
}

/* ── TickTick weekly calendar ─────────────────────────── */

export type TickTickTask = {
  id: string
  title: string
  /** ISO timestamp — the day the task is anchored to for the week grid. */
  date: string
  isAllDay?: boolean
  /** 0 = normal, 2 = completed (TickTick Open API convention). */
  status?: number
  priority?: number
  projectName?: string
  /** Project id from TickTick `/project` — used to key color dots. */
  projectId?: string
  /** Project hex color from TickTick `/project` (e.g. "#F5347E"). */
  projectColor?: string
}

/* ── Live agent activity (office floor) ───────────────── */

/** What an occupied desk is doing; 'idle' means nobody is there. */
export type WorkKind = 'building' | 'research' | 'content' | 'thinking' | 'idle'

export type AgentChannel = {
  id: string
  label: string
  /** True only when a session on this channel produced a message very recently. */
  live: boolean
  kind: WorkKind
  sessionCount: number
  lastActivityAt: string | null
  model: string | null
  /** Transport reachability where knowable (telegram gateway, tty present). */
  connected?: boolean
}

export type AgentActivity = {
  generatedAt: string
  channels: AgentChannel[]
  terminals: { tty: string; from: string }[]
  gatewayRunning: boolean
}

/* ── Sub-agent dispatch mesh (Team tab) ─────────────── */

export type TickTickWeekData = {
  configured: boolean
  tasks: TickTickTask[]
  error?: string
}
