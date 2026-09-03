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
 * read-only. The per-bot CONNECT row shows the profile's Telegram token
 * (masked) with a copy button so Michael can wire a new bot from the roster.
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

/** Mask a Telegram bot token for display — keeps the numeric bot id prefix,
 *  hides the secret: `123456789:Aa••••••Zz`. */
function maskToken(token: string): string {
  const sep = token.indexOf(':')
  const head = sep > 0 ? token.slice(0, sep + 1) : ''
  const secret = sep > 0 ? token.slice(sep + 1) : token
  if (secret.length <= 8) return `${head}••••••`
  return `${head}${secret.slice(0, 2)}••••••${secret.slice(-2)}`
}

/* Copy-to-clipboard — the same pattern ChatConsole uses. */

function fallbackCopy(text: string, onDone: () => void) {
  const el = document.createElement('textarea')
  el.value = text
  el.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
  document.body.appendChild(el)
  el.select()
  try { document.execCommand('copy') } catch { /* best-effort */ }
  document.body.removeChild(el)
  onDone()
}

function CopyTokenButton({ token, label }: { token: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const copy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(token).then(done).catch(() => fallbackCopy(token, done))
    } else {
      fallbackCopy(token, done)
    }
  }
  return (
    <button
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      style={{
        flexShrink: 0,
        marginLeft: 'auto',
        background: 'var(--pt-surface-2)',
        border: '1px solid var(--pt-border-dim)',
        borderRadius: 6,
        cursor: 'pointer',
        padding: '3px 8px',
        fontSize: '9px',
        fontFamily: 'var(--pt-font-mono)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: copied ? 'var(--pt-neon-bright)' : 'var(--pt-text-dim)',
      }}
    >
      {copied ? 'COPIED' : '⎘ COPY'}
    </button>
  )
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
  const platforms = gw.platforms?.length ? gw.platforms.map(p => p.name).join(' · ') : ''
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

        <div
          className="mc-bots-connect"
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '4px 8px',
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--pt-rule)',
            minWidth: 0,
          }}
        >
          <span
            className="mc-bots-connect-label"
            style={{
              fontFamily: 'var(--pt-font-mono)',
              fontSize: 9,
              letterSpacing: '0.12em',
              color: 'var(--pt-text-dim)',
            }}
          >
            {platforms ? `CONNECT · ${platforms}` : 'CONNECT'}
          </span>
          {bot.telegramToken ? (
            <>
              <code
                className="mc-bots-connect-token"
                style={{
                  fontFamily: 'var(--pt-font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  color: 'var(--pt-text-mute)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                {maskToken(bot.telegramToken)}
              </code>
              <CopyTokenButton token={bot.telegramToken} label={`Copy ${bot.name} Telegram token`} />
            </>
          ) : (
            <span
              className="mc-bots-connect-none"
              style={{ fontSize: 11, color: 'var(--pt-text-mute)' }}
            >
              no telegram token on file
            </span>
          )}
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
          <div className="mc-empty is-compact">
            <div className="mc-empty-glyph">◷</div>
            <div className="mc-empty-title">NO ROUTINES</div>
            <p className="mc-empty-desc">
              schedule one with the{' '}
              <code style={{ fontFamily: 'var(--pt-font-mono)' }}>[bot:{bot.name}]</code>{' '}
              cron namespace
            </p>
          </div>
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
