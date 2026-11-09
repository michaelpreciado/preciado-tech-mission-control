'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveData } from '@/components/LiveDataProvider'
import { Button, Divider, Glyph, Kv, KvRow, Prompt, WRow, type GlyphName } from '@/components/ui'
import { SegBar } from '@/components/charts/SegBar'
import { MiniHist } from '@/components/charts/MiniHist'
import { apiFetch } from '@/lib/api-base'
import type { HostMetrics } from '@/lib/host-metrics'
import type { BotsSnapshot } from '@/lib/collectors/bots'
import type { KanbanMultiSnapshot, SystemHealthData } from '@/lib/types'
import styles from '@/components/system.module.css'

const POLL_MS = 30_000
const STALE_MS = 120_000
const FILE_IDS = new Set(['kanban-db', 'pipeline-store', 'cron-jobs'])
/** Launcher widget thresholds: amber at 85 %, red at 95 %. */
const TONE = { warn: 85, crit: 95 }
type Resource<T> = { data: T | null; error: string | null }
type Resources = {
  host: Resource<HostMetrics>
  system: Resource<SystemHealthData>
  bots: Resource<BotsSnapshot>
  board: Resource<KanbanMultiSnapshot>
}
const empty = { data: null, error: null }
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const pct0 = (n: unknown) => finite(n) ? `${Math.round(n)}%` : '—'
const deg = (n: unknown) => finite(n) ? `${Math.round(n)}°` : ''
/** `40G`, `119G`, `512M` — the widget's compact capacity. */
function size(bytes: unknown) {
  if (!finite(bytes) || bytes < 0) return ''
  const g = bytes / 1024 ** 3
  if (g >= 1024) return `${(g / 1024).toFixed(1)}T`
  if (g >= 10) return `${Math.round(g)}G`
  if (g >= 1) return `${g.toFixed(1)}G`
  return `${Math.round(bytes / 1024 ** 2)}M`
}
/** `38B`, `1.2K`, `4.0M` per second. */
function rate(bps: unknown) {
  if (!finite(bps) || bps < 0) return '—'
  if (bps < 1024) return `${Math.round(bps)}B`
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)}K`
  return `${(bps / 1024 ** 2).toFixed(1)}M`
}
/** `5070` from "NVIDIA GeForce RTX 5070 Ti"; falls back to `gpu0`. */
function gpuLabel(name: string, index: number) {
  return name.match(/\b(\d{4})\b/)?.[1] ?? `gpu${index}`
}
function mountLabel(mount: string) {
  return mount === '/' ? 'disk' : mount.split('/').filter(Boolean).pop()?.slice(0, 6) || mount
}
/** Down-sample a 1 Hz history into `slots` averaged buckets for a MiniHist. */
function buckets(values: number[] | undefined, slots: number) {
  const v = (values ?? []).filter(finite)
  if (v.length <= slots) return v
  const per = v.length / slots
  return Array.from({ length: slots }, (_, i) => {
    const part = v.slice(Math.floor(i * per), Math.floor((i + 1) * per))
    return part.reduce((a, b) => a + b, 0) / Math.max(1, part.length)
  })
}
function timestamp(value?: string | number | null) {
  const ms = typeof value === 'number' ? value : value ? Date.parse(value) : NaN
  return Number.isFinite(ms) ? ms : null
}
function date(value?: string | number | null) {
  const ms = timestamp(value)
  return ms === null ? 'not reported' : new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
}
function stale(value: string | number | null | undefined, now: number) {
  const ms = timestamp(value)
  return ms === null || now - ms > STALE_MS
}
function uptime(seconds?: number | null) {
  if (!finite(seconds)) return '—'
  const minutes = Math.floor(seconds / 60)
  const d = Math.floor(minutes / 1440)
  const h = Math.floor(minutes / 60) % 24
  return d > 0 ? `${d}d ${h}h` : `${h}h ${minutes % 60}m`
}
type Severity = 'bad' | 'warn' | 'muted' | 'ok' | 'neutral'
/** missing/unavailable are absences (muted `·`), stopped is amber `×`, down is red `×`. */
function severity(state: string): Severity {
  if (['up', 'running', 'ok', 'available'].includes(state)) return 'ok'
  if (['down', 'auth-fail', 'failed'].includes(state)) return 'bad'
  if (['warn', 'degraded', 'stale', 'stopped'].includes(state)) return 'warn'
  if (['missing', 'unavailable', 'unknown'].includes(state)) return 'muted'
  return 'neutral'
}
const GLYPH: Record<Severity, GlyphName> = { ok: 'ok', bad: 'err', warn: 'fail', muted: 'idle', neutral: 'idle' }
const glyphFor = (state: string) => GLYPH[severity(state)]
const stateWord = (state: string) => state === 'warn' ? 'needs attention' : state === 'auth-fail' ? 'auth failed' : state
function Freshness({ at, error, now }: { at?: string | number | null; error?: string | null; now: number }) {
  if (error) return <span className={styles.fresh}><Glyph g="fail" /> refresh failed</span>
  if (!timestamp(at)) return <span className={styles.fresh}><Glyph g="idle" /> no timestamp</span>
  return stale(at, now)
    ? <span className={styles.fresh}><Glyph g="fail" /> stale</span>
    : <span className={styles.fresh}><Glyph g="ok" /> fresh</span>
}
function Notice({ resource, label }: { resource: Resource<unknown>; label: string }) {
  return resource.error ? <p className={styles.notice}>{label}: {resource.error}.{resource.data ? ' showing the last received data.' : ' no data available.'}</p> : null
}
/** A widget head: prompt left, freshness/actions right; the right slot wraps under the prompt on phones. */
function Head({ cmd, right }: { cmd: string; right?: React.ReactNode }) {
  return <header className={styles.head}><Prompt as="h2" host="friday" cmd={cmd} />{right ? <div className={styles.headRight}>{right}</div> : null}</header>
}
/** `cpu [segbar] 44% 64°` */
function Meter({ k, value, right, label }: { k: string; value: number | null; right: React.ReactNode; label: string }) {
  return <>
    <span className={styles.k}>{k}</span>
    {value == null ? <span className={styles.na}>—</span> : <SegBar value={value} autoTone={TONE} label={label} />}
    <span className={`${styles.v} ${value != null && value >= TONE.crit ? styles.crit : value != null && value >= TONE.warn ? styles.warn : ''}`}>{right}</span>
  </>
}
/** `thr` — one segment per logical core, toned by that core's own load. */
function Threads({ cores }: { cores: number[] }) {
  return <div className={`mc-segbar ${styles.thr}`} style={{ '--n': cores.length } as React.CSSProperties} role="img"
    aria-label={`${cores.length} threads, ${cores.filter(c => c >= 15).length} busy`}>
    {cores.map((c, i) => <i key={i} className={c >= TONE.crit ? `on ${styles.segCrit}` : c >= TONE.warn ? `on ${styles.segWarn}` : c >= 15 ? 'on' : undefined} />)}
  </div>
}

/** Extra sources stay local; mission telemetry and SSE are owned by LiveDataProvider. */
function useSystemSources() {
  const live = useLiveData()
  const liveRefresh = useRef(live.refresh)
  liveRefresh.current = live.refresh
  const [resources, setResources] = useState<Resources>({ host: empty, system: empty, bots: empty, board: empty })
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const lastRequestAt = useRef(0)

  const refresh = useCallback(async () => {
    if (controller.current) return
    const ctl = new AbortController()
    controller.current = ctl
    lastRequestAt.current = Date.now()
    setRefreshing(true)
    setNow(Date.now())
    const load = async <K extends keyof Resources>(key: K, url: string, valid: (json: Resources[K]['data']) => boolean) => {
      try {
        const response = await apiFetch(url, { signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(12_000)]) })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const json = await response.json() as Resources[K]['data']
        if (!json || !valid(json)) throw new Error('Unexpected response')
        if (!ctl.signal.aborted) setResources(prev => ({ ...prev, [key]: { data: json, error: null } }))
      } catch (error) {
        if (!ctl.signal.aborted) setResources(prev => ({ ...prev, [key]: { ...prev[key], error: error instanceof Error ? error.message : 'Unavailable' } }))
      }
    }
    await Promise.allSettled([
      liveRefresh.current(),
      load('host', '/api/telemetry', j => !!j?.static && !!j.history && Array.isArray(j.mounts)),
      load('system', '/api/system', j => Array.isArray(j?.services)),
      load('bots', '/api/bots', j => Array.isArray(j?.bots)),
      load('board', '/api/kanban', j => typeof j?.available === 'boolean' && !!j.counts),
    ])
    if (controller.current === ctl) {
      controller.current = null
      if (!ctl.signal.aborted) { setRefreshing(false); setNow(Date.now()) }
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      setNow(Date.now())
      if (!document.hidden) void refresh()
    }, POLL_MS)
    const onVisible = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      controller.current?.abort()
      controller.current = null
    }
  }, [refresh])

  // Reuse the provider's existing /api/events subscription, including named events.
  // Debounce bursts, while the poll ensures continuous traffic cannot starve updates.
  const eventId = live.events[0]?.id
  useEffect(() => {
    if (eventId == null) return
    const delay = Math.max(1000, 5000 - (Date.now() - lastRequestAt.current))
    const timer = window.setTimeout(() => { if (!document.hidden) void refresh() }, delay)
    return () => clearTimeout(timer)
  }, [eventId, refresh])

  return { ...live, resources, refreshing, refresh, now }
}

export default function SystemPage() {
  const { data, error, eventStream, resources, refreshing, refresh, now } = useSystemSources()
  const host = resources.host.data
  const sample = host?.current
  const telemetry = data?.telemetry
  const health = resources.system.data
  const bots = resources.bots.data
  const board = resources.board.data
  const memory = sample && sample.memTotalKb > 0
    ? { used: sample.memUsedKb, total: sample.memTotalKb }
    : telemetry?.memory && telemetry.memory.totalKb > 0
      ? { used: telemetry.memory.totalKb - telemetry.memory.availableKb, total: telemetry.memory.totalKb } : null
  const gpus = sample?.gpus.length ? sample.gpus : telemetry?.gpus ?? []
  const mounts = host?.mounts.length ? host.mounts : telemetry?.disk ? [{ mount: '/', device: '', ...telemetry.disk }] : []
  const freshest = Math.max(timestamp(sample?.t) ?? 0, timestamp(telemetry?.generatedAt) ?? 0) || null
  const services = useMemo(() => [...(health?.services ?? [])].sort((a, b) => {
    const rank = (status: string) => severity(status) === 'bad' ? 0 : status === 'up' ? 2 : 1
    return rank(a.status) - rank(b.status)
  }), [health])
  const issues = services.filter(s => s.status !== 'up')
  const sources = data?.sources
  const freshness = data?.costs?.freshness
  const sourceRows = useMemo(() => sources ? [
    { id: 'calendar', name: 'Calendar', state: !sources.calendar.configured ? 'missing' : sources.calendar.ok ? 'ok' : 'degraded', at: sources.calendar.syncedAt, detail: sources.calendar.detail },
    { id: 'ideas', name: 'Ideas', state: sources.ideas.exists ? 'ok' : 'missing', at: null, detail: 'Last update is not exposed by this source.' },
    { id: 'missions', name: 'Missions', state: !sources.missions.path ? 'missing' : sources.missions.stale ? 'stale' : 'ok', at: sources.missions.updatedAt, detail: '' },
    { id: 'kanban', name: 'Kanban activity', state: sources.kanban.available ? 'ok' : 'unavailable', at: sources.kanban.lastEventAt, detail: 'Timestamp is the last task event.' },
  ] : [], [sources])

  // Changes are comparisons of actual returned states, scoped explicitly to this visit.
  const states = useMemo(() => ({
    ...Object.fromEntries(services.map(s => [`Service · ${s.name}`, s.status])),
    ...Object.fromEntries((bots?.bots ?? []).map(b => [`Gateway · ${b.name}`, b.gateway.status])),
    ...Object.fromEntries(sourceRows.map(s => [`Source · ${s.name}`, s.state])),
    ...(board ? { Board: board.available ? 'available' : 'unavailable' } : {}),
  }), [services, bots, sourceRows, board])
  const previous = useRef<Record<string, string>>({})
  const [changes, setChanges] = useState<{ name: string; from: string; to: string; at: number }[]>([])
  useEffect(() => {
    const updates = Object.entries(states).flatMap(([name, to]) => {
      const from = previous.current[name]
      return from && from !== to ? [{ name, from, to, at: Date.now() }] : []
    })
    previous.current = { ...previous.current, ...states }
    if (updates.length) setChanges(current => [...updates, ...current].slice(0, 6))
  }, [states])

  const cpuNow = host?.sampling && finite(sample?.cpuPct) ? sample.cpuPct : null
  const memPct = memory ? memory.used / memory.total * 100 : null
  const load1 = finite(telemetry?.cpu?.load1) ? telemetry.cpu.load1 : finite(sample?.load1) ? sample.load1 : null
  const threads = host?.static.threads || telemetry?.cpu?.cores || sample?.cores.length || null
  const cpuHist = host?.sampling ? buckets(host.history.cpu, 30) : []
  const cpuPeak = cpuHist.length ? Math.max(...cpuHist) : null

  return <>
    <div className={styles.content} aria-live="polite" aria-relevant="text additions">
      <section className={`mc-widget ${styles.widget}`} aria-label="Machine vitals">
        <Head cmd="top" right={<><Freshness at={freshest} error={resources.host.error || error} now={now} /><Button variant="primary" loading={refreshing} onClick={() => void refresh()} aria-label="Refresh system data">Refresh</Button></>} />
        <p className={styles.ident} title={host?.static.cpuModel || undefined}>{host?.static.hostname || 'host unavailable'} · {host?.static.kernel || 'kernel not reported'}{host?.static.cpuModel ? ` · ${host.static.cpuModel}` : ''}</p>
        {error && <p className={styles.notice}>shared telemetry could not refresh: {error}. {data ? 'showing the last received summary.' : 'no summary available.'}</p>}
        <Notice resource={resources.host} label="rig telemetry" />
        <div className={styles.top}>
          <Meter k="cpu" value={cpuNow} label="CPU usage" right={<>{pct0(cpuNow)} <span className={styles.dim}>{deg(sample?.cpuTempC)}</span></>} />
          <span className={styles.k}>2m</span>
          {cpuHist.length > 1 ? <MiniHist values={cpuHist} days={cpuHist.length} label={`CPU usage over the last 2 minutes, peak ${pct0(cpuPeak)}`} /> : <span className={styles.na}>waiting for samples</span>}
          <span className={styles.v}>{cpuPeak != null ? <><Glyph g="up" />{pct0(cpuPeak)}</> : ''}</span>
          <span className={styles.k}>load</span>
          <span className={styles.wide}>{load1 != null ? load1.toFixed(2) : '—'}{telemetry?.cpu ? <span className={styles.dim}> {[telemetry.cpu.load5, telemetry.cpu.load15].map(n => finite(n) ? n.toFixed(2) : '—').join(' ')}</span> : null}</span>
          <span className={styles.v}>{threads ? `${threads} thr` : ''}</span>
          {gpus.map(gpu => <Meter key={gpu.index} k={gpuLabel(gpu.name, gpu.index)} value={finite(gpu.utilPct) ? gpu.utilPct : null} label={`GPU ${gpu.index} ${gpu.name} usage`}
            right={<>{pct0(gpu.utilPct)} <span className={styles.dim}>{deg(gpu.tempC)}</span></>} />)}
          {gpus.map(gpu => gpu.memTotalMb > 0 ? <Meter key={`vram-${gpu.index}`} k={`vram${gpus.length > 1 ? gpu.index : ''}`} value={gpu.memUsedMb / gpu.memTotalMb * 100} label={`GPU ${gpu.index} memory`}
            right={<>{pct0(gpu.memUsedMb / gpu.memTotalMb * 100)} <span className={styles.dim}>{size(gpu.memUsedMb * 1024 ** 2)}</span></>} /> : null)}
          <Meter k="mem" value={memPct} label="Memory usage" right={<>{pct0(memPct)} <span className={styles.dim}>{memory ? size(memory.used * 1024) : ''}</span></>} />
          {mounts.map(mount => {
            const p = mount.totalBytes > 0 ? mount.usedBytes / mount.totalBytes * 100 : null
            return <Meter key={mount.mount} k={mountLabel(mount.mount)} value={p} label={`Disk ${mount.mount}`} right={<>{pct0(p)} <span className={styles.dim}>{size(mount.usedBytes)}</span></>} />
          })}
          <span className={styles.k}>net</span>
          <span className={styles.wide}>{sample && host?.sampling ? <><Glyph g="down" />{rate(sample.netRxBps)} <Glyph g="up" />{rate(sample.netTxBps)}</> : '—'}</span>
          <span className={styles.v} />
          {sample?.cores.length ? <>
            <span className={styles.k}>thr</span>
            <Threads cores={sample.cores} />
            <span className={styles.v}>{sample.cores.filter(c => c >= 15).length}/{sample.cores.length}</span>
          </> : null}
        </div>
        <Divider label="pressure" />
        <Kv keyWidth="7ch">
          <KvRow k="swap" v={sample && sample.swapTotalKb > 0 ? size(sample.swapUsedKb * 1024) : 'none'} r={sample && sample.swapTotalKb > 0 ? pct0(sample.swapUsedKb / sample.swapTotalKb * 100) : ''} />
          <KvRow k="psi" v={`cpu ${pct0(sample?.psiCpu)}  mem ${pct0(sample?.psiMem)}  io ${pct0(sample?.psiIo)}`} r="" />
          <KvRow k="procs" v={finite(sample?.procsRunning) ? `${sample.procsRunning} running` : '—'} r={finite(sample?.ctxPerSec) ? `${Math.round(sample.ctxPerSec).toLocaleString()} ctx/s` : ''} />
        </Kv>
        <Prompt host="friday" foot meta={`up ${uptime(host?.uptimeSec)}`} />
      </section>

      <section className={`mc-widget ${styles.widget}`} aria-label="Thermals and fans">
        <Head cmd="sensors" right={<Freshness at={sample?.t ?? telemetry?.generatedAt} error={resources.host.error} now={now} />} />
        <Kv keyWidth="7ch">
          <KvRow k="cpu" v="package" r={deg(sample?.cpuTempC) || '—'} />
          <KvRow k="nvme" v="drive" r={deg(sample?.nvmeTempC) || '—'} />
          {gpus.map(gpu => {
            const fan = 'fanPct' in gpu ? gpu.fanPct : null
            const power = 'powerW' in gpu ? gpu.powerW : null
            return <KvRow key={gpu.index} k={gpuLabel(gpu.name, gpu.index)} v={`fan ${finite(fan) ? pct0(fan) : 'n/a'}${finite(power) ? `  ${Math.round(power)}W` : ''}`} r={deg(gpu.tempC) || '—'} />
          })}
        </Kv>
        <p className={styles.note}>cpu and chassis fan speeds are not exposed; gpu fans appear only when reported.</p>
      </section>

      <section className={`mc-widget ${styles.widget}`} aria-label="Services and files">
        <Head cmd="systemctl --user status" right={issues.length ? <span className={styles.fresh}><Glyph g="err" /> {issues.length} need attention</span> : <Freshness at={health?.generatedAt} error={resources.system.error} now={now} />} />
        <Notice resource={resources.system} label="service probe" />
        {health && stale(health.generatedAt, now) && <p className={styles.notice}>service observations are stale. these are last known states.</p>}
        {services.length ? services.map(service => <div key={service.id} className={styles.item}>
          <WRow g={glyphFor(service.status)} right={stateWord(service.status)} title={service.detail}>{service.name}</WRow>
          <span className={styles.sub}>{FILE_IDS.has(service.id) ? 'file' : 'probe'} · {service.detail}</span>
        </div>) : <p className={styles.note}>no service or file-health observations available.</p>}
        <Prompt host="friday" foot meta={`probed ${date(health?.generatedAt)}`} />
      </section>

      <section className={`mc-widget ${styles.widget}`} aria-label="Bots and gateways">
        <Head cmd="gateways" right={<Freshness at={bots?.generatedAt} error={resources.bots.error} now={now} />} />
        <Notice resource={resources.bots} label="gateways" />
        {bots?.bots.length ? [...bots.bots].sort((a, b) => Number(a.gateway.status === 'running') - Number(b.gateway.status === 'running')).map(bot => <div key={bot.name} className={styles.item}>
          <WRow g={glyphFor(bot.gateway.status)} right={stateWord(bot.gateway.status)} href="/chat" title={`Open ${bot.name} in chat`}>{bot.name}</WRow>
          <span className={styles.sub}>last active {date(bot.lastActiveAt)} · {bot.gateway.detail}</span>
        </div>) : <p className={styles.note}>no bot gateway observations available.</p>}
      </section>

      <section className={`mc-widget ${styles.widget}`} aria-label="Board and data health">
        <Head cmd="kanban --health" right={<Freshness at={board?.generatedAt} error={resources.board.error} now={now} />} />
        <Notice resource={resources.board} label="board" />
        {board ? <>
          <WRow g={glyphFor(board.available ? 'available' : 'unavailable')} right={board.available ? 'available' : 'unavailable'} href="/kanban">kanban board</WRow>
          {board.sources?.map(source => <WRow key={source.origin} g={glyphFor(source.available ? 'available' : 'unavailable')} right={source.available ? 'available' : 'unavailable'} title={source.origin}>{source.name}</WRow>)}
          {board.available ? <>
            <Divider label={`tasks ${Object.values(board.counts).reduce((sum, count) => sum + count, 0)}`} />
            <Kv keyWidth="12ch">{Object.entries(board.counts).map(([state, count]) => <KvRow key={state} k={state.replaceAll('_', ' ')} v="" r={count} />)}</Kv>
          </> : <p className={styles.note}>task counts unavailable while the board is unavailable.</p>}
          {board.sources?.some(source => !source.available) && <p className={styles.notice}>some boards are unavailable. counts cover only available boards.</p>}
        </> : <p className={styles.note}>board availability and task counts have not been received.</p>}
        <Divider label="sources" />
        {error && <p className={styles.notice}>source refresh failed: {error}. last known observations may be stale.</p>}
        {sourceRows.length ? sourceRows.map(source => <div key={source.id} className={styles.item}>
          <WRow g={glyphFor(source.state)} right={source.state}>{source.name.toLowerCase()}</WRow>
          <span className={styles.sub}>last update {date(source.at)}{source.detail ? ` · ${source.detail}` : ''}</span>
        </div>) : <p className={styles.note}>no source freshness observations available.</p>}
        {(() => {
          const state = !freshness?.lastLoggedAt || freshness.staleDays == null ? 'unknown' : freshness.staleDays > 3 ? 'stale' : 'ok'
          return <div className={styles.item}><WRow g={glyphFor(state)} right={state}>usage logs</WRow><span className={styles.sub}>last logged {date(freshness?.lastLoggedAt)} · stale after 3 days</span></div>
        })()}
        {Object.entries(data?.collectorErrors ?? {}).map(([name, message]) => <div key={name} className={styles.item}>
          <WRow g="fail" right="degraded">{name} collector</WRow>
          <span className={styles.sub}>{message} · last good {date(data?.lastGoodAt?.[name])}</span>
        </div>)}
        <Prompt host="friday" foot meta={<Freshness at={data?.generatedAt} error={error} now={now} />} />
      </section>

      <section className={`mc-widget ${styles.widget}`} aria-label="What changed">
        <Head cmd="journal -f" right={<span className={styles.fresh}>{eventStream === 'live' ? <><Glyph g="live" /> live</> : eventStream === 'connecting' ? <><Glyph g="retry" /> connecting</> : <><Glyph g="fail" /> disconnected</>}</span>} />
        {changes.length ? changes.map((change, index) => <div key={`${change.at}-${index}`} className={styles.item}>
          <WRow g={glyphFor(change.to)} right={new Date(change.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}>{change.name.toLowerCase()}</WRow>
          <span className={styles.sub}>{change.from} → {change.to}</span>
        </div>) : <p className={styles.note}>no status transitions observed yet. this view does not store a daily history.</p>}
      </section>
    </div>
  </>
}
