/**
 * Write actions against real Hermes conversations, routed through the `hermes`
 * CLI so the session store stays the single source of truth.
 *
 *  - Continue an existing conversation: `hermes --profile <p> --resume <id> -z <msg> --cli`
 *    (local) or run the same over SSH on the remote host that owns the session.
 *  - Initiate a brand-new session: `hermes --profile <p> -z <msg> --cli`
 *
 * Every action shells out synchronously (bounded timeout) and returns a
 * {ok, result|error, sessionId?} shape for the API route to turn into JSON.
 */
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { getConfig } from './config'
import { logger } from './logger'
import type { FridayChatRemote } from './config'

export type ActionOutcome =
  | { ok: true; result: string; sessionId?: string }
  | { ok: false; error: string }

function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p
}

/** Find the remote config whose host owns `device`; null = this machine. */
function remoteFor(device: string): FridayChatRemote | null {
  if (!device) return null
  const local = os.hostname() || 'local'
  if (device === local) return null
  return getConfig().chat.remotes?.find(r => r.name === device) ?? null
}

/** Build argv for the hermes CLI invocation, local or via ssh. */
function build(
  args: string[],
  opts: { device?: string; profile?: string; timeoutMs?: number },
): { argv: string[]; opts: object; remote: boolean } {
  const remote = remoteFor(opts.device ?? '')
  const profileArgs = opts.profile && opts.profile !== 'default' ? ['--profile', opts.profile] : []
  const timeoutMs = opts.timeoutMs ?? 240_000

  if (!remote) {
    return {
      argv: ['hermes', ...profileArgs, ...args],
      opts: { timeout: timeoutMs, stdio: 'pipe', maxBuffer: 16 * 1024 * 1024, cwd: process.cwd() },
      remote: false,
    }
  }

  const keyFile = expandHome(remote.keyFile ?? '~/.ssh/id_ed25519')
  const remoteCmd = ['hermes', ...profileArgs, ...args].map(a => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ')
  return {
    argv: ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=6', '-i', keyFile,
      `${remote.user}@${remote.host}`, remoteCmd],
    opts: { timeout: timeoutMs, stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 },
    remote: true,
  }
}

function run(
  args: string[],
  opts: { device?: string; profile?: string; timeoutMs?: number },
): ActionOutcome {
  const { argv, opts: execOpts } = build(args, opts)
  try {
    const out = execFileSync(argv[0], argv.slice(1), execOpts as object).toString().trim()
    return { ok: true, result: out || '(done)' }
  } catch (err) {
    const e = err as { stderr?: Buffer; stdout?: Buffer; message: string; timedOut?: boolean; killed?: boolean }
    // On timeout the agent may already have written the reply to stdout before
    // dying — surface that text over a generic error when present.
    const stdout = e.stdout ? e.stdout.toString().trim() : ''
    const detail = (e.stderr ? e.stderr.toString() : '') || stdout || e.message
    logger.warn('conversation-action', (e.killed ? '[timeout] ' : '') + detail.slice(0, 300))
    if (e.killed || e.timedOut) {
      return stdout
        ? { ok: true, result: stdout }
        : { ok: false, error: `agent run exceeded the time limit and was stopped` }
    }
    return { ok: false, error: detail.trim().slice(0, 500) || 'agent run failed' }
  }
}

/** Continue an existing conversation by its real Hermes session id. */
export function continueConversation(
  sessionId: string,
  message: string,
  opts: { profile?: string; device?: string },
): ActionOutcome {
  return run(['--resume', sessionId, '-z', message, '--cli'], opts)
}

/** Initiate a brand-new conversation on a given profile/device. */
export function initiateConversation(
  message: string,
  opts: { profile: string; device?: string },
): ActionOutcome {
  return run(['-z', message, '--cli'], opts)
}

/** Whether the `hermes` CLI is usable on this box (or a remote host). */
export function checkAvailable(device?: string): boolean {
  try {
    const { argv, opts } = build(['--version'], { device, timeoutMs: 15_000 })
    execFileSync(argv[0], argv.slice(1), opts as object)
    return true
  } catch {
    return false
  }
}
