/**
 * Unified approvals inbox — everything waiting on the operator, in one shape.
 *
 * Sources:
 *  - Web dev pipeline gates (awaiting_approval cards, email sign-offs) — ACTIONABLE:
 *    decisions write the pipeline store via lib/pipeline-data upsertLead, the
 *    same fields a Telegram reply sets, so both channels stay in sync.
 *  - Hermes blocked/failing kanban tasks — informational, link to /tasks.
 *  - OpenClaw exec allowlist — informational visibility (no pending queue file).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { HOME } from './home'
import { collectPipeline } from './pipeline-data'
import { getBlockedTasks } from './hermes-kanban'
import { logger } from './logger'
import type { ApprovalItem, ApprovalsData } from './types'

const EXEC_APPROVALS = path.join(HOME, '.openclaw/exec-approvals.json')

async function execAllowlistInfo(): Promise<ApprovalItem[]> {
  try {
    const raw = JSON.parse(await fs.readFile(EXEC_APPROVALS, 'utf8'))
    const agents = raw?.agents && typeof raw.agents === 'object' ? Object.entries(raw.agents) : []
    if (!agents.length) return []
    const rules = agents.map(([agent, v]) => {
      const list = (v as { allowlist?: unknown[] })?.allowlist
      return `${agent}: ${Array.isArray(list) ? list.length : 0} rule(s)`
    })
    return [{
      id: 'openclaw:exec-allowlist',
      kind: 'exec_allowlist',
      title: 'OpenClaw exec allowlist',
      summary: rules.join(' · '),
      source: '~/.openclaw/exec-approvals.json',
      actionable: false,
    }]
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') logger.error('approvals/exec', err)
    return []
  }
}

export async function collectApprovals(): Promise<ApprovalsData> {
  const pending: ApprovalItem[] = []
  const info: ApprovalItem[] = []

  const [pipeline, execInfo] = await Promise.all([
    collectPipeline().catch(() => null),
    execAllowlistInfo(),
  ])

  for (const lead of pipeline?.leads ?? []) {
    if (lead.stage === 'awaiting_approval' && (lead.approval?.status ?? 'pending') === 'pending') {
      pending.push({
        id: `pipeline:${lead.id}`,
        kind: 'pipeline_approval',
        title: `Build approval — ${lead.businessName}`,
        summary: [
          lead.location,
          lead.vertical,
          typeof lead.score === 'number' ? `score ${lead.score}` : undefined,
          lead.concept?.designDirection,
        ].filter(Boolean).join(' · '),
        requestedAt: lead.approval?.telegramSentAt ?? lead.updatedAt,
        source: 'web-dev-pipeline',
        href: '/pipeline',
        leadId: lead.id,
        actionable: true,
        payload: {
          concept: lead.concept,
          socials: lead.socials,
          rating: lead.rating,
          reviewCount: lead.reviewCount,
          phone: lead.phone,
          website: lead.website,
        },
      })
    }
    if (lead.stage === 'completed' && lead.completed?.emailStatus === 'awaiting_signoff') {
      pending.push({
        id: `email:${lead.id}`,
        kind: 'email_signoff',
        title: `Email sign-off — ${lead.businessName}`,
        summary: 'Outreach email drafted. It sends ONLY after you approve.',
        requestedAt: lead.completed?.signoffSentAt ?? lead.updatedAt,
        source: 'web-dev-pipeline',
        href: '/pipeline',
        leadId: lead.id,
        actionable: true,
        payload: {
          emailDraft: lead.completed?.emailDraft,
          previewUrl: lead.completed?.previewUrl,
        },
      })
    }
  }

  for (const task of getBlockedTasks()) {
    info.push({
      id: `hermes:${task.id}`,
      kind: 'task_attention',
      title: `Hermes task ${task.status} — ${task.title}`,
      summary: task.lastFailureError
        ? `${task.consecutiveFailures} failure(s): ${task.lastFailureError.slice(0, 160)}`
        : `assignee ${task.assignee ?? 'unassigned'}`,
      requestedAt: task.createdAt,
      source: '~/.hermes/kanban.db',
      href: '/tasks',
      actionable: false,
    })
  }

  info.push(...execInfo)

  const byNewest = (a: ApprovalItem, b: ApprovalItem) =>
    (b.requestedAt ?? '').localeCompare(a.requestedAt ?? '')
  pending.sort(byNewest)
  info.sort(byNewest)

  return {
    generatedAt: new Date().toISOString(),
    pending,
    info,
    counts: { pending: pending.length, info: info.length },
  }
}
