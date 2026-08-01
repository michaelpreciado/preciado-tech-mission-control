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
  status: 'active' | 'standby' | 'sleeping' | 'on-demand' | 'attention'
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

export type ModelUsage = {
  model: string
  provider: string
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
  openRouterModels: ModelUsage[]
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
    daily: { date: string; tokens: number; byModel: Record<string, number> }[]
  }
  daily: { date: string; requests: number; tokens: number; billableTokens: number; cost: number; byModel: Record<string, { tokens: number; cost: number }>; agent_id?: AgentId }[]
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

/* ── Approvals inbox ───────────────────────────────────── */

export type ApprovalKind = 'pipeline_approval' | 'email_signoff' | 'task_attention' | 'exec_allowlist'

export type ApprovalItem = {
  id: string
  kind: ApprovalKind
  title: string
  summary?: string
  requestedAt?: string
  source: string
  href?: string
  leadId?: string
  /** True when the dashboard can decide it (APPROVE/REJECT buttons). */
  actionable: boolean
  payload?: Record<string, unknown>
}

export type ApprovalsData = {
  generatedAt: string
  pending: ApprovalItem[]
  info: ApprovalItem[]
  counts: { pending: number; info: number }
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

/* ── ML Content Loop (ml-content skill) ─────────── */

export type MLContentStage =
  | 'script_film'
  | 'edit_optimize'
  | 'post_promote'
  | 'done'

export type MLContentIdea = {
  week: number
  title: string
  project: string
  video: string
  x_thread: string[]
  shot_list: string[]
  score: number
  source_tweet?: string
  stage: MLContentStage
  updated_at?: string
}

export type MLContentData = {
  generated_at: string
  ideas: MLContentIdea[]
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

export type TickTickWeekData = {
  configured: boolean
  tasks: TickTickTask[]
  error?: string
}
