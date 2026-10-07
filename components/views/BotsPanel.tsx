'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { apiFetch } from '@/lib/api-base'
import type { Bot, BotsSnapshot } from '@/lib/collectors/bots'
import { Button, Card, CardHead, Chip, Field, IconButton, Input, Row, Select, Sheet, Stat } from '../ui'
import styles from '../AgentConsole.module.css'

export function ago(ts: number | null): string {
  if (!ts) return 'No activity yet'
  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}

type ActionResult = { ok: boolean; error?: string }
type PostAction = (body: Record<string, unknown>) => Promise<ActionResult>

type BotDisplayMetadata = { displayName: string; role: string }

const BOT_DISPLAY_METADATA: Readonly<Record<string, BotDisplayMetadata>> = {
  default: { displayName: 'Pepper', role: 'Legal' },
  jarvis: { displayName: 'Jarvis', role: 'Orchestrator' },
  friday: { displayName: 'Friday', role: 'System' },
  'dum-e': { displayName: 'Debugger', role: 'QA' },
  forge: { displayName: 'Forge', role: 'Lead Engineer' },
  'tinker-engineer': { displayName: 'Tinker', role: 'Engineer' },
  sage: { displayName: 'Sage', role: 'Librarian' },
  scout: { displayName: 'Scout', role: 'Lead Assistant' },
}

const HIDDEN_BOT_PROFILES = new Set(['mctest', 'ui-probe', '.deleted'])

