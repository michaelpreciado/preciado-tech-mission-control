/**
 * F.R.I.D.A.Y. — Framework for Running Intelligent Deployed Agents
 *
 * Central typed configuration. Every path, service URL, and identity value the
 * dashboard uses resolves here — nothing else in the codebase may hardcode a
 * machine-specific path or host.
 *
 * Resolution order (highest wins):
 *   1. Environment variables
 *   2. data/config.json   (local-only, gitignored — written by the /setup page)
 *   3. Generic defaults   (degrade to empty/disabled, never crash)
 *
 * Server-only: uses fs/os. Client components receive the pieces they need
 * (e.g. appName) via props/context from server components.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface FridayPaths {
  /** Agent session stores (one dir per agent, e.g. OpenClaw layout). */
  agentsDir: string
  /** Primary agent workspace (MEMORY.md, ideas.json, memory/ ...). */
  workspaceDir: string
  /** Per-project agent workspace scanned for tasks/missions ('' = disabled). */
  projectWorkspaceDir: string
  /** A local code repository to surface in Projects ('' = disabled). */
  repoDir: string
  /** Notes vault root, e.g. an Obsidian vault ('' = disabled). */
  vaultDir: string
  /** Project sub-vault scanned for memory/projects ('' = disabled). */
  projectVaultDir: string
  /** Model-usage JSONL log directory ('' = disabled). */
  usageLogsDir: string
  /** Inbox folder surfaced on the Ops page ('' = disabled). */
  inboxDir: string
  /** Cron scheduler jobs.json (Hermes-compatible schema). */
  cronJobsFile: string
  /** Multi-agent kanban SQLite DB (Hermes-compatible schema). */
  kanbanDbFile: string
  /** Agent session store (Hermes profile state.db) driving the live office view ('' = disabled). */
  agentStateDbFile: string
  /** OpenClaw gateway config file. */
  openclawConfigFile: string
  /** Agent gateway state file probed for system health. */
  gatewayStateFile: string
  /** Env file whose OPENROUTER_API_KEY is used as a key fallback ('' = env only). */
  providerEnvFile: string
  /** Web-dev pipeline store dir (pipeline.json + events.jsonl). */
  pipelineDir: string
  /** ML content ideas dir (week-N.json files). */
  mlContentIdeasDir: string
  /** Env file holding EVENTBUS_TOKEN for the SSE event bus ('' = env only). */
  eventbusEnvFile: string
  /** Google Calendar service-account credentials JSON ('' = disabled). */
  googleCalendarCredsFile: string
}

export interface FridayServices {
  /** SSE event bus endpoint proxied at /api/events. */
  eventbusUrl: string
  /** OpenClaw gateway liveness probe URL. */
  openclawGatewayUrl: string
  /** Ollama liveness probe URL. */
  ollamaUrl: string
  /** Local OpenAI-compatible server (LM Studio / LLMster) probe URL. */
  llmsterUrl: string
  /** Cloud-relay upstream (home MC instance) for the /api/upstream/* passthrough ('' = relay disabled). */
  apiRelayBase: string
}

export interface FridayAppearance {
  /** Accent hex color (#rrggbb) driving the whole neon token set. */
  accentColor: string
  /**
   * Explicit in-app motion override, distinct from the OS-level
   * `prefers-reduced-motion` media query (which the 3D/ambient components
   * still honor independently). 'full' = no override, defer to OS/battery
   * heuristics. 'reduced' and 'off' both force every gated component to its
   * static-frame codepath — there's no partial-motion mode to distinguish
   * them today, so they're kept as separate menu choices for forward
   * compatibility but currently behave identically.
   */
  motion: 'full' | 'reduced' | 'off'
  /** Card padding/gap density, wired to lib/tokens.ts DENSITY tokens. */
  density: 'compact' | 'expanded'
  /** Sidebar/mobile-nav tab ids hidden from navigation ('/' and '/setup' can never be hidden). */
  hiddenTabs: string[]
  /** Explicit nav tab order (ids); tabs not listed keep their default relative order, appended at the end. */
  tabOrder: string[]
  /** Per-tab on/off switches for the heavier 3D/ambient elements (lower-power machines). */
  elements3d: { homeGlobe: boolean; memoryGraph: boolean; teamGraph: boolean }
}

