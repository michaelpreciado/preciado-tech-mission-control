'use client'

/**
 * BOTS — the Hermes Bot Mode roster + management.
 *
 * One card per Bot (a Hermes profile): identity, model, live gateway status,
 * session/message volume, last activity, and the bot's scheduled routines
 * (`[bot:<name>]` cron jobs). Everything is read straight from each profile's
 * `state.db` + `gateway_state.json` via /api/bots — nothing is simulated.
 *
 * v2 — engage + manage (Hermes desktop parity):
 *  - ENGAGE on every card deep-links into the Chat console pre-filtered to
 *    that profile (/chat?profile=<name> — ChatConsole reads the query and
 *    presets its filter + NEW composer), so a bot is a real conversation, not
 *    a read-only card.
 *  - ADD BOT clones an existing profile via `hermes profile create
 *    --clone-from` (POST /api/bots/actions, auth-gated server-side).
 *  - REMOVE deletes a profile via `hermes profile delete -y` — two-step
 *    type-to-confirm in the UI, plus server-side safety gates: never
 *    `default`, never a profile whose gateway is live.
 * The read-only roster remains the fallback when the action API is down.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SectionHead, SkeletonPanel, EmptyTerminal, Window, Badge } from '../ui'
import type { Bot, BotGatewayStatus, BotsSnapshot } from '@/lib/collectors/bots'

const POLL_MS = 20_000

const GW_TONE: Record<BotGatewayStatus, string> = {
  running: 'green',
  degraded: 'amber',
  stopped: 'red',
  unknown: 'dim',
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/

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

type RemoveState =
  | { step: 'idle' }
  | { step: 'confirm' }
  | { step: 'busy' }
  | { step: 'error'; message: string }

function BotCard({
  bot,
  onRemove,
}: {
  bot: Bot
  onRemove: (name: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const router = useRouter()
  const gw = bot.gateway
  const platforms = gw.platforms?.length ? gw.platforms.map(p => p.name).join(' · ') : ''
  const gwLive = gw.status === 'running' || gw.status === 'degraded'

  const [remState, setRemState] = useState<RemoveState>({ step: 'idle' })
  const [typed, setTyped] = useState('')

  const engage = () => router.push(`/chat?profile=${encodeURIComponent(bot.name)}`)

  const confirmRemove = async () => {
    if (typed !== bot.name) return
    setRemState({ step: 'busy' })
    const out = await onRemove(bot.name)
    if (!out.ok) {
      setRemState({ step: 'error', message: out.error ?? 'delete failed' })
      return
    }
    /* success → card disappears on the parent's refresh; reset local state */
    setRemState({ step: 'idle' })
    setTyped('')
  }

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

        {/* v2 — engage + manage */}
        <div
          className="mc-bots-actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px solid var(--pt-rule)',
          }}
        >
          <button className="mc-btn mc-btn-primary" onClick={engage} title={`Open a chat console against ${bot.name}`}>
            ◈ ENGAGE
          </button>

          {bot.isDefault ? (
            <span
              style={{ fontSize: 10, color: 'var(--pt-text-mute)', fontFamily: 'var(--pt-font-mono)', letterSpacing: '0.08em' }}
              title="the implicit default profile can't be deleted"
            >
              🔒 SYSTEM PROFILE
            </span>
          ) : gwLive ? (
            <span
              style={{ fontSize: 10, color: 'var(--pt-warn)', fontFamily: 'var(--pt-font-mono)', letterSpacing: '0.08em' }}
              title="stop the gateway before deleting this bot"
            >
              ⚠ LIVE — STOP GATEWAY FIRST
            </span>
          ) : remState.step === 'confirm' || remState.step === 'busy' || remState.step === 'error' ? (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 6,
                marginLeft: 'auto',
                maxWidth: '100%',
              }}
            >
              <input
                aria-label={`Type ${bot.name} to confirm removal`}
                placeholder={`type "${bot.name}" to confirm`}
                value={typed}
                onChange={e => setTyped(e.target.value)}
                disabled={remState.step === 'busy'}
                style={{
                  background: 'var(--pt-surface-2)',
                  border: '1px solid var(--pt-border-dim)',
                  borderRadius: 6,
                  color: 'var(--pt-text)',
                  padding: '5px 8px',
                  fontFamily: 'var(--pt-font-mono)',
                  fontSize: 10,
                  minWidth: 140,
                  width: 'min(100%, 200px)',
                }}
              />
              <button
                className="mc-btn"
                onClick={confirmRemove}
                disabled={typed !== bot.name || remState.step === 'busy'}
                style={remState.step === 'busy' ? undefined : { borderColor: '#ff5f57', color: '#ff8f8a' }}
                title="permanently delete this profile"
              >
                {remState.step === 'busy' ? 'DELETING…' : '✕ DELETE'}
              </button>
              <button
                className="mc-btn"
                onClick={() => { setRemState({ step: 'idle' }); setTyped('') }}
                disabled={remState.step === 'busy'}
              >
                CANCEL
              </button>
              {remState.step === 'error' && (
                <span style={{ fontSize: 10, color: '#ff8f8a', width: '100%' }}>
                  {remState.message}
                </span>
              )}
            </span>
          ) : (
            <button
              className="mc-btn"
              onClick={() => setRemState({ step: 'confirm' })}
              style={{ marginLeft: 'auto', borderColor: 'var(--pt-border-dim)', color: 'var(--pt-text-dim)' }}
              title="delete this profile"
            >
              ✕ REMOVE
            </button>
          )}
        </div>
      </div>
    </Window>
  )
}

