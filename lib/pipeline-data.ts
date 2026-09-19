/**
 * Web Dev Pipeline data layer.
 *
 * The pipeline itself is driven by an external `web-dev-pipeline` skill/agent.
 * This module only READS its store and never runs scraping/scaffold/enhance
 * logic — the board is a visual projection of what the skill does.
 *
 * Store layout (configurable via MC_PIPELINE_DIR or data/config.json):
 *   <pipelineDir>/pipeline.json  — lead records
 *   <pipelineDir>/events.jsonl   — CanonicalEvent envelopes with event_type
 *     "pipeline_update" (same schema as the rest of the dashboard, see
 *     lib/canonical-schema.ts).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { PipelineData, PipelineEvent, PipelineLead, PipelineSentBucket, PipelineSentSummary, PipelineStage } from './types'
import type { CanonicalEvent, PipelineUpdatePayload } from './canonical-schema'
import { logger } from './logger'

import { getConfig } from './config'
// Resolved per call so config edits (via /setup) apply without a restart.
export function pipelineDir(): string { return getConfig().paths.pipelineDir }
export function pipelineStore(): string { return path.join(pipelineDir(), 'pipeline.json') }
export function pipelineEvents(): string { return path.join(pipelineDir(), 'events.jsonl') }

export const PIPELINE_STAGES: PipelineStage[] = [
  'leads_found',
  'social_scraped',
  'concept_ready',
  'awaiting_approval',
  'in_development',
  'completed',
]

// Stage transition → downstream action in the skill. Recorded on history and
// canonical events so the board can show what each move triggered.
export const STAGE_ACTIONS: Record<PipelineStage, string> = {
  leads_found: 'play_store_scan',
  social_scraped: 'scrape_socials',
  concept_ready: 'x_api_inspiration',
  awaiting_approval: 'telegram_notify',
  in_development: 'claude_code_handoff',
  completed: 'email_draft_signoff',
}

function isStage(v: unknown): v is PipelineStage {
  return typeof v === 'string' && (PIPELINE_STAGES as string[]).includes(v)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeLead(raw: any): PipelineLead | null {
  if (!raw || typeof raw !== 'object') return null
  const id = raw.id || raw.lead_id
  const businessName = raw.business_name || raw.businessName
  if (!id || !businessName || !isStage(raw.stage)) return null
  return {
    id: String(id),
    stage: raw.stage,
    businessName: String(businessName),
    previewUrl: raw.preview_url ?? raw.previewUrl ?? undefined,
    firstSeenAt: raw.first_seen_at ?? raw.firstSeenAt ?? undefined,
    location: raw.location ?? undefined,
    playStoreUrl: raw.play_store_url ?? raw.playStoreUrl ?? undefined,
    score: typeof raw.score === 'number' ? raw.score : undefined,
    vertical: raw.vertical ?? undefined,
    phone: raw.phone ?? undefined,
    website: raw.website ?? undefined,
    rating: typeof raw.rating === 'number' ? raw.rating : undefined,
    reviewCount: typeof raw.review_count === 'number' ? raw.review_count
      : typeof raw.reviewCount === 'number' ? raw.reviewCount : undefined,
    qualified: typeof raw.qualified === 'boolean' ? raw.qualified : undefined,
    socials: raw.socials ?? undefined,
    extraData: raw.extra_data ?? raw.extraData ?? undefined,
    outreach: raw.outreach ?? undefined,
    concept: raw.concept ? {
      designDirection: raw.concept.design_direction ?? raw.concept.designDirection,
      inspirationSources: raw.concept.inspiration_sources ?? raw.concept.inspirationSources,
      estimatedScope: raw.concept.estimated_scope ?? raw.concept.estimatedScope,
    } : undefined,
    approval: raw.approval ? {
      telegramSentAt: raw.approval.telegram_sent_at ?? raw.approval.telegramSentAt,
      status: raw.approval.status,
      decidedAt: raw.approval.decided_at ?? raw.approval.decidedAt,
    } : undefined,
    development: raw.development ? {
      taskId: raw.development.task_id ?? raw.development.taskId,
      status: raw.development.status,
      progressPct: raw.development.progress_pct ?? raw.development.progressPct,
      milestones: raw.development.milestones,
    } : undefined,
    completed: raw.completed ? {
      previewUrl: raw.completed.preview_url ?? raw.completed.previewUrl,
      emailDraft: raw.completed.email_draft ?? raw.completed.emailDraft,
      emailStatus: raw.completed.email_status ?? raw.completed.emailStatus,
      signoffSentAt: raw.completed.signoff_sent_at ?? raw.completed.signoffSentAt,
    } : undefined,
    history: Array.isArray(raw.history) ? raw.history.filter((h: any) => isStage(h?.stage)) : undefined,
    createdAt: raw.created_at ?? raw.createdAt ?? undefined,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? undefined,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function readLeads(): Promise<PipelineLead[]> {
  try {
    const raw = JSON.parse(await fs.readFile(pipelineStore(), 'utf8'))
    const list = Array.isArray(raw) ? raw : raw?.leads
    if (!Array.isArray(list)) return []
    return list.map(normalizeLead).filter((l): l is PipelineLead => l !== null)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') logger.error('pipeline/store', err)
    return []
  }
}

async function readRecentEvents(limit = 40): Promise<PipelineEvent[]> {
  try {
    const text = await fs.readFile(pipelineEvents(), 'utf8')
    const lines = text.split('\n').filter(Boolean).slice(-limit)
    const out: PipelineEvent[] = []
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as CanonicalEvent
        if (evt.event_type !== 'pipeline_update') continue
        const p = evt.payload as unknown as PipelineUpdatePayload
        if (!p?.lead_id || !isStage(p.stage)) continue
        out.push({
          ts: evt.timestamp,
          leadId: p.lead_id,
          businessName: p.business_name,
          stage: p.stage,
          action: p.action,
          detail: p.detail,
        })
      } catch { /* skip malformed lines */ }
    }
    return out.reverse() // newest first
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') logger.error('pipeline/events', err)
    return []
  }
}