export interface FridayChatRemote {
  /** Display name, shown as the device badge on each conversation (e.g. "friday-macbook"). */
  name: string
  /** Tailscale hostname or IP of the remote Hermes host. */
  host: string
  /** SSH user on the remote host. */
  user: string
  /** Remote state.db paths to read ('~/.hermes/state.db' + named profiles). */
  dbPaths?: string[]
  /** SSH identity file ('~/.ssh/id_ed25519' default). */
  keyFile?: string
  /** Per-fetch timeout in ms (default 8000). */
  timeoutMs?: number
  /** Remote results cached for this long (ms) to avoid hammering a sleeping MacBook (default 30000). */
  cacheMs?: number
}

export interface FridayChat {
  /** Agent CLI binary used by the chat ('' = chat disabled). Must support `-z <prompt>` one-shot mode and `--resume <id>` (Hermes-compatible). */
  command: string
  /** Remote Hermes profiles whose conversations should be mirrored (default: []). */
  remotes: FridayChatRemote[]
  /** Optional explicit list of named local profiles to include ('' = auto-discover ~/.hermes/profiles/*). */
  profiles?: string[]
}

export interface FridayKeys {
  /** OpenRouter API key for live billing data ('' = disabled). Never logged, never returned by APIs. */
  openrouterApiKey: string
  /** TickTick Open API bearer token for the weekly ASCII calendar ('' = disabled). Never logged, never returned by APIs. */
  ticktickToken: string
}

export interface FridayBilling {
  /** Claude plan by month 'YYYY-MM' → { plan, amount }. Editable in data/config.json — no code changes to reprice a month. */
  subscriptions: Record<string, { plan: string; amount: number }>
  /** Plan used for any month not listed (current lean setup). */
  defaultPlan: { plan: string; amount: number }
}

export interface FridayKanbanRemote {
  /** Display name, shown as the machine badge on each card (e.g. "friday-macbook"). */
  name: string
  /** Tailscale hostname or IP of the remote Hermes host. */
  host: string
  /** SSH user on the remote host. */
  user: string
  /** Remote kanban.db path ('~/.hermes/kanban.db' default). */
  dbPath?: string
  /** SSH identity file ('~/.ssh/id_ed25519' default). */
  keyFile?: string
  /** Per-fetch timeout in ms (default 8000). */
  timeoutMs?: number
  /** Remote results cached for this long (ms) to avoid hammering a sleeping MacBook (default 30000). */
  cacheMs?: number
}

export interface FridayConfig {
  /** Brand shown in the UI. Override with NEXT_PUBLIC_APP_NAME or config.json. */
  appName: string
  /** One-line subtitle shown under the brand. */
  appTagline: string
  /** Base dir that default paths hang off. MC_HOME > config.json > os.homedir(). */
  homeDir: string
  github: {
    /** GitHub username for the contributions/repos panel ('' = disabled). */
    username: string
    /** "owner/name" repo pinned to the top of Projects ('' = disabled). */
    projectRepo: string
  }
  paths: FridayPaths
  services: FridayServices
  keys: FridayKeys
  billing: FridayBilling
  appearance: FridayAppearance
  chat: FridayChat
  /** Remote Hermes kanban DBs to mirror alongside the local board. */
  kanbanRemotes: FridayKanbanRemote[]
}

/** Shape of data/config.json — everything optional; unknown keys ignored. */
export type ConfigFile = Partial<
  Omit<FridayConfig, 'paths' | 'services' | 'github' | 'keys' | 'billing'> & {
    github: Partial<FridayConfig['github']>
    paths: Partial<FridayPaths>
    services: Partial<FridayServices>
    keys: Partial<FridayKeys>
    billing: Partial<FridayBilling>
    appearance: Partial<Omit<FridayAppearance, 'elements3d'> & { elements3d: Partial<FridayAppearance['elements3d']> }>
    chat: Partial<FridayChat>
    kanbanRemotes: FridayKanbanRemote[]
  }
>

export const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json')

function readConfigFile(): ConfigFile {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as ConfigFile
  } catch {
    return {}
  }
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() !== '' ? v : fallback
}