function AddBotForm({
  bots,
  onCreated,
  onBusyChange,
}: {
  bots: Bot[]
  onCreated: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [name, setName] = useState('')
  const [cloneFrom, setCloneFrom] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  const valid = NAME_RE.test(name.trim().toLowerCase())

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    onBusyChange(true)
    setMsg(null)
    try {
      const res = await fetch('/api/bots/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: name.trim(), cloneFrom: cloneFrom || 'default' }),
      })
      const j = await res.json()
      if (!res.ok) {
        setMsg({ tone: 'err', text: j?.error ?? `HTTP ${res.status}` })
      } else {
        setMsg({ tone: 'ok', text: `created '${name.trim().toLowerCase()}'` })
        setName('')
        setOpen(false)
        onCreated()
      }
    } catch (err) {
      setMsg({ tone: 'err', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {msg && (
        <span
          style={{
            fontSize: 10,
            fontFamily: 'var(--pt-font-mono)',
            letterSpacing: '0.06em',
            color: msg.tone === 'ok' ? 'var(--pt-neon-bright)' : '#ff8f8a',
          }}
        >
          {msg.text}
        </span>
      )}
      {open && (
        <>
          <input
            aria-label="New bot profile name"
            placeholder="bot name"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={busy}
            style={{
              background: 'var(--pt-surface-2)',
              border: '1px solid var(--pt-border-dim)',
              borderRadius: 6,
              color: 'var(--pt-text)',
              padding: '5px 8px',
              fontFamily: 'var(--pt-font-mono)',
              fontSize: 10,
              width: 120,
            }}
          />
          <select
            aria-label="Clone from profile"
            value={cloneFrom}
            onChange={e => setCloneFrom(e.target.value)}
            disabled={busy}
            style={{
              background: 'var(--pt-surface-2)',
              border: '1px solid var(--pt-border-dim)',
              borderRadius: 6,
              color: 'var(--pt-text)',
              padding: '5px 8px',
              fontFamily: 'var(--pt-font-mono)',
              fontSize: 10,
            }}
          >
            <option value="">clone from default</option>
            {bots.filter(b => !b.isDefault).map(b => (
              <option key={b.name} value={b.name}>clone from {b.name}</option>
            ))}
          </select>
          <button className="mc-btn mc-btn-primary" onClick={submit} disabled={!valid || busy}>
            {busy ? 'CREATING…' : 'CREATE'}
          </button>
          <button className="mc-btn" onClick={() => setOpen(false)} disabled={busy}>
            CANCEL
          </button>
        </>
      )}
      {!open && (
        <button className="mc-btn" onClick={() => setOpen(true)} disabled={busy}>
          ＋ ADD BOT
        </button>
      )}
    </div>
  )
}

export function BotsPanel() {
  const [data, setData] = useState<BotsSnapshot | null>(null)
  const [err, setErr] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [actBusy, setActBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => fetch('/api/bots', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: BotsSnapshot) => { if (alive) { setData(j); setErr(false) } })
      .catch(() => { if (alive) setErr(true) })
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [reloadToken])

  if (!data) {
    return err
      ? <EmptyTerminal label="bots endpoint unreachable" />
      : <SkeletonPanel label="loading bots" />
  }

  const { totals } = data

  const removeBot = async (name: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/bots/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', name }),
      })
      const j = await res.json()
      if (!res.ok) return { ok: false, error: j?.error ?? `HTTP ${res.status}` }
      setReloadToken(t => t + 1)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  return (
    <>
      <SectionHead
        label="BOTS / HERMES PROFILES"
        post={
          <span className="mc-bots-summary">
            {totals.bots} bot{totals.bots === 1 ? '' : 's'} · {totals.running} gateway up · {totals.routines} routine{totals.routines === 1 ? '' : 's'}
            {err && <span className="mc-bots-stale"> · roster stale</span>}
          </span>
        }
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 12,
          minHeight: 34,
          opacity: actBusy ? 0.55 : 1,
          transition: 'opacity 0.15s ease',
        }}
      >
        <AddBotForm
          bots={data.bots}
          onCreated={() => setReloadToken(t => t + 1)}
          onBusyChange={setActBusy}
        />
      </div>
      {data.bots.length === 0
        ? <EmptyTerminal label="no hermes profiles found" />
        : (
          <div className="mc-tile-grid mc-tile-grid--tri">
            {data.bots.map(bot => <BotCard key={bot.name} bot={bot} onRemove={removeBot} />)}
          </div>
        )}
    </>
  )
}