type StoredLead = Record<string, unknown> & {
  id: string
  stage?: string
  history?: { stage: string; ts: string; action?: string; note?: string }[]
}

export type UpsertLeadInput = {
  leadId: string
  businessName?: string
  stage?: PipelineStage
  fields?: Record<string, unknown>
  detail?: string
  sessionId?: string
  // Append a canonical event even when the stage didn't change (used for
  // approval/sign-off decisions recorded on the same stage).
  forceEvent?: boolean
}

export type UpsertLeadResult =
  | { ok: true; lead: StoredLead; action?: string }
  | { ok: false; error: string; status: number }

/**
 * Single write path for the pipeline store — used by /api/pipeline so the
 * skill/Telegram bridge and any dashboard writers stay in sync. Merges
 * `fields` (object values shallow-merge), records stage history, and appends
 * the canonical pipeline_update event.
 */
export async function upsertLead(input: UpsertLeadInput): Promise<UpsertLeadResult> {
  const { leadId, stage } = input
  if (!leadId || !/^[a-zA-Z0-9_-]{1,80}$/.test(leadId)) {
    return { ok: false, error: 'missing or invalid lead_id', status: 400 }
  }
  if (stage !== undefined && !PIPELINE_STAGES.includes(stage)) {
    return { ok: false, error: `invalid stage, must be one of: ${PIPELINE_STAGES.join(', ')}`, status: 400 }
  }

  await fs.mkdir(pipelineDir(), { recursive: true })

  let store: { updated_at?: string; leads: StoredLead[] } = { leads: [] }
  try {
    const parsed = JSON.parse(await fs.readFile(pipelineStore(), 'utf8'))
    if (parsed && Array.isArray(parsed.leads)) store = parsed
  } catch { /* fresh store */ }

  const now = new Date().toISOString()
  let lead = store.leads.find(l => l.id === leadId)
  const isNew = !lead
  if (!lead) {
    if (!input.businessName) {
      return { ok: false, error: 'business_name required for new leads', status: 400 }
    }
    lead = { id: leadId, created_at: now, history: [] }
    store.leads.push(lead)
  }

  if (input.businessName) lead.business_name = input.businessName
  if (input.fields) {
    for (const [k, v] of Object.entries(input.fields)) {
      if (k === 'id' || k === 'history') continue
      const existing = lead[k]
      if (v && typeof v === 'object' && !Array.isArray(v)
        && existing && typeof existing === 'object' && !Array.isArray(existing)) {
        lead[k] = { ...(existing as Record<string, unknown>), ...(v as Record<string, unknown>) }
      } else {
        lead[k] = v
      }
    }
  }

  const stageChanged = stage !== undefined && stage !== lead.stage
  if (stage !== undefined) lead.stage = stage
  if (isNew && !lead.stage) lead.stage = 'leads_found'
  lead.updated_at = now

  const effectiveStage = lead.stage as PipelineStage
  const action = STAGE_ACTIONS[effectiveStage]
  const detail = input.detail?.slice(0, 500)

  if (isNew || stageChanged) {
    lead.history = lead.history ?? []
    lead.history.push({ stage: effectiveStage, ts: now, action, note: detail })
  }

  store.updated_at = now
  await fs.writeFile(pipelineStore(), JSON.stringify(store, null, 2))

  if (isNew || stageChanged || input.forceEvent) {
    const evt: CanonicalEvent = {
      agent_id: 'hermes',
      session_id: input.sessionId ?? 'web-dev-pipeline',
      event_type: 'pipeline_update',
      timestamp: now,
      payload: {
        lead_id: leadId,
        business_name: lead.business_name,
        stage: effectiveStage,
        action,
        detail,
        score: typeof lead.score === 'number' ? lead.score : undefined,
      },
      source_path: pipelineStore(),
    }
    await fs.appendFile(pipelineEvents(), JSON.stringify(evt) + '\n')
  }

  return { ok: true, lead, action: isNew || stageChanged ? action : undefined }
}

