/** Server-only: CLI invocations use execFile argv arrays, never shell commands. */
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { getConfig, resolveChatAgents, type AgentId } from './config'
import { hermesDir } from './collectors/bots'
import { piSessionDir, readPiSessions } from './pi-sessions'

const execFileAsync = promisify(execFile)
export function selectAgent(value: unknown): AgentId | null {
  return value === undefined ? 'hermes' : value === 'hermes' || value === 'pi' || value === 'codex' ? value : null
}
export function configuredAgents() {
  const chat = getConfig().chat
  return resolveChatAgents(chat.agents, chat.command)
}
export type SendInput = { message: string; session: string; profile?: string; createSession?: boolean; resumeById?: boolean; model?: string; provider?: string }
const textReply = (stdout: string, stderr: string) => stdout.trim() || stderr.trim() || '(no output)'
const HERMES_NOTICE_RE = /^(?:Warning:|\[HERMES_HOME fallback\]|Session .* starting fresh\.?)/i
function hermesReply(stdout: string, stderr: string): string {
  const stripNotices = (text: string) => text.replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, '').split(/\r?\n/).reduce((lines, line) => {
    if (lines.length === 0 && (!line.trim() || HERMES_NOTICE_RE.test(line.trim()))) return lines
    return [...lines, line]
  }, [] as string[]).join('\n').trim()
  return stripNotices(stdout) || stripNotices(stderr) || '(no output)'
}
export const adapters = {
  hermes: {
    continuity: true,
    args: ({ message, session, profile, createSession, resumeById, model, provider }: SendInput) => [
      ...(profile && profile !== 'default' ? ['--profile', profile] : []),
      // Per-invocation model override. Verified against the installed CLI: `-m`
      // and `--provider` are accepted by BOTH the top-level command and the
      // `chat` subcommand, so a picked model applies to this turn only and
      // config.yaml is never rewritten.
      ...(model ? ['-m', model] : []),
      ...(provider ? ['--provider', provider] : []),
      ...(createSession
        // Hermes' documented programmatic lane is `chat -Q --query-file`.
        // The message is supplied on stdin by sendAgent below; keeping it out
        // of argv also avoids the CLI's legacy -q/--oneshot/--cli combination.
        ? ['chat', '--continue', session, '--create-if-missing', '-Q', '--query-file', '-']
        : [resumeById ? '--resume' : '--continue', session, '-z', message, '--cli']),
    ],
    parseReply: hermesReply,
    listSessions: async () => (await import('./conversations')).listConversations().filter(c => c.agent !== 'pi'),
  },
  pi: {
    continuity: true,
    args: ({ message, session }: SendInput) => ['--session-dir', piSessionDir(), '--session-id', session, '-p', '--', message],
    parseReply: (stdout: string, _stderr: string) => {
      const reply = stdout.trim()
      if (!reply) throw new Error('Pi returned no reply')
      return reply
    },
    listSessions: async () => readPiSessions().map(s => s.conversation),
  },
  codex: {
    continuity: false,
    args: ({ message }: SendInput) => ['exec', '--', message],
    parseReply: textReply,
    listSessions: async () => [],
  },
}

// Shared across Next route bundles and development module reloads in this process.
const flightState = globalThis as typeof globalThis & { __mcAgentFlights?: Set<AgentId> }
const busy = flightState.__mcAgentFlights ??= new Set<AgentId>()
export function isAgentBusy(agent: AgentId): boolean { return busy.has(agent) }
export async function withAgentFlight<T>(agent: AgentId, run: () => Promise<T>): Promise<{ status: 409; error: string } | { status: 200; value: T }> {
  if (busy.has(agent)) return { status: 409, error: 'agent is already handling a message — wait for it to finish' }
  busy.add(agent)
  try { return { status: 200, value: await run() } } finally { busy.delete(agent) }
}

export async function sendAgent(agent: AgentId, command: string, input: SendInput, timeout: number) {
  const adapter = adapters[agent]
  const args = adapter.args(input)
  const root = hermesDir()
  const hermesHome = input.profile && input.profile !== 'default' ? path.join(root, 'profiles', input.profile) : root
  const run = execFileAsync(command, args, {
    timeout, maxBuffer: 8 * 1024 * 1024, cwd: process.cwd(),
    // Hermes otherwise falls back to the default profile when HERMES_HOME is
    // unset, so every child must inherit the active profile's Hermes root.
    env: { ...process.env, HERMES_HOME: hermesHome },
  })
  // Hermes' --query-file - path reads the complete prompt from stdin. Pi also
  // consumes redirected stdin before its prompt; EOF is required for both.
  if (agent === 'hermes' && args.includes('--query-file')) run.child.stdin?.end(input.message)
  else run.child.stdin?.end()
  const { stdout, stderr } = await run
  return adapter.parseReply(stdout, stderr)
}
