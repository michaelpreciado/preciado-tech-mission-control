import type { CrewId, MissionCron } from '../types'
import { ROOTS, CREW, readJson, ownerFor } from './shared'

// Schema of ~/.hermes/cron/jobs.json (Hermes gateway scheduler)
type HermesCronJob = {
  id?: string
  name?: string
  prompt?: string
  skill?: string
  enabled?: boolean
  state?: string
  schedule?: { kind?: string; expr?: string; display?: string }
  schedule_display?: string
  next_run_at?: string | null
  last_run_at?: string | null
  last_status?: string | null
  last_error?: string | null
  deliver?: string | null
}

/** Strip absolute filesystem paths and internal URLs from client-bound text.
 *  Anything under a unix home/system root collapses to a placeholder so runtime
 *  errors and job prompts never ship the operator's directory layout. Path
 *  segments may contain spaces, so eat trailing "word word/" continuations too. */
function sanitizeText(text: string): string {
  return text
    .replace(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|100\.\d+\.\d+\.\d+)(?::\d+)?\S*/g, '[internal url]')
    .replace(/\/(?:home|Users|root|var|etc|opt|tmp|srv)\/(?:[^\s'"`)\]]|[ ](?=[^\s'"`)\]/]*\/))*/g, '[configured path]')
}

/** Map raw scheduler errors to actionable copy — never upstream dumps or paths. */
function cronErrorCopy(raw: string): string {
  if (/429|rate.?limit/i.test(raw)) return 'Provider rate-limited — retries on the next scheduled run'
  if (/model\s+'[^']*'\s+not\s+found|model.*not.*(?:found|available)/i.test(raw)) return 'Model not available from the configured provider'
  if (/script not found|no such file|enoent/i.test(raw)) return 'Script missing in configured cron path'
  if (/404/.test(raw)) return 'Provider endpoint not found (HTTP 404)'
  if (/401|403|unauthorized|forbidden|invalid.*key/i.test(raw)) return 'Provider rejected credentials — check the configured API key'
  if (/timeout|timed?\s?out/i.test(raw)) return 'Run timed out'
  return sanitizeText(raw).slice(0, 160)
}

function cadence(job: HermesCronJob): MissionCron['cadence'] {
  if (job.schedule?.kind === 'at') return 'one-shot'
  const expr = job.schedule?.expr || ''
  if (/^\S+\s+\S+\s+\*\s+\*\s+\*$/.test(expr)) return 'daily'
  return 'recurring'
}

/** Hermes names its jobs "<Agent> — <Purpose>"; prefer that over keyword inference. */
function ownerFromName(name: string): CrewId | null {
  const lead = name.toLowerCase()
  for (const id of Object.keys(CREW) as CrewId[]) {
    if (lead.startsWith(id) || lead.startsWith(CREW[id].name.toLowerCase())) return id
  }
  return null
}

export async function collectCron(): Promise<MissionCron[]> {
  const raw = await readJson<{ jobs?: HermesCronJob[] }>(ROOTS.cronJobs)
  const jobs = raw?.jobs || []
  return jobs.map((job, i) => {
    const owner = ownerFromName(job.name || '') ?? ownerFor(`${job.name || ''} ${job.skill || ''} ${job.prompt || ''}`)
    return {
      id: job.id || `cron-${i}`,
      name: job.name || 'Unnamed scheduled job',
      enabled: job.enabled !== false,
      owner,
      ownerName: CREW[owner].name,
      cadence: cadence(job),
      schedule: job.schedule_display || job.schedule?.expr || 'unscheduled',
      nextRunAt: job.next_run_at || undefined,
      lastRunAt: job.last_run_at || undefined,
      lastRunStatus: job.last_status || undefined,
      description: job.last_status === 'error' && job.last_error ? cronErrorCopy(job.last_error) : undefined,
      payloadPreview: sanitizeText(String(job.prompt || '')).slice(0, 220),
      delivery: job.deliver || undefined,
    } satisfies MissionCron
  }).sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.cadence.localeCompare(b.cadence) || a.name.localeCompare(b.name))
}
