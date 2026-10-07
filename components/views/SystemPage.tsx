'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveData } from '@/components/LiveDataProvider'
import { Button, Card, CardHead, Chip, Row, Stat, type ChipTone } from '@/components/ui'
import { apiFetch } from '@/lib/api-base'
import type { HostMetrics } from '@/lib/host-metrics'
import type { BotsSnapshot } from '@/lib/collectors/bots'
import type { KanbanMultiSnapshot, SystemHealthData } from '@/lib/types'
import styles from '@/components/system.module.css'

const POLL_MS = 30_000
const STALE_MS = 120_000
const FILE_IDS = new Set(['kanban-db', 'pipeline-store', 'cron-jobs'])
type Resource<T> = { data: T | null; error: string | null }
type Resources = {
  host: Resource<HostMetrics>
  system: Resource<SystemHealthData>
  bots: Resource<BotsSnapshot>
  board: Resource<KanbanMultiSnapshot>
}
const empty = { data: null, error: null }
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const pct = (n: unknown) => finite(n) ? `${n.toFixed(1)}%` : 'Unavailable'
const temp = (n: unknown) => finite(n) ? `${n.toFixed(0)}°C` : 'Unavailable'
const gib = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GiB`
const capacity = (used: unknown, total: unknown, multiplier = 1) => finite(used) && finite(total) && total > 0
  ? `${gib(used * multiplier)} / ${gib(total * multiplier)}` : 'Used / total unavailable'
const series = (values?: number[]) => values && values.length > 1 && values.every(finite) ? values : undefined
function timestamp(value?: string | number | null) {
  const ms = typeof value === 'number' ? value : value ? Date.parse(value) : NaN
  return Number.isFinite(ms) ? ms : null
}
function date(value?: string | number | null) {
  const ms = timestamp(value)
  return ms === null ? 'Not reported' : new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
}
function stale(value: string | number | null | undefined, now: number) {
  const ms = timestamp(value)
  return ms === null || now - ms > STALE_MS
}
function uptime(seconds?: number | null) {
  if (!finite(seconds)) return 'Not reported'
  const minutes = Math.floor(seconds / 60)
  return `${Math.floor(minutes / 1440)}d ${Math.floor(minutes / 60) % 24}h ${minutes % 60}m`
}
function tone(state: string): ChipTone {
  if (['up', 'running', 'ok', 'available'].includes(state)) return 'ok'
  if (['down', 'auth-fail', 'failed'].includes(state)) return 'bad'
  if (['warn', 'degraded', 'stale', 'stopped', 'unavailable', 'missing'].includes(state)) return 'warn'
  return 'neutral'
}
function Status({ state }: { state: string }) {
  return <Chip tone={tone(state)}>{state === 'up' ? 'Up' : state === 'warn' ? 'Needs attention' : state === 'auth-fail' ? 'Auth failed' : state.charAt(0).toUpperCase() + state.slice(1)}</Chip>
}
function Freshness({ at, error, now }: { at?: string | number | null; error?: string | null; now: number }) {
  return <Chip tone={error || stale(at, now) ? 'warn' : 'ok'}>{error ? 'Refresh failed' : !timestamp(at) ? 'No timestamp' : stale(at, now) ? 'Stale' : 'Fresh'}</Chip>
}
function Notice({ resource, label }: { resource: Resource<unknown>; label: string }) {
  return resource.error ? <p className={styles.notice}>{label}: {resource.error}.{resource.data ? ' Showing the last received data.' : ' No data available.'}</p> : null
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
    const rank = (status: string) => tone(status) === 'bad' ? 0 : status === 'up' ? 2 : 1
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

  return <>
    <div className={styles.content} aria-live="polite" aria-relevant="text additions">
      <Card as="section">
        <CardHead title={host?.static.hostname || 'Machine identity unavailable'} sub={host?.static.cpuModel || 'Processor model not reported'}
          right={<><Freshness at={freshest} error={resources.host.error || error} now={now} /><Button variant="primary" loading={refreshing} onClick={() => void refresh()} aria-label="Refresh system data">Refresh</Button></>} />
        <dl className={styles.identity}>
          <div><dt>Kernel</dt><dd>{host?.static.kernel || 'Not reported'}</dd></div>
          <div><dt>OS distribution</dt><dd>Not exposed</dd></div>
          <div><dt>Uptime</dt><dd>{uptime(host?.uptimeSec)}</dd></div>
          <div><dt>Load average · 1 / 5 / 15 min</dt><dd>{telemetry?.cpu ? [telemetry.cpu.load1, telemetry.cpu.load5, telemetry.cpu.load15].map(n => finite(n) ? n.toFixed(2) : '—').join(' / ') : finite(sample?.load1) ? `${sample.load1.toFixed(2)} / — / —` : 'Not reported'}</dd></div>
          <div><dt>Freshest hardware sample</dt><dd>{date(freshest)}</dd></div>
          <div><dt>Live updates</dt><dd>{eventStream === 'live' ? 'Connected' : eventStream === 'connecting' ? 'Connecting' : 'Disconnected'} · polls every 30s</dd></div>
        </dl>
        <Notice resource={resources.host} label="Rig telemetry" />
        <p className={styles.note}>Rig sampled {date(sample?.t)} · Summary sampled {date(telemetry?.generatedAt)}. Samples older than 2 minutes are marked stale.</p>
      </Card>

      <Card as="section">
        <CardHead title="Vitals" sub="Sparklines show the sampler’s available history, up to 2 minutes."
          right={<Freshness at={sample?.t ?? telemetry?.generatedAt} error={resources.host.error || error} now={now} />} />
        {error && <p className={styles.notice}>Shared telemetry could not refresh: {error}. {data ? 'Showing the last received summary.' : 'No summary available.'}</p>}
        <div className={styles.stats}>
          <Stat label="CPU usage" value={host?.sampling ? pct(sample?.cpuPct) : 'Unavailable'} sub={host?.sampling ? 'Across all logical cores' : 'Waiting for a measured CPU sample'} series={host?.sampling ? series(host.history.cpu) : undefined} />
          <Stat label="Memory" value={memory ? pct(memory.used / memory.total * 100) : 'Unavailable'} sub={memory ? capacity(memory.used, memory.total, 1024) : 'Memory usage not reported'} series={sample && sample.memTotalKb > 0 ? series(host?.history.mem) : undefined} />
          {gpus.length ? gpus.map((gpu, index) => <Stat key={gpu.index} label={`GPU ${gpu.index} · ${gpu.name}`} value={pct(gpu.utilPct)}
            sub={<><span className={styles.line}>VRAM {capacity(gpu.memUsedMb, gpu.memTotalMb, 1024 ** 2)}</span><span className={styles.line}>{temp(gpu.tempC)}</span></>}
            series={sample?.gpus.length ? series(host?.history.gpu[index]) : undefined} />) : <Stat label="GPU" value="Unavailable" sub="No GPU metrics reported" />}
          {mounts.length ? mounts.map(mount => <Stat key={mount.mount} label={`Disk · ${mount.mount}`} value={mount.totalBytes > 0 ? pct(mount.usedBytes / mount.totalBytes * 100) : 'Unavailable'} sub={capacity(mount.usedBytes, mount.totalBytes)} />) : <Stat label="Disk" value="Unavailable" sub="No mount usage reported" />}
        </div>
        {sample?.cores.length ? <details className={styles.details}><summary>Per-core CPU · {sample.cores.length} logical cores</summary><div className={styles.cores}>{sample.cores.map((value, index) => <Stat key={index} label={`Core ${index}`} value={pct(value)} />)}</div></details> : <p className={styles.note}>Per-core CPU usage is not available.</p>}
      </Card>

      <Card as="section">
        <CardHead title="Thermals and fans" right={<Freshness at={sample?.t ?? telemetry?.generatedAt} error={resources.host.error} now={now} />} />
        <div className={styles.stats}>
          <Stat label="CPU package" value={temp(sample?.cpuTempC)} />
          <Stat label="NVMe" value={temp(sample?.nvmeTempC)} />
          {gpus.map(gpu => <Stat key={gpu.index} label={`GPU ${gpu.index}`} value={temp(gpu.tempC)} sub={`Fan ${'fanPct' in gpu ? pct(gpu.fanPct) : 'not reported'}`} />)}
        </div>
        <p className={styles.note}>CPU and chassis fan speeds are not exposed. GPU fan readings appear only when reported.</p>
      </Card>

      <Card as="section">
        <CardHead title="Services and files" sub={`Probe updated ${date(health?.generatedAt)}`} right={issues.length ? <Chip tone="bad">{issues.length} need attention</Chip> : <Freshness at={health?.generatedAt} error={resources.system.error} now={now} />} />
        <Notice resource={resources.system} label="Service probe" />
        {health && stale(health.generatedAt, now) && <p className={styles.notice}>Service observations are stale. These are last known states.</p>}
        {services.length ? services.map(service => <Row key={service.id} className={`${styles.row} ${service.status !== 'up' ? styles.attention : ''}`}
          title={service.name} sub={<span className={styles.line}>{FILE_IDS.has(service.id) ? 'File freshness' : 'Service probe'} · {service.detail}</span>} trailing={<Status state={service.status} />} />) : <p className={styles.note}>No service or file-health observations available.</p>}
        <p className={styles.note}>These are the app’s tracked probes. Systemd user-unit states are not exposed.</p>
      </Card>

      <Card as="section">
        <CardHead title="Bots and gateways" sub={`Checked ${date(bots?.generatedAt)} · Open a row to go to Chat.`} right={<Freshness at={bots?.generatedAt} error={resources.bots.error} now={now} />} />
        <Notice resource={resources.bots} label="Gateways" />
        {bots?.bots.length ? [...bots.bots].sort((a, b) => Number(a.gateway.status === 'running') - Number(b.gateway.status === 'running')).map(bot => <Row key={bot.name} className={styles.row} href="/chat" title={bot.name}
          sub={<><span className={styles.line}>Last activity {date(bot.lastActiveAt)}</span><span className={styles.line}>{bot.gateway.detail}</span></>} trailing={<Status state={bot.gateway.status} />} />) : <p className={styles.note}>No bot gateway observations available.</p>}
      </Card>

      <Card as="section">
        <CardHead title="Board and data health" sub={`Board checked ${date(board?.generatedAt)}`} right={<Freshness at={board?.generatedAt} error={resources.board.error} now={now} />} />
        <Notice resource={resources.board} label="Board" />
        {board ? <>
          <Row className={styles.row} href="/kanban" title="Kanban board" sub={<span className={styles.line}>Open board</span>} trailing={<Status state={board.available ? 'available' : 'unavailable'} />} />
          {board.sources?.map(source => <Row key={source.origin} className={styles.row} title={source.name} sub={<span className={styles.line}>{source.origin}</span>} trailing={<Status state={source.available ? 'available' : 'unavailable'} />} />)}
          {board.available ? <div className={styles.stats}>
            <Stat label="Total tasks" value={Object.values(board.counts).reduce((sum, count) => sum + count, 0)} sub="Across available boards" />
            {Object.entries(board.counts).map(([state, count]) => <Stat key={state} label={state.replaceAll('_', ' ')} value={count} />)}
          </div> : <p className={styles.note}>Task counts unavailable while the board is unavailable.</p>}
          {board.sources?.some(source => !source.available) && <p className={styles.notice}>Some boards are unavailable. Counts cover only available boards.</p>}
        </> : <p className={styles.note}>Board availability and task counts have not been received.</p>}
        <div className={styles.subhead}><h3>Source freshness</h3><Freshness at={data?.generatedAt} error={error} now={now} /></div>
        <p className={styles.note}>Summary checked {date(data?.generatedAt)}. Source states reflect their own availability and freshness checks.</p>
        {error && <p className={styles.notice}>Source refresh failed: {error}. Last known observations may be stale.</p>}
        {sourceRows.length ? sourceRows.map(source => <Row key={source.id} className={styles.row} title={source.name} sub={<span className={styles.line}>Last update {date(source.at)}{source.detail ? ` · ${source.detail}` : ''}</span>} trailing={<Status state={source.state} />} />) : <p className={styles.note}>No source freshness observations available.</p>}
        <Row className={styles.row} title="Usage logs" sub={<span className={styles.line}>Last logged {date(freshness?.lastLoggedAt)} · Stale after 3 days</span>} trailing={<Status state={!freshness?.lastLoggedAt || freshness.staleDays == null ? 'unknown' : freshness.staleDays > 3 ? 'stale' : 'ok'} />} />
        {Object.entries(data?.collectorErrors ?? {}).map(([name, message]) => <Row key={name} className={`${styles.row} ${styles.attention}`} title={`${name} collector`} sub={<span className={styles.line}>{message} · Last good {date(data?.lastGoodAt?.[name])}</span>} trailing={<Status state="degraded" />} />)}
      </Card>

      <Card as="section">
        <CardHead title="What changed" sub="Service, gateway, and data status changes observed while this page is open." />
        {changes.length ? changes.map((change, index) => <Row key={`${change.at}-${index}`} className={styles.row} title={change.name} sub={<span className={styles.line}>{change.from} → {change.to} · {date(change.at)}</span>} trailing={<Status state={change.to} />} />) : <p className={styles.note}>No status transitions observed yet. This view does not store a daily history.</p>}
      </Card>
    </div>
  </>
}
