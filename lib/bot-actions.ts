/**
 * Bot profile management actions — create / delete / lifecycle / model-edit of
 * Hermes profiles via the `hermes` CLI, the same commands the Hermes desktop
 * app drives.
 *
 * Safety gates (enforced server-side, never trust the client):
 *  - name must be lowercase alphanumeric (+ hyphens), 1–32 chars — the CLI's
 *    own charset, also the shell-injection boundary (we exec argv, no shell);
 *  - create      : clone source must be a known profile; name must not exist;
 *  - delete      : never `default`; profile must exist; gateway must NOT be in
 *    `running`/`degraded` (removing a profile with a live bot would kill it).
 *  - start/stop/restart : never `default`; profile must exist. Per-profile —
 *    `hermes -p <name> gateway <op>` targets that one profile's gateway
 *    service (verified on-box: `-p sage gateway status` reports only sage).
 *  - edit-model  : never `default`; profile must exist; `model` (and optional
 *    `provider`) must match a conservative id charset. Writes the profile's
 *    own config.yaml via `hermes -p <name> config set model.default <id>`.
 *  - toggle-routine : job id must match a hex-ish charset; flips a
 *    `[bot:<name>]`-namespaced cron job via `hermes cron pause|resume <id>`.
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
/** Model ids seen in the wild: `deepseek/deepseek-v4-flash-0731`,
 *  `deepseek-v4-flash-free`, `hf.co/unsloth/Qwen3.8-27B-GGUF:UD-IQ4_XS`.
 *  Allow letters, digits, and `. _ : / -` only — no whitespace or shell
 *  metacharacters (we exec argv, but keep the value boring anyway). */
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,119}$/
const PROVIDER_RE = /^[a-z0-9][a-z0-9._-]{1,39}$/
/** Hermes cron job ids are short hex (`75268a63899b`); the MC cron collector
 *  falls back to `cron-<n>` — allow both, reject anything else. */
const ROUTINE_ID_RE = /^[A-Za-z0-9-]{3,64}$/

const NAME_HINT = 'profile name must be lowercase letters, digits, or hyphens (1–32 chars)'

type Lifecycle = 'start' | 'stop' | 'restart'

/**
 * Shared gate for actions that operate on an existing named profile: charset,
 * `default` protection, and existence (roster first, then the profiles dir so a
 * freshly-cloned profile with no `state.db` yet still resolves). Returns the
 * normalised name or an error string.
 */
async function requireNamedProfile(name: string, what: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const trimmed = name.trim().toLowerCase()
  if (!NAME_RE.test(trimmed)) return { ok: false, error: NAME_HINT }
  if (trimmed === 'default') return { ok: false, error: `the 'default' profile's ${what} can't be managed from here` }
  const known = await knownProfiles()
  if (!known.includes(trimmed) && !fs.existsSync(path.join(hermesDir(), 'profiles', trimmed))) {
    return { ok: false, error: `no profile named '${trimmed}'` }
  }
  return { ok: true, name: trimmed }
}

/** Names of every profile the roster knows (including `default`). */
async function knownProfiles(): Promise<string[]> {
  const snap = await collectBots(true)
  return snap.bots.map(b => b.name)
}

function runCli(argv: string[], timeoutMs = 20_000): BotActionResult {
  try {
    const out = execFileSync('hermes', argv, { timeout: timeoutMs, stdio: 'pipe' })
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

/**
 * Start / stop / restart one bot's messaging gateway. `hermes -p <name> gateway
 * <op>` targets that profile's own systemd service (`hermes-gateway-<name>`);
 * `restart` also auto-refreshes an outdated unit file. Allow a longer timeout —
 * a restart drains in-flight work before coming back.
 */
export async function gatewayAction(name: string, op: Lifecycle): Promise<BotActionResult> {
  if (op !== 'start' && op !== 'stop' && op !== 'restart') {
    return { ok: false, error: `unknown gateway op '${op}'` }
  }
  const gate = await requireNamedProfile(name, 'gateway')
  if (!gate.ok) return gate
  return runCli(['-p', gate.name, 'gateway', op], 120_000)
}

/**
 * Swap a bot's default model (and, optionally, its provider) by writing the
 * profile's own config.yaml — `hermes -p <name> config set model.default <id>`.
 * Provider is only touched when supplied; a cross-provider swap that omits it
 * may leave `model.provider` pointing at the old backend (surfaced in the
 * report, not silently "fixed").
 */
export async function editBotModel(name: string, model: string, provider?: string): Promise<BotActionResult> {
  const gate = await requireNamedProfile(name, 'model')
  if (!gate.ok) return gate
  const m = String(model ?? '').trim()
  if (!MODEL_RE.test(m)) return { ok: false, error: 'model id has an unexpected character (letters, digits, and . _ : / - only)' }
  const prov = String(provider ?? '').trim().toLowerCase()
  if (prov && !PROVIDER_RE.test(prov)) return { ok: false, error: 'provider id has an unexpected character' }

  const setModel = runCli(['-p', gate.name, 'config', 'set', 'model.default', m])
  if (!setModel.ok) return setModel
  if (prov) {
    const setProv = runCli(['-p', gate.name, 'config', 'set', 'model.provider', prov])
    if (!setProv.ok) return { ok: false, error: `model.default set to ${m}, but provider update failed: ${setProv.error}` }
  }
  return { ok: true, result: `${gate.name}: model.default = ${m}${prov ? ` · provider = ${prov}` : ''}` }
}

/**
 * Pause / resume a bot routine (a `[bot:<name>]`-namespaced cron job). The
 * routine id comes straight from the roster, which sources it from the Hermes
 * cron scheduler; `hermes cron pause|resume <id>` is that scheduler's own
 * enable/disable verb.
 */
export async function toggleRoutine(id: string, enabled: boolean): Promise<BotActionResult> {
  const jid = String(id ?? '').trim()
  if (!ROUTINE_ID_RE.test(jid)) return { ok: false, error: 'invalid routine id' }
  return runCli(['cron', enabled ? 'resume' : 'pause', jid])
}