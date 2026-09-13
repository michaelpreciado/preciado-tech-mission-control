/** Server-only: CLI invocations use execFile argv arrays, never shell commands. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getConfig, resolveChatAgents, type AgentId } from './config'
import { readPiSessions } from './pi-sessions'

const execFileAsync = promisify(execFile)
export function selectAgent(value: unknown): AgentId | null {
  return value === undefined ? 'hermes' : value === 'hermes' || value === 'pi' || value === 'codex' ? value : null
}
export function configuredAgents() {
  const chat = getConfig().chat
  return resolveChatAgents(chat.agents, chat.command)
}
export type SendInput = { message: string; session: string; profile?: string; createSession?: boolean }
const textReply = (stdout: string, stderr: string) => stdout.trim() || stderr.trim() || '(no output)'
export const adapters = {
  hermes: {
    continuity: true,
    args: ({ message, session, profile, createSession }: SendInput) => [
      ...(profile && profile !== 'default' ? ['--profile', profile] : []),
      ...(createSession
        ? ['chat', '--continue', session, '--create-if-missing', '-q', message, '--oneshot', '--cli', '-Q']
        : ['--continue', session, '-z', message, '--cli']),
    ],
    parseReply: textReply,
    listSessions: async () => (await import('./conversations')).listConversations().filter(c => c.agent !== 'pi'),
  },
  pi: {
    continuity: true,
    args: ({ message, session }: SendInput) => ['--session-id', session, '-p', '--', message],
    parseReply: textReply,
    listSessions: async () => readPiSessions().map(s => s.conversation),
  },
  codex: {
    continuity: false,
    args: ({ message }: SendInput) => ['exec', '--', message],
    parseReply: textReply,
    listSessions: async () => [],
  },
}

const busy = new Set<AgentId>()
export function isAgentBusy(agent: AgentId): boolean { return busy.has(agent) }
export async function withAgentFlight<T>(agent: AgentId, run: () => Promise<T>): Promise<{ status: 409; error: string } | { status: 200; value: T }> {
  if (busy.has(agent)) return { status: 409, error: 'agent is already handling a message — wait for it to finish' }
  busy.add(agent)
  try { return { status: 200, value: await run() } } finally { busy.delete(agent) }
}

export async function sendAgent(agent: AgentId, command: string, input: SendInput, timeout: number) {
  const adapter = adapters[agent]
  const run = execFileAsync(command, adapter.args(input), {
    timeout, maxBuffer: 8 * 1024 * 1024, cwd: process.cwd(),
  })
  // Pi consumes redirected stdin before its prompt, even in print mode.
  // execFile opens a pipe by default; EOF is required for a one-shot turn.
  run.child.stdin?.end()
  const { stdout, stderr } = await run
  return adapter.parseReply(stdout, stderr)
}
