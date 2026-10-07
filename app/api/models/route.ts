/**
 * Selectable AI models for the dashboard chat.
 *
 * The installed CLI takes a PER-INVOCATION override (`-m/--model` plus
 * `--provider`, on both the top-level command and `chat`), so this endpoint only
 * has to describe what is actually usable on this machine — the chat route
 * passes the pick straight through to argv and never rewrites config.yaml.
 *
 * Three real sources, each optional:
 *   - `config.yaml` `model:` block      → the configured default (CURRENT group)
 *   - `ollama list`                     → models installed on this box
 *   - the CLI's own provider cache      → each provider's live /v1/models list
 * A source that is missing contributes nothing instead of failing the request.
 *
 * Security: same posture as the chat route — trusted IPs, or a bearer token
 * when INTERNAL_API_SECRET is set. No credential ever reaches the response.
 */
import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { hermesDir } from '@/lib/collectors/bots'
import { getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv } from '@/lib/mission-api'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

/** The OpenRouter catalogue alone is hundreds of ids; the picker is a
 *  phone-sized select, not a catalogue browser. */
const PER_PROVIDER_CAP = 60
const CACHE_MS = 60_000

export type ModelOption = { id: string; provider?: string; note?: string }
export type ModelGroup = { label: string; models: ModelOption[] }
export type ModelCatalog = {
  generatedAt: string
  current: { model: string | null; provider: string | null }
  groups: ModelGroup[]
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  const ip = getClientIpFromHeaders(req.headers)
  return isTrustedIp(ip, trustedRangesFromEnv())
}

/** `ollama list` prints a NAME/ID/SIZE/MODIFIED table, one model per row. */
export function parseOllamaList(stdout: string): ModelOption[] {
  return stdout
    .split('\n')
    .slice(1)
    .map(line => line.trim().split(/\s+/)[0])
    .filter(name => Boolean(name))
    .map(id => ({ id, provider: 'ollama' }))
}

/** The `model:` block of config.yaml — the default the picker starts on. */
export function parseConfigModel(yaml: string): { model: string | null; provider: string | null } {
  const block = yaml.split(/^model:[ \t]*$/m)[1]
  if (!block) return { model: null, provider: null }
  // Everything before the next top-level key belongs to this block.
  const body = block.split(/^\S/m)[0] ?? ''
  const read = (key: string) => {
    const match = body.match(new RegExp(`^[ \t]+${key}:[ \t]*(.+)$`, 'm'))
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null
  }
  return { model: read('default'), provider: read('provider') }
}

/** Provider → live model ids, in the shape the CLI's own picker cache stores. */
export function parseProviderCache(raw: string): Array<{ provider: string; models: string[] }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  const out: Array<{ provider: string; models: string[] }> = []
  for (const [provider, entry] of Object.entries(parsed as Record<string, unknown>)) {
    const models = entry && typeof entry === 'object' && Array.isArray((entry as { models?: unknown }).models)
      ? (entry as { models: unknown[] }).models.filter((model): model is string => typeof model === 'string')
      : []
    if (models.length) out.push({ provider, models })
  }
  return out
}

/** Group what the picker shows: the configured default first, then this box's
 *  installed models, then each provider catalogue. */
export function buildModelGroups(input: {
  current: { model: string | null; provider: string | null }
  local: ModelOption[]
  providers: Array<{ provider: string; models: string[] }>
}): ModelGroup[] {
  const groups: ModelGroup[] = []
  // A configured Ollama default is runnable only when Ollama reports the exact
  // tag as installed. Remote/provider defaults are kept because their cache is
  // the provider's own model inventory; an absent local daemon must not turn a
  // stale local config into a selectable model.
  const currentModel = input.current.model
  const currentIsRunnable = Boolean(currentModel && (
    input.current.provider !== 'ollama' || input.local.some(model => model.id === currentModel && model.provider === 'ollama')
  ))
  if (currentModel && currentIsRunnable) {
    groups.push({
      label: 'CURRENT',
      models: [{ id: currentModel, provider: input.current.provider ?? undefined, note: 'configured default' }],
    })
  }
  if (input.local.length) groups.push({ label: 'LOCAL · OLLAMA', models: input.local })
  for (const entry of input.providers) {
    groups.push({
      label: entry.provider.toUpperCase(),
      models: entry.models.slice(0, PER_PROVIDER_CAP).map(id => ({ id, provider: entry.provider })),
    })
  }
  // A model can be both the configured default and a catalogue entry; keep the
  // first occurrence so the select never shows the same pick twice.
  const seen = new Set<string>()
  return groups
    .map(group => ({
      ...group,
      models: group.models.filter(model => {
        const key = `${model.provider ?? ''}::${model.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }),
    }))
    .filter(group => group.models.length > 0)
}

function readTextFile(file: string): string | null {
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
  } catch {
    return null
  }
}

let cached: { at: number; value: ModelCatalog } | null = null

/** Local models, from the CLI that actually runs them. Bounded and cached: a
 *  missing or hung ollama must not hold up the picker. */
async function readLocalModels(): Promise<ModelOption[]> {
  try {
    const { stdout } = await execFileAsync('ollama', ['list'], { timeout: 5_000, maxBuffer: 1 << 20 })
    return parseOllamaList(stdout)
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (cached && Date.now() - cached.at < CACHE_MS) return NextResponse.json(cached.value, { headers })

  const root = hermesDir()
  const current = parseConfigModel(readTextFile(path.join(root, 'config.yaml')) ?? '')
  const local = await readLocalModels()
  const providers = parseProviderCache(readTextFile(path.join(root, 'provider_models_cache.json')) ?? '')
  const value: ModelCatalog = {
    generatedAt: new Date().toISOString(),
    current,
    groups: buildModelGroups({ current, local, providers }),
  }
  cached = { at: Date.now(), value }
  return NextResponse.json(value, { headers })
}
