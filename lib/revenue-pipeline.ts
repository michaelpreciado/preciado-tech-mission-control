import type { PipelineLead } from './types'

export function formatTimeInStage(since?: string, now = Date.now()): string {
  if (!since || !Number.isFinite(Date.parse(since))) return '—'
  const minutes = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}

export function stageStartedAt(lead: PipelineLead): string | undefined {
  return lead.history?.filter(entry => entry.stage === lead.stage)
    .sort((a, b) => b.ts.localeCompare(a.ts))[0]?.ts
    ?? lead.updatedAt ?? lead.firstSeenAt ?? lead.createdAt
}

export function deadlineChip(deadline?: string | null, now = Date.now()): { kind: 'overdue' | 'due' | 'none'; label: string } {
  if (!deadline || !Number.isFinite(Date.parse(deadline))) return { kind: 'none', label: '' }
  if (Date.parse(deadline) < now) return { kind: 'overdue', label: `OVERDUE +${formatTimeInStage(deadline, now) === 'now' ? '<1m' : formatTimeInStage(deadline, now)}` }
  return { kind: 'due', label: `DUE ${new Date(deadline).toISOString().slice(5, 10)}` }
}

export function revenueLeads(leads: PipelineLead[]): PipelineLead[] {
  const oldest = (a: PipelineLead, b: PipelineLead) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '')
  return [
    ...leads.filter(l => l.stage === 'awaiting_approval').sort(oldest),
    ...leads.filter(l => l.stage === 'in_development').sort(oldest),
    ...leads.filter(l => l.stage === 'completed').sort((a, b) => oldest(b, a)).slice(0, 3),
  ]
}
