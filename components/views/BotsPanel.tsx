'use client'

/**
 * BOTS — the Hermes Bot Mode roster.
 *
 * One card per Bot (a Hermes profile): identity, model, live gateway status,
 * session/message volume, last activity, and the bot's scheduled routines
 * (`[bot:<name>]` cron jobs). Everything is read straight from each profile's
 * `state.db` + `gateway_state.json` via /api/bots — nothing is simulated.
 *
 * Chat / continue and the HoloHUD enrichment are a later pass; this view is
 * read-only.
 */
import { useEffect, useState } from 'react'
import { SectionHead, SkeletonPanel, EmptyTerminal, Window, Badge } from '../ui'
import type { Bot, BotGatewayStatus, BotsSnapshot } from '@/lib/collectors/bots'

const POLL_MS = 20_000

const GW_TONE: Record<BotGatewayStatus, string> = {
  running: 'green',
  degraded: 'amber',
  stopped: 'red',
  unknown: 'dim',
}

function ago(ts: number | null): string {
  if (!ts) return 'never'
  const ms = Date.now() - ts
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function shortModel(model: string | null): string {
  if (!model) return 'no model'
  return model.includes('/') ? model.split('/').pop()! : model
}

function Routine({ r }: { r: Bot['routines'][number] }) {
  const failed = r.lastRunStatus === 'error'
  return (
    <li className={`mc-bots-routine ${r.enabled ? '' : 'is-off'} ${failed ? 'is-failed' : ''}`}>
      <span className="mc-bots-routine-dot" aria-hidden="true" />
      <span className="mc-bots-routine-name">{r.routine}</span>
      <span className="mc-bots-routine-sched">{r.schedule}</span>
      <span className="mc-bots-routine-when">{failed ? 'last run failed' : `next ${r.nextRunAt ? new Date(r.nextRunAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}`}</span>
    </li>
  )
}

function BotCard({ bot }: { bot: Bot }) {
  const gw = bot.gateway
  return (
    <Window tag="◇" title={bot.name}>
      <div className="mc-tile-body">
        <div className="mc-bots-id">
          <span className="mc-bots-avatar" aria-hidden="true">{bot.avatarInitial}</span>
          <span className="mc-bots-id-text">
            <span className="mc-bots-name">{bot.name}</span>
            <span className="mc-bots-model">{shortModel(bot.model)}</span>
          </span>
          {bot.isDefault && <Badge tone="blue">default</Badge>}
        </div>

        <div className="mc-bots-gw" title={gw.detail}>
          <span className={`mc-led ${GW_TONE[gw.status]}`} />
          <span className="mc-bots-gw-status">GATEWAY {gw.status.toUpperCase()}</span>
          <span className="mc-bots-gw-detail">{gw.detail}</span>
        </div>

        <div className="mc-bots-stats">
          <span className="mc-bots-stat"><em>{bot.sessions}</em>sessions</span>
          <span className="mc-bots-stat"><em>{bot.messages.toLocaleString()}</em>messages</span>
          <span className="mc-bots-stat"><em>{bot.routineCount}</em>routines</span>
          <span className="mc-bots-stat"><em>{ago(bot.lastActiveAt)}</em>last active</span>
        </div>

        {bot.routines.length > 0 ? (
          <ul className="mc-bots-routines">
            {bot.routines.map(r => <Routine key={r.id} r={r} />)}
          </ul>
        ) : (
          <div className="mc-bots-routines-empty">no routines — schedule one with <code>[bot:{bot.name}]</code></div>
        )}
      </div>
    </Window>
  )
}

export function BotsPanel() {
  const [data, setData] = useState<BotsSnapshot | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => fetch('/api/bots', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: BotsSnapshot) => { if (alive) { setData(j); setErr(false) } })
      .catch(() => { if (alive) setErr(true) })
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (!data) {
    return err
      ? <EmptyTerminal label="bots endpoint unreachable" />
      : <SkeletonPanel label="loading bots" />
  }

  const { totals } = data

  return (
    <>
      <SectionHead
        label="BOTS / HERMES PROFILES"
        post={
          <span className="mc-bots-summary">
            {totals.bots} bot{totals.bots === 1 ? '' : 's'} · {totals.running} gateway up · {totals.routines} routine{totals.routines === 1 ? '' : 's'}
            {err && <span className="mc-bots-stale"> · stale</span>}
          </span>
        }
      />
      {data.bots.length === 0
        ? <EmptyTerminal label="no hermes profiles found" />
        : (
          <div className="mc-tile-grid mc-tile-grid--tri">
            {data.bots.map(bot => <BotCard key={bot.name} bot={bot} />)}
          </div>
        )}
    </>
  )
}
