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
}

export interface FridayAppearance {
  /** Accent hex color (#rrggbb) driving the whole neon token set. */
  accentColor: string
}

export interface FridayChat {
  /** Agent CLI binary used by the /chat tab ('' = chat disabled). Must support `-z <prompt>` one-shot mode (Hermes-compatible). */
  command: string
}

export interface FridayKeys {
  /** OpenRouter API key for live billing data ('' = disabled). Never logged, never returned by APIs. */
  openrouterApiKey: string
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
  appearance: FridayAppearance
  chat: FridayChat
}

/** Shape of data/config.json — everything optional; unknown keys ignored. */
export type ConfigFile = Partial<
  Omit<FridayConfig, 'paths' | 'services' | 'github' | 'keys'> & {
    github: Partial<FridayConfig['github']>
    paths: Partial<FridayPaths>
    services: Partial<FridayServices>
    keys: Partial<FridayKeys>
    appearance: Partial<FridayAppearance>
    chat: Partial<FridayChat>
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
    },
    keys: {
      openrouterApiKey: str(env.OPENROUTER_API_KEY, str(file.keys?.openrouterApiKey, '')),
    },
    appearance: {
      accentColor: str(env.NEXT_PUBLIC_ACCENT_COLOR, str(file.appearance?.accentColor, '#ff10f0')),
    },
    chat: {
      command: str(env.FRIDAY_CHAT_COMMAND, str(file.chat?.command, 'hermes')),
    },
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
