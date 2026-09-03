/**
 * Bot profile management actions — create / delete Hermes profiles via the
 * `hermes profile` CLI, the same commands the Hermes desktop app drives.
 *
 * Safety gates (enforced server-side, never trust the client):
 *  - name must be lowercase alphanumeric (+ hyphens), 1–32 chars — the CLI's
 *    own charset, also the shell-injection boundary (we exec argv, no shell);
 *  - create  : clone source must be a known profile; name must not exist;
 *  - delete  : never `default`; profile must exist; gateway must NOT be in
 *    `running`/`degraded` (removing a profile with a live bot would kill it).
 *
 * Every action shells out synchronously (short timeout) and returns a
 * {ok, result|error} shape for the API route to turn into JSON.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { collectBots, hermesDir } from './collectors/bots'
import { logger } from './logger'

export type BotActionResult =
  | { ok: true; result: string }
  | { ok: false; error: string }

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/

/** Names of every profile the roster knows (including `default`). */
async function knownProfiles(): Promise<string[]> {
  const snap = await collectBots(true)
  return snap.bots.map(b => b.name)
}

function runCli(argv: string[]): BotActionResult {
  try {
    const out = execFileSync('hermes', argv, { timeout: 20_000, stdio: 'pipe' })
      .toString().trim()
    return { ok: true, result: out || '(done)' }
  } catch (err) {
    const e = err as { stderr?: Buffer; stdout?: Buffer; message: string }
    const detail = (e.stderr ? e.stderr.toString() : '') || (e.stdout ? e.stdout.toString() : '') || e.message
    logger.warn('bot-action', detail)
    return { ok: false, error: detail.trim().slice(0, 500) }
  }
}

/** Create a new bot profile cloned from an existing profile. */
export async function createBot(name: string, cloneFrom: string): Promise<BotActionResult> {
  const trimmed = name.trim().toLowerCase()
  if (!NAME_RE.test(trimmed)) {
    return { ok: false, error: 'profile name must be lowercase letters, digits, or hyphens (1–32 chars)' }
  }
  const known = await knownProfiles()
  if (known.includes(trimmed)) return { ok: false, error: `profile '${trimmed}' already exists` }
  const source = cloneFrom.trim().toLowerCase() || 'default'
  if (!known.includes(source)) return { ok: false, error: `clone source '${source}' is not a known profile` }
  return runCli(['profile', 'create', '--clone-from', source, trimmed])
}

/** Delete a bot profile — only when safe (not `default`, gateway not live). */
export async function deleteBot(name: string): Promise<BotActionResult> {
  const trimmed = name.trim().toLowerCase()
  if (!NAME_RE.test(trimmed)) {
    return { ok: false, error: 'profile name must be lowercase letters, digits, or hyphens (1–32 chars)' }
  }
  if (trimmed === 'default') return { ok: false, error: "the 'default' profile can't be deleted" }
  const known = await knownProfiles()
  if (!known.includes(trimmed)) {
    // A freshly cloned profile has no `state.db` yet, so the roster can't see
    // it — but it still exists on disk and must be removable. Fall back to the
    // profiles dir before refusing.
    const root = hermesDir()
    if (!fs.existsSync(path.join(root, 'profiles', trimmed))) {
      return { ok: false, error: `no profile named '${trimmed}'` }
    }
  }
  const snap = await collectBots()
  const bot = snap.bots.find(b => b.name === trimmed)
  if (bot && (bot.gateway.status === 'running' || bot.gateway.status === 'degraded')) {
    return { ok: false, error: `'${trimmed}' has a live gateway — stop it before deleting` }
  }
  return runCli(['profile', 'delete', '-y', trimmed])
}