function ConfirmAction({ label, actionLabel = label, word, disabled, danger, ready = true, children, onRun }: {
  label: string; actionLabel?: string; word?: string; disabled?: boolean; danger?: boolean; ready?: boolean
  children?: ReactNode; onRun: () => Promise<ActionResult>
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async () => {
    if (busy || disabled || !ready || (word && typed !== word)) return
    setBusy(true); setError('')
    try {
      const result = await onRun()
      if (!result.ok) setError(result.error || 'Action failed')
      else { setOpen(false); setTyped('') }
    } finally { setBusy(false) }
  }
  if (!open) return <Button variant={danger ? 'danger' : 'ghost'} disabled={disabled} onClick={() => setOpen(true)}>{label}</Button>
  return <Card tone="sunken" pad="sm" className={styles.stack}>
    <strong>{label}</strong>
    {children}
    {word && <Field label={`Type ${word} to confirm`}><Input autoComplete="off" value={typed} disabled={busy} onChange={e => setTyped(e.target.value)} /></Field>}
    <div className={styles.actions}>
      <Button variant={danger ? 'danger' : 'primary'} disabled={disabled || !ready || Boolean(word && typed !== word)} loading={busy} onClick={() => void run()}>{actionLabel}</Button>
      <Button disabled={busy} onClick={() => { setOpen(false); setTyped(''); setError('') }}>Cancel</Button>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </Card>
}

function BotDetails({ bot, bots, onAction }: { bot: Bot; bots: Bot[]; onAction: PostAction }) {
  const [model, setModel] = useState(bot.model || '')
  const [custom, setCustom] = useState(false)
  const live = bot.gateway.status === 'running' || bot.gateway.status === 'degraded'
  const protectedProfile = bot.isDefault || bot.name === 'default'
  const models = Array.from(new Set([bot.model, ...bots.map(b => b.model)].filter((m): m is string => Boolean(m))))
  return <div className={styles.stack}>
    <CardHead title={bot.name} sub={bot.gateway.detail} right={<Chip tone={live ? (bot.gateway.status === 'running' ? 'ok' : 'warn') : 'neutral'}>{bot.gateway.status}</Chip>} />
    <div className={styles.stats}>
      <Stat label="Sessions" value={bot.sessions} /><Stat label="Messages" value={bot.messages.toLocaleString()} />
      <Stat label="Routines" value={bot.routineCount} /><Stat label="Last active" value={ago(bot.lastActiveAt)} />
    </div>
    <section className={styles.stack} aria-label="Gateway and model">
      <h3>Gateway and model</h3>
      <p>{bot.model || 'No model configured'}</p>
      {protectedProfile ? <p className={styles.muted}>The default profile cannot be managed here.</p> : <>
        <div className={styles.actions}>
          {(live ? ['restart', 'stop'] : ['start']).map(action => <ConfirmAction key={action} label={`${action[0].toUpperCase()}${action.slice(1)} gateway`} word={bot.name} danger={action === 'stop'} onRun={() => onAction({ action, name: bot.name })} />)}
        </div>
        <ConfirmAction label="Edit model" actionLabel="Save model" word={bot.name} ready={Boolean(model.trim() && model.trim() !== bot.model)} onRun={() => onAction({ action: 'edit-model', name: bot.name, model: model.trim() })}>
          <Field label="Model">{custom ? <Input value={model} onChange={e => setModel(e.target.value)} placeholder="provider/model-id" /> : <Select value={model} onChange={e => { if (e.target.value === '__custom__') { setCustom(true); setModel('') } else setModel(e.target.value) }}><option value="" disabled>Select a model</option>{models.map(m => <option key={m}>{m}</option>)}<option value="__custom__">Custom model…</option></Select>}</Field>
        </ConfirmAction>
      </>}
    </section>
    <section className={styles.stack} aria-label="Routines">
      <h3>Routines</h3>
      {bot.routines.length === 0 && <p className={styles.muted}>No routines scheduled.</p>}
      {bot.routines.map(r => <Card key={r.id} tone="sunken" pad="sm" className={styles.stack}>
        <Row title={r.routine} sub={<span className={styles.rowMeta}>{r.schedule} · {r.lastRunStatus === 'error' ? 'Last run failed' : r.nextRunAt ? `Next ${new Date(r.nextRunAt).toLocaleString()}` : 'No next run'}</span>} trailing={<Chip tone={r.enabled ? 'ok' : 'neutral'}>{r.enabled ? 'Active' : 'Paused'}</Chip>} />
        <ConfirmAction label={r.enabled ? 'Pause routine' : 'Resume routine'} onRun={() => onAction({ action: 'toggle-routine', id: r.id, enabled: !r.enabled })} />
      </Card>)}
    </section>
    <section className={styles.stack} aria-label="Connection details">
      <h3>Connection details</h3>
      {bot.gateway.platforms?.map(p => <Row key={p.name} title={p.name} sub={p.state} />)}
    </section>
    {!protectedProfile && <section className={styles.stack} aria-label="Remove bot">
      {live && <p className={styles.muted}>Stop the gateway before removing this bot.</p>}
      <ConfirmAction label="Remove bot" word={bot.name} danger disabled={live} onRun={() => onAction({ action: 'delete', name: bot.name })} />
    </section>}
  </div>
}

function AddBot({ bots, onAction }: { bots: Bot[]; onAction: PostAction }) {
  const [name, setName] = useState('')
  const [cloneFrom, setCloneFrom] = useState('default')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const valid = /^[a-z0-9][a-z0-9-]{0,31}$/.test(name.trim().toLowerCase())
  return <form className={styles.stack} onSubmit={async e => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true); setError('')
    const result = await onAction({ action: 'create', name: name.trim(), cloneFrom })
    if (!result.ok) setError(result.error || 'Could not create bot')
    setBusy(false)
  }}>
    <Field label="Bot name" hint="Up to 32 lowercase letters, numbers or hyphens."><Input value={name} onChange={e => setName(e.target.value)} disabled={busy} autoComplete="off" /></Field>
    <Field label="Clone from profile"><Select value={cloneFrom} disabled={busy} onChange={e => setCloneFrom(e.target.value)}><option value="default">default</option>{bots.filter(b => b.name !== 'default').map(b => <option key={b.name}>{b.name}</option>)}</Select></Field>
    <Button type="submit" variant="primary" disabled={!valid} loading={busy}>Create bot</Button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </form>
}

