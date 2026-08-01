'use client'

/**
 * Live agent office floor.
 *
 * One desk per channel the agent actually works through (Telegram, Terminal,
 * Desktop, Scheduler, Subagents). A desk is occupied and animated only while
 * that channel has a session that produced a message inside the liveness
 * window; otherwise the seat is empty and the agent is asleep. The animation
 * reflects what kind of work is happening — building, researching, writing.
 *
 * Everything here is backed by /api/agent-activity. Nothing is simulated: an
 * idle floor means the agents are genuinely idle.
 */
import { useEffect, useState } from 'react'
import { SkeletonPanel } from './ui'
import type { AgentActivity, AgentChannel, WorkKind } from '@/lib/types'

const POLL_MS = 15_000

const KIND_META: Record<WorkKind, { label: string; glyph: string }> = {
  building: { label: 'building', glyph: '⚒' },
  research: { label: 'researching', glyph: '⌕' },
  content: { label: 'writing', glyph: '✎' },
  thinking: { label: 'thinking', glyph: '◌' },
  idle: { label: 'asleep', glyph: 'z' },
}

const CHANNEL_GLYPH: Record<string, string> = {
  telegram: '✈', cli: '❯', desktop: '▣', cron: '◷', subagent: '⑂',
}

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function Desk({ ch }: { ch: AgentChannel }) {
  const meta = KIND_META[ch.kind] ?? KIND_META.idle
  return (
    <div className={`mc-desk2 ${ch.live ? 'is-live' : 'is-idle'} kind-${ch.kind}`}>
      <div className="mc-desk2-head">
        <span className="mc-desk2-glyph">{CHANNEL_GLYPH[ch.id] ?? '◇'}</span>
        <span className="mc-desk2-name">{ch.label}</span>
        {ch.connected !== undefined && (
          <span className={`mc-desk2-conn ${ch.connected ? 'ok' : ''}`} title={ch.connected ? 'transport connected' : 'transport down'} />
        )}
      </div>

      <div className="mc-desk2-stage" aria-label={ch.live ? `${ch.label}: ${meta.label}` : `${ch.label}: asleep`}>
        <div className="mc-desk2-surface" />
        {ch.live ? (
          <div className="mc-desk2-agent">
            <span className="mc-desk2-head-dot" />
            <span className="mc-desk2-body" />
            <span className="mc-desk2-tool">{meta.glyph}</span>
          </div>
        ) : (
          <div className="mc-desk2-empty"><span className="zzz">z</span><span className="zzz">z</span><span className="zzz">z</span></div>
        )}
      </div>

      <div className="mc-desk2-foot">
        <span className="mc-desk2-kind">{meta.label}</span>
        {ch.live
          ? <span className="mc-desk2-meta">{ch.sessionCount} session{ch.sessionCount === 1 ? '' : 's'}</span>
          : <span className="mc-desk2-meta">{ago(ch.lastActivityAt)}</span>}
      </div>
    </div>
  )
}

export function AgentOffice() {
  const [data, setData] = useState<AgentActivity | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => fetch('/api/agent-activity', { cache: 'no-store' })
      .then(r => r.json())
      .then((j: AgentActivity) => { if (alive) { setData(j); setErr(false) } })
      .catch(() => { if (alive) setErr(true) })
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (!data) return <SkeletonPanel label="loading agent activity" />

  const working = data.channels.filter(c => c.live)

  return (
    <div className="mc-office2">
      <div className="mc-office2-bar">
        <span className="mc-office2-title">[o_o] AGENT OFFICE</span>
        <span className="mc-office2-sub">
          {working.length
            ? `${working.length} desk${working.length === 1 ? '' : 's'} occupied`
            : 'all quiet — no agent working right now'}
        </span>
        <span className="mc-office2-status">
          <span className={`mc-led ${data.gatewayRunning ? 'green' : ''}`} />
          {data.gatewayRunning ? 'GATEWAY UP' : 'GATEWAY DOWN'}
          {err && <span className="mc-office2-err"> · stale</span>}
        </span>
      </div>

      <div className="mc-office2-floor">
        {data.channels.map(ch => <Desk key={ch.id} ch={ch} />)}
      </div>

      {data.terminals.length > 0 && (
        <div className="mc-office2-terms">
          <span className="lbl">open terminals</span>
          {data.terminals.map(t => (
            <span key={t.tty} className="term">{t.tty} <em>{t.from}</em></span>
          ))}
        </div>
      )}
    </div>
  )
}
