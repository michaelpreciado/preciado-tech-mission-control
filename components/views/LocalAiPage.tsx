'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, CardHead, Chip, Field, Row, Select, Stat, type ChipTone } from '@/components/ui'
import { apiFetch } from '@/lib/api-base'
import type { LocalAiSnapshot, ProbeResult, Recipe } from '@/lib/collectors/local-ai'
import { GATEWAY_PORT_FIRST, GATEWAY_PORT_LAST } from '@/lib/local-ai-constants'
import sys from '@/components/system.module.css'
import styles from '@/components/local-ai.module.css'

const POLL_MS = 15_000
const STALE_MS = 60_000
const RECIPE_PAGE = 40

const mem = (mib: number) => mib < 1024 ? `${mib} MiB` : `${(mib / 1024).toFixed(1)} GiB`
const gib = (mib: number) => `${(mib / 1024).toFixed(1)} GiB`
const sizeGb = (n: number | null) => n == null ? 'size not listed' : `${n.toFixed(1)} GB`

function probeTone(p: ProbeResult<unknown>): ChipTone { return p.state === 'ok' ? 'ok' : p.state === 'empty' ? 'warn' : 'bad' }
function probeLabel(p: ProbeResult<unknown>) { return p.state === 'ok' ? 'Read' : p.state === 'empty' ? 'Empty' : 'Unavailable' }

/** Names the source and the reason whenever a probe is not a clean read. */
function Provenance({ probe }: { probe: ProbeResult<unknown> }) {
  return <>
    {probe.reason && <p className={sys.notice}>{probe.state === 'unavailable' ? 'Could not read' : 'Read, but empty'}: {probe.reason}.</p>}
    <p className={sys.note}>Source <code className={styles.source}>{probe.source}</code></p>
  </>
}

const PROXY_FIELDS: [string, string][] = [
  ['phase', 'Phase'], ['resident', 'Resident model'], ['target', 'Target model'], ['owned', 'Proxy owns residency'],
  ['recovery_required', 'Recovery required'], ['last_error', 'Last error'], ['rollback_error', 'Rollback error'],
]
const show = (v: unknown) => v === null || v === undefined ? 'none' : typeof v === 'object' ? JSON.stringify(v) : String(v)