function buildConfig(): FridayConfig {
  const file = readConfigFile()
  const env = process.env

  // Deliberately NOT process.env.HOME: supervising agents may restart this
  // server with their own HOME set, which would silently repoint every
  // collector. os.homedir() with an explicit MC_HOME/config override is stable.
  const home = str(env.MC_HOME, str(file.homeDir, os.homedir()))

  const p = file.paths ?? {}
  const s = file.services ?? {}
  const g = file.github ?? {}

  return {
    appName: str(env.NEXT_PUBLIC_APP_NAME, str(file.appName, 'F.R.I.D.A.Y.')),
    appTagline: str(file.appTagline, 'Framework for Running Intelligent Deployed Agents'),
    homeDir: home,
    github: {
      username: str(env.FRIDAY_GITHUB_USER, str(g.username, '')),
      projectRepo: str(env.FRIDAY_GITHUB_REPO, str(g.projectRepo, '')),
    },
    paths: {
      agentsDir: str(env.FRIDAY_AGENTS_DIR, str(p.agentsDir, path.join(home, '.openclaw/agents'))),
      workspaceDir: str(env.FRIDAY_WORKSPACE_DIR, str(p.workspaceDir, path.join(home, '.openclaw/workspace'))),
      projectWorkspaceDir: str(env.FRIDAY_PROJECT_WORKSPACE_DIR, str(p.projectWorkspaceDir, '')),
      repoDir: str(env.FRIDAY_REPO_DIR, str(p.repoDir, '')),
      vaultDir: str(env.FRIDAY_VAULT_DIR, str(p.vaultDir, '')),
      projectVaultDir: str(env.FRIDAY_PROJECT_VAULT_DIR, str(p.projectVaultDir, '')),
      usageLogsDir: str(env.FRIDAY_USAGE_LOGS_DIR, str(p.usageLogsDir, '')),
      inboxDir: str(env.FRIDAY_INBOX_DIR, str(p.inboxDir, '')),
      cronJobsFile: str(env.FRIDAY_CRON_JOBS_FILE, str(p.cronJobsFile, path.join(home, '.hermes/cron/jobs.json'))),
      kanbanDbFile: str(env.MC_HERMES_KANBAN_DB, str(p.kanbanDbFile, path.join(home, '.hermes/kanban.db'))),
      agentStateDbFile: str(env.FRIDAY_AGENT_STATE_DB, str(p.agentStateDbFile, path.join(home, '.hermes/profiles/jarvis/state.db'))),
      openclawConfigFile: str(env.FRIDAY_OPENCLAW_CONFIG, str(p.openclawConfigFile, path.join(home, '.openclaw/openclaw.json'))),
      gatewayStateFile: str(env.FRIDAY_GATEWAY_STATE_FILE, str(p.gatewayStateFile, path.join(home, '.hermes/gateway_state.json'))),
      providerEnvFile: str(env.FRIDAY_PROVIDER_ENV_FILE, str(p.providerEnvFile, path.join(home, '.hermes/.env'))),
      pipelineDir: str(env.MC_PIPELINE_DIR, str(p.pipelineDir, path.join(process.cwd(), 'data/pipeline'))),
      mlContentIdeasDir: str(env.FRIDAY_ML_CONTENT_DIR, str(p.mlContentIdeasDir, path.join(process.cwd(), 'data/ml-content'))),
      eventbusEnvFile: str(env.FRIDAY_EVENTBUS_ENV_FILE, str(p.eventbusEnvFile, '')),
      googleCalendarCredsFile: str(env.FRIDAY_GCAL_CREDS_FILE, str(p.googleCalendarCredsFile, path.join(home, '.openclaw/google/calendar-service-account.json'))),
    },
    services: {
      eventbusUrl: str(env.MC_EVENTBUS_URL, str(s.eventbusUrl, 'http://127.0.0.1:9130/events')),
      openclawGatewayUrl: str(env.FRIDAY_OPENCLAW_URL, str(s.openclawGatewayUrl, 'http://127.0.0.1:18789/')),
      ollamaUrl: str(env.FRIDAY_OLLAMA_URL, str(s.ollamaUrl, 'http://127.0.0.1:11434/api/version')),
      llmsterUrl: str(env.FRIDAY_LLMSTER_URL, str(s.llmsterUrl, 'http://127.0.0.1:1234/v1/models')),
      apiRelayBase: str(env.API_RELAY_BASE, str(s.apiRelayBase, '')),
    },
    keys: {
      openrouterApiKey: str(env.OPENROUTER_API_KEY, str(file.keys?.openrouterApiKey, '')),
      ticktickToken: str(env.TICKTICK_API_TOKEN, str(file.keys?.ticktickToken, '')),
    },
    billing: {
      subscriptions: file.billing?.subscriptions && typeof file.billing.subscriptions === 'object'
        ? (file.billing.subscriptions as Record<string, { plan: string; amount: number }>)
        : {
            '2026-07': { plan: 'Claude Max', amount: 125 },
            '2026-08': { plan: 'Claude Pro', amount: 20 },
          },
      defaultPlan: file.billing?.defaultPlan ?? { plan: 'Claude Pro', amount: 20 },
    },
    appearance: {
      accentColor: str(env.NEXT_PUBLIC_ACCENT_COLOR, str(file.appearance?.accentColor, '#ff10f0')),
      motion: file.appearance?.motion === 'reduced' || file.appearance?.motion === 'off' ? file.appearance.motion : 'full',
      density: file.appearance?.density === 'expanded' ? 'expanded' : 'compact',
      hiddenTabs: Array.isArray(file.appearance?.hiddenTabs) ? file.appearance!.hiddenTabs!.filter((t): t is string => typeof t === 'string') : [],
      tabOrder: Array.isArray(file.appearance?.tabOrder) ? file.appearance!.tabOrder!.filter((t): t is string => typeof t === 'string') : [],
      elements3d: {
        homeGlobe: file.appearance?.elements3d?.homeGlobe !== false,
        memoryGraph: file.appearance?.elements3d?.memoryGraph !== false,
        teamGraph: file.appearance?.elements3d?.teamGraph !== false,
      },
    },
    chat: {
      command: str(env.FRIDAY_CHAT_COMMAND, str(file.chat?.command, 'hermes')),
      remotes: Array.isArray(file.chat?.remotes)
        ? file.chat!.remotes!
          .filter(r => r && typeof r.name === 'string' && r.name && typeof r.host === 'string' && r.host && typeof r.user === 'string' && r.user)
          .map(r => ({
            name: r.name,
            host: r.host,
            user: r.user,
            dbPaths: Array.isArray(r.dbPaths) && r.dbPaths.length ? r.dbPaths : ['~/.hermes/state.db'],
            keyFile: str(r.keyFile, '~/.ssh/id_ed25519'),
            timeoutMs: typeof r.timeoutMs === 'number' && r.timeoutMs > 0 ? r.timeoutMs : 8000,
            cacheMs: typeof r.cacheMs === 'number' && r.cacheMs > 0 ? r.cacheMs : 30000,
          }))
        : [],
      profiles: Array.isArray(file.chat?.profiles) ? file.chat!.profiles!.filter(p => typeof p === 'string' && p) : [],
    },
    kanbanRemotes: Array.isArray(file.kanbanRemotes)
      ? file.kanbanRemotes
          .filter(r => r && typeof r.name === 'string' && r.name && typeof r.host === 'string' && r.host && typeof r.user === 'string' && r.user)
          .map(r => ({
            name: r.name,
            host: r.host,
            user: r.user,
            dbPath: str(r.dbPath, '~/.hermes/kanban.db'),
            keyFile: str(r.keyFile, '~/.ssh/id_ed25519'),
            timeoutMs: typeof r.timeoutMs === 'number' && r.timeoutMs > 0 ? r.timeoutMs : 8000,
            cacheMs: typeof r.cacheMs === 'number' && r.cacheMs > 0 ? r.cacheMs : 30000,
          }))
      : [],
  }
}

let cached: FridayConfig | null = null
let cachedMtimeMs = -1

function configFileMtime(): number {
  try { return fs.statSync(CONFIG_FILE).mtimeMs } catch { return 0 }
}

/**
 * Resolved config. Cached, but re-read when data/config.json changes on disk
 * so /setup saves and demo seeding apply without a server restart. (Values
 * captured at module load — e.g. layout metadata — still need a restart.)
 */
export function getConfig(): FridayConfig {
  const mtime = configFileMtime()
  if (!cached || mtime !== cachedMtimeMs) {
    cached = buildConfig()
    cachedMtimeMs = mtime
  }
  return cached
}

/** Test/setup hook: drop the cache so the next getConfig() re-reads disk/env. */
export function resetConfigCache(): void {
  cached = null
  cachedMtimeMs = -1
}

/** True if a local data/config.json exists (i.e. setup has been run). */
export function isConfigured(): boolean {
  return configFileMtime() > 0
}

/** Join under a configurable root; '' root means "not configured" → ''. */
export function joinIf(root: string, ...parts: string[]): string {
  return root ? path.join(root, ...parts) : ''
}