// Per-stage display caps. leads_found is a 300+ bulk-scraped pool — the board
// shows only the top 20 by score; later stages show the newest 50.
const LEADS_FOUND_CAP = 20
const STAGE_CAP = 50

const PIPELINE_TIME_ZONE = 'America/Los_Angeles'
const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PIPELINE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
})
const monthLabelFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PIPELINE_TIME_ZONE, year: 'numeric', month: 'short',
})
const weekdayLabelFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' })
const monthDayLabelFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })

function localDateKey(value: Date): string | null {
  if (!Number.isFinite(value.getTime())) return null
  const parts = Object.fromEntries(localDateFormatter.formatToParts(value).map(part => [part.type, part.value]))
  if (!parts.year || !parts.month || !parts.day) return null
  return `${parts.year}-${parts.month}-${parts.day}`
}

function calendarKey(value: Date): string {
  // This Date is a synthetic UTC-midnight calendar value created by the
  // bucket builder, so its UTC fields are the intended date (no timezone
  // conversion is appropriate here).
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

function parsedDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp) : null
}

function calendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  // Treat the key as a calendar date, not a UTC timestamp. Reject rollover
  // so malformed input can never create a bucket with an accidental date.
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1
    || date.getUTCDate() !== Number(match[3])) return null
  return date
}

function shiftCalendarDate(date: Date, days: number): Date {
  const shifted = new Date(date)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted
}

function sendTimestamp(lead: PipelineLead): string | null {
  const outreach = lead.outreach
  const completed = lead.completed
  const history = lead.history ?? []

  // SENT OUT means outreach.sent_at is valid OR outreach.status === "sent"
  // OR completed.emailStatus === "sent". IN QUEUE is the complement: every
  // lead with none of those send signals is still not-yet-sent.
  // The signal and timestamp are intentionally separate: status === "sent"
  // proves the send even when its timestamp is absent, while invalid dates
  // must never enter a chart bucket.
  const outreachSent = outreach?.status === 'sent' || parsedDate(outreach?.sent_at) !== null
  const completedSent = completed?.emailStatus === 'sent'
  if (!outreachSent && !completedSent) return null

  const timestampCandidates: unknown[] = [
    outreach?.sent_at,
    completedSent ? completed?.signoffSentAt : undefined,
  ]
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.stage === 'completed') timestampCandidates.push(history[i]?.ts)
  }
  for (const candidate of timestampCandidates) {
    if (parsedDate(candidate)) return candidate as string
  }
  return ''
}

function bucket(date: Date, label: string, count = 0): PipelineSentBucket {
  return { date: calendarKey(date), label, count }
}

/**
 * Aggregate sends from the complete normalized lead list. This runs before
 * the board's per-stage display caps so weekly/monthly totals cannot silently
 * undercount the leads hidden from the UI.
 */