export default function LocalAiPage() {
  const [snap, setSnap] = useState<LocalAiSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(0)
  const [hardware, setHardware] = useState('machine')
  const [expanded, setExpanded] = useState(false)
  const inflight = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (inflight.current) return
    const ctl = new AbortController()
    inflight.current = ctl
    setRefreshing(true)
    try {
      const res = await apiFetch('/api/local-ai', { signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(20_000)]) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as LocalAiSnapshot
      if (!json?.catalog || !json.gpu || !json.engines || !json.ports || !json.proxy) throw new Error('Unexpected response')
      if (!ctl.signal.aborted) { setSnap(json); setError(null) }
    } catch (e) {
      if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : 'Unavailable')
    } finally {
      if (inflight.current === ctl) { inflight.current = null; if (!ctl.signal.aborted) { setRefreshing(false); setNow(Date.now()) } }
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { setNow(Date.now()); if (!document.hidden) void refresh() }, POLL_MS)
    const onVisible = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); inflight.current?.abort(); inflight.current = null }
  }, [refresh])

  const catalog = snap?.catalog.data
  const machineGroups = catalog?.groups.filter(g => g.thisMachine) ?? []
  // "This machine" only means something if a GPU was read AND a group matched it; otherwise fall back to all.
  const effectiveHardware = hardware === 'machine' && !machineGroups.length ? 'all' : hardware
  // One filtered array feeds both the headline count and the rendered list.
  const recipes: Recipe[] = useMemo(() => {
    if (!catalog) return []
    if (effectiveHardware === 'all') return catalog.recipes
    const keys = effectiveHardware === 'machine' ? new Set(machineGroups.map(g => g.key)) : new Set([effectiveHardware])
    return catalog.recipes.filter(r => keys.has(r.hardware))
  }, [catalog, effectiveHardware, machineGroups])
  const shown = expanded ? recipes : recipes.slice(0, RECIPE_PAGE)

  const activePorts = snap?.ports.data.filter(p => p.inUse) ?? []
  const engines = snap?.engines.data ?? []
  const cards = snap?.gpu.data.cards ?? []
  const apps = snap?.gpu.data.apps ?? []
  const proxy = snap?.proxy
  const proxyBody = proxy?.data?.body ?? null
  const stale = !snap || now - Date.parse(snap.generatedAt) > STALE_MS

  const proxyValue = !proxy ? '—' : proxy.state === 'unavailable' ? 'Unreachable' : proxy.state === 'empty' ? 'No state' : proxyBody?.resident ? 'Model resident' : 'No model resident'
  const proxyTone: ChipTone = !proxy || proxy.state !== 'ok' ? 'warn' : 'neutral'

  if (!snap) return <Card as="section" pad="md" role="status" aria-live="polite">{error ? `Local AI snapshot unavailable: ${error}. Nothing has been read.` : 'Reading the stack…'}</Card>

  return <div className={sys.content} aria-live="polite" aria-relevant="text additions">
    <Card as="section">
      <CardHead title="Stack at a glance" sub="Every number below is counted from the list under it."
        right={<><Chip tone={error || stale ? 'warn' : 'ok'}>{error ? 'Refresh failed' : stale ? 'Stale' : 'Fresh'}</Chip>
          <Button variant="primary" loading={refreshing} onClick={() => void refresh()} aria-label="Refresh local AI data">Refresh</Button></>} />
      {error && <p className={sys.notice}>Refresh failed: {error}. Showing the last snapshot from {new Date(snap.generatedAt).toLocaleTimeString()}.</p>}
      <div className={sys.stats}>
        <Stat label="Engines running" value={snap.engines.state === 'unavailable' ? 'Unavailable' : engines.length} sub={snap.engines.state === 'unavailable' ? 'docker could not be read' : 'Containers labelled io.omarchy.local-ai'} tone={snap.engines.state === 'unavailable' ? 'warn' : 'neutral'} />
        <Stat label="Gateway ports in use" value={snap.ports.state === 'unavailable' ? 'Unavailable' : `${activePorts.length} / ${snap.ports.data.length}`} sub={`${GATEWAY_PORT_FIRST}–${GATEWAY_PORT_LAST}`} />
        <Stat label="GPUs read" value={snap.gpu.state === 'unavailable' ? 'Unavailable' : cards.length} sub={snap.gpu.state === 'unavailable' ? 'nvidia-smi failed' : `${apps.length} process${apps.length === 1 ? '' : 'es'} holding VRAM`} />
        <Stat label="Residency proxy · 8932" value={proxyValue} tone={proxyTone} sub={proxy?.state === 'ok' ? 'Reported by /status' : proxy?.reason ?? ''} />
        <Stat label="Recipes in catalog" value={snap.catalog.state === 'unavailable' ? 'Unavailable' : catalog?.recipes.length ?? 0} sub={catalog?.hardwareGroups ? `${catalog.hardwareGroups} hardware groups` : undefined} />
      </div>
    </Card>

    <Card as="section">
      <CardHead title="GPU residency" sub="Memory per card, then every process nvidia-smi reports holding VRAM." right={<Chip tone={probeTone(snap.gpu)}>{probeLabel(snap.gpu)}</Chip>} />
      <Provenance probe={snap.gpu} />
      {cards.length > 0 && <div className={sys.stats}>
        {cards.map(c => <Stat key={c.index} label={`GPU ${c.index} · ${c.name}`} value={`${c.totalMiB > 0 ? (c.usedMiB / c.totalMiB * 100).toFixed(0) : '—'}%`}
          sub={<><span className={styles.meta}>{gib(c.usedMiB)} / {gib(c.totalMiB)} VRAM</span><span className={styles.bar} aria-hidden="true"><span style={{ width: `${Math.min(100, c.totalMiB > 0 ? c.usedMiB / c.totalMiB * 100 : 0)}%` }} /></span></>} />)}
      </div>}
      {snap.gpu.state === 'ok' && (apps.length
        ? apps.map(a => <Row key={`${a.pid}-${a.usedMiB}-${a.process}`} className={sys.row} title={a.process || `pid ${a.pid}`} sub={<span className={sys.line}>pid {a.pid}</span>} trailing={<Chip>{mem(a.usedMiB)}</Chip>} />)
        : <p className={sys.note}>nvidia-smi reports no processes holding VRAM.</p>)}
      {snap.gpu.state === 'ok' && <p className={sys.note}>The compute-apps query does not say which card a process is on, so processes are listed separately from cards.</p>}
    </Card>

    <Card as="section">
      <CardHead title="Residency proxy" sub="The guarded proxy in front of Strata and EXL3. Up is not the same as loaded." right={<Chip tone={probeTone(snap.proxy)}>{probeLabel(snap.proxy)}</Chip>} />
      <Provenance probe={snap.proxy} />
      {proxyBody && (() => {
        const known = PROXY_FIELDS.filter(([k]) => k in proxyBody)
        const extra = Object.keys(proxyBody).filter(k => !PROXY_FIELDS.some(([f]) => f === k) && k !== 'history' && typeof proxyBody[k] !== 'object')
        return <>
          {!proxyBody.resident && <p className={sys.note}>/status answered, but no model is resident. Nothing is loaded.</p>}
          {[...known.map(([k, label]) => [k, label] as const), ...extra.map(k => [k, k] as const)].map(([k, label]) =>
            <Row key={k} className={sys.row} title={label} trailing={<Chip tone={(k === 'last_error' || k === 'rollback_error') && proxyBody[k] ? 'bad' : k === 'recovery_required' && proxyBody[k] ? 'bad' : 'neutral'}>{show(proxyBody[k])}</Chip>} />)}
        </>
      })()}
      {proxy?.data && !proxyBody && proxy.data.raw && <p className={sys.note}>Unparsed response: {proxy.data.raw}</p>}
    </Card>

    <Card as="section">
      <CardHead title="Running engines" sub="Containers carrying the local-ai label." right={<Chip tone={probeTone(snap.engines)}>{snap.engines.state === 'empty' ? 'None running' : probeLabel(snap.engines)}</Chip>} />
      <Provenance probe={snap.engines} />
      {engines.map(e => <Row key={e.name} className={sys.row} title={e.name} sub={<><span className={sys.line}>{e.image}</span><span className={sys.line}>{e.status}</span></>} trailing={<Chip tone="info">{e.role}</Chip>} />)}
    </Card>

    <Card as="section">
      <CardHead title="Gateway ports" sub={`${GATEWAY_PORT_FIRST}–${GATEWAY_PORT_LAST} are reserved for Local AI gateways.`}
        right={<Chip tone={snap.ports.state === 'ok' ? 'neutral' : 'bad'}>{snap.ports.state === 'ok' ? `${activePorts.length} in use` : 'Unavailable'}</Chip>} />
      <Provenance probe={snap.ports} />
      {snap.ports.state === 'ok' && (activePorts.length
        ? activePorts.map(p => <Row key={p.port} className={sys.row} title={`127.0.0.1:${p.port}`} sub={<span className={sys.line}>listening</span>} trailing={<Chip tone="ok">In use</Chip>} />)
        : <p className={sys.note}>None of the {snap.ports.data.length} ports is listening.</p>)}
    </Card>

    <Card as="section">
      <CardHead title="Recipe catalog" sub={catalog?.path ? `Read from ${catalog.path}` : 'No catalog read'} right={<Chip tone={probeTone(snap.catalog)}>{probeLabel(snap.catalog)}</Chip>} />
      <Provenance probe={snap.catalog} />
      {catalog && <p className={sys.note}>Shape: {catalog.shape} · schema {catalog.schemaVersion ?? 'not stated'} · registry {catalog.registryCommit?.slice(0, 12) ?? 'not stated'}{catalog.arrayGroups ? ` · ${catalog.arrayGroups} groups held a bare array` : ''}{catalog.alternates.map(a => ` · other copy ${a.path} holds ${a.recipeCount ?? 'unreadable'} recipes`).join('')}</p>}
      {catalog && catalog.recipes.length > 0 && <>
        <div className={styles.controls}>
          <Field label="Hardware">
            <Select value={effectiveHardware} onChange={e => { setHardware(e.target.value); setExpanded(false) }}>
              {machineGroups.length > 0 && <option value="machine">This machine (matched by GPU name and VRAM)</option>}
              <option value="all">All hardware</option>
              {catalog.groups.map(g => <option key={g.key} value={g.key}>{g.name || g.key} · {g.recipeCount}</option>)}
            </Select>
          </Field>
          <Chip tone="accent">{recipes.length} recipe{recipes.length === 1 ? '' : 's'}</Chip>
        </div>
        {hardware === 'machine' && !machineGroups.length && <p className={sys.notice}>No GPU read from nvidia-smi matched a catalog group, so all hardware is shown.</p>}
        {shown.map(r => <Row key={`${r.hardware}/${r.id}`} className={sys.row} title={r.name}
          sub={<><span className={sys.line}>{r.id}</span><span className={sys.line}>{[r.family, r.engine, r.format].filter(Boolean).join(' · ')}</span></>}
          trailing={<Chip>{sizeGb(r.sizeGb)} · {r.cards ?? '?'} card{r.cards === 1 ? '' : 's'}{r.minDriver ? ` · driver ${r.minDriver}+` : ''}</Chip>} />)}
        {recipes.length > shown.length && <div className={styles.more}><Button variant="ghost" onClick={() => setExpanded(true)}>Show all {recipes.length} (showing {shown.length})</Button></div>}
      </>}
    </Card>
  </div>
}