export function BotsPanel({ selected, onSelect, disabled, management, onManage, details }: {
  selected: string; onSelect: (profile: string) => void; disabled: boolean
  management: string | null; onManage: (name: string | null) => void; details?: ReactNode
}) {
  const [data, setData] = useState<BotsSnapshot | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const actionBusy = useRef(false)
  const close = useCallback(() => onManage(null), [onManage])
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await apiFetch('/api/bots', { signal: controller.signal })
        if (!response.ok) throw new Error(`Could not load bots (${response.status})`)
        const body: BotsSnapshot = await response.json()
        if (alive) { setData(body); setError('') }
      } catch (e) { if (alive) setError((e as Error).message) }
      finally { if (alive) timer = setTimeout(() => void load(), 20_000) }
    }
    void load()
    return () => { alive = false; controller.abort(); clearTimeout(timer) }
  }, [reload])
  const postAction: PostAction = async body => {
    if (actionBusy.current) return { ok: false, error: 'Another bot action is still running' }
    actionBusy.current = true
    try {
      const response = await apiFetch('/api/bots/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) return { ok: false, error: result.error || `Action failed (${response.status})` }
      setReload(v => v + 1)
      if (body.action === 'create' || body.action === 'delete') onManage(null)
      return { ok: true }
    } catch (e) { return { ok: false, error: (e as Error).message } }
    finally { actionBusy.current = false }
  }
  const bot = data?.bots.find(b => b.name === management)
  const visibleBots = data?.bots.filter(b => !HIDDEN_BOT_PROFILES.has(b.name)) ?? []
  return <>
    <div className={styles.roster} aria-label="Bot roster">
      <div className={styles.sectionHead}><h2>Bots</h2><Button disabled={disabled} onClick={() => onManage('__add__')}>Add bot</Button></div>
      {error && <div role="alert" className={styles.notice}><p>{error}{data ? '. Showing the last received roster.' : ''}</p><Button onClick={() => setReload(v => v + 1)}>Retry</Button></div>}
      {!data && !error && <p className={styles.notice} role="status">Loading bots…</p>}
      <Button className={styles.allBots} active={!selected} disabled={disabled} onClick={() => onSelect('')}>All conversations <span aria-hidden="true">›</span></Button>
      {visibleBots.map(b => {
        const display = BOT_DISPLAY_METADATA[b.name] ?? { displayName: b.name, role: '' }
        const label = display.role ? `${display.displayName} (${display.role})` : display.displayName
        return <Row key={b.name} className={styles.botRow} title={<Button className={styles.botIdentity} active={selected === b.name} disabled={disabled} onClick={() => onSelect(b.name)} aria-label={`Conversations with ${label}, gateway ${b.gateway.status}`}>
          <span className={styles.dot} role="img" data-status={b.gateway.status} title={`Gateway ${b.gateway.status}`} aria-label={`Gateway ${b.gateway.status}`} />
          <span className={styles.botCopy}><strong>{display.displayName}</strong>{display.role && <span className={styles.rowMeta}>({display.role})</span>}<span className={styles.botModel}>{b.model || 'No model'}</span><span className={styles.rowMeta}>{ago(b.lastActiveAt)}</span></span><span aria-hidden="true">›</span>
        </Button>} trailing={<IconButton aria-label={`Manage ${b.name}`} disabled={disabled} onClick={() => onManage(b.name)}>⋯</IconButton>} />
      })}
      {data && visibleBots.length === 0 && <p className={styles.notice}>No bot profiles found. Add a bot to get started.</p>}
    </div>
    <Sheet open={management !== null} onClose={close} title={management === '__add__' ? 'Add bot' : `Manage ${management || 'conversation'}`}>
      <div className={styles.management}>
        {management === '__add__' ? <AddBot bots={visibleBots} onAction={postAction} /> : <>
          {bot && <BotDetails key={bot.name} bot={bot} bots={data?.bots || []} onAction={postAction} />}
          {!bot && <p className={styles.muted}>{error || 'No bot management data available for this profile.'}</p>}
          {details}
        </>}
      </div>
    </Sheet>
  </>
}