export function buildPipelineSentSummary(leads: PipelineLead[], now = new Date()): PipelineSentSummary {
  const todayKey = localDateKey(now)
  const today = todayKey ? calendarDate(todayKey) : null
  if (!today || !todayKey) {
    return { sentTotal: 0, queuedTotal: leads.length, sentThisWeek: 0, weekStart: '', sentThisMonth: 0, monthLabel: '', byDayThisWeek: [], byDayThisMonth: [] }
  }

  const mondayOffset = (today.getUTCDay() + 6) % 7
  const weekStartDate = shiftCalendarDate(today, -mondayOffset)
  const weekStart = calendarKey(weekStartDate)
  const weekBuckets = Array.from({ length: 7 }, (_, index) => {
    const date = shiftCalendarDate(weekStartDate, index)
    return bucket(date, weekdayLabelFormatter.format(date))
  })
  const monthStartDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const monthBuckets: PipelineSentBucket[] = []
  for (let date = monthStartDate; date <= today; date = shiftCalendarDate(date, 1)) {
    monthBuckets.push(bucket(date, monthDayLabelFormatter.format(date)))
  }

  let sentTotal = 0
  let queuedTotal = 0
  for (const lead of leads) {
    const timestamp = sendTimestamp(lead)
    if (timestamp === null) {
      queuedTotal += 1
      continue
    }
    sentTotal += 1
    if (!timestamp) continue
    const sentDate = parsedDate(timestamp)
    const sentDay = sentDate ? localDateKey(sentDate) : null
    if (!sentDay || sentDay > todayKey) continue

    const weekIndex = weekBuckets.findIndex(item => item.date === sentDay)
    if (weekIndex >= 0) weekBuckets[weekIndex].count += 1
    const monthIndex = monthBuckets.findIndex(item => item.date === sentDay)
    if (monthIndex >= 0) monthBuckets[monthIndex].count += 1
  }

  return {
    sentTotal,
    queuedTotal,
    sentThisWeek: weekBuckets.reduce((total, item) => total + item.count, 0),
    weekStart,
    sentThisMonth: monthBuckets.reduce((total, item) => total + item.count, 0),
    monthLabel: monthLabelFormatter.format(now),
    byDayThisWeek: weekBuckets,
    byDayThisMonth: monthBuckets,
  }
}

export async function collectPipeline(revenue = false): Promise<PipelineData> {
  const [leads, events] = await Promise.all([readLeads(), readRecentEvents()])
  const sentSummary = buildPipelineSentSummary(leads)
  const counts = Object.fromEntries(PIPELINE_STAGES.map(s => [s, 0])) as Record<PipelineStage, number>
  for (const lead of leads) counts[lead.stage] += 1

  // Local calendar day, NOT UTC. `toISOString()` reports the UTC date, so every
  // follow-up due "today" flipped to overdue at 17:00 Pacific — the moment UTC
  // rolls to tomorrow — seven hours early, raising a false OVERDUE alarm every
  // evening. localDateKey() already implements America/Los_Angeles and is what
  // buildPipelineSentSummary uses above; this loop had simply missed it.
  const today = localDateKey(new Date())
  const followups: NonNullable<PipelineData['followups']> = { overdue: 0, upcoming: 0 }
  for (const lead of leads) {
    const outreach = lead.outreach
    if (!outreach?.followup_due || outreach.status !== 'sent' || outreach.followup_sent_at
      || (outreach.reply != null && outreach.reply !== 'none recorded')) continue
    const due = outreach.followup_due
    if (today && due.slice(0, 10) < today) {
      followups.overdue += 1
    } else {
      followups.upcoming += 1
      if (!followups.nextDue || due < followups.nextDue) followups.nextDue = due
    }
  }

  const display: PipelineLead[] = []
  for (const stage of PIPELINE_STAGES) {
    const pool = leads.filter(l => l.stage === stage)
    if (stage === 'leads_found') {
      pool.sort((a, b) =>
        // Direct client records must remain visible even when the bulk lead
        // scanner has filled the column. They are operationally active, not
        // disposable prospects.
        (a.id.startsWith('client-') ? -1 : 0) - (b.id.startsWith('client-') ? -1 : 0)
        || (b.score ?? -1) - (a.score ?? -1)
        || (b.rating ?? 0) - (a.rating ?? 0)
        || (b.reviewCount ?? 0) - (a.reviewCount ?? 0))
      display.push(...pool.slice(0, LEADS_FOUND_CAP))
    } else {
      pool.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      display.push(...pool.slice(0, revenue && (stage === 'awaiting_approval' || stage === 'in_development') ? undefined : STAGE_CAP))
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    source: pipelineStore().replace(getConfig().homeDir, '~'),
    leads: display,
    counts,
    leadsTotal: leads.length,
    followups,
    events,
    sentSummary,
  }
}
