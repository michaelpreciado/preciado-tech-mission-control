'use client'

import { useMemo, useState } from 'react'
import { Button, Divider, Field, Glyph, Kv, KvRow, Prompt, Select, WRow } from '@/components/ui'
import { SegBar } from '@/components/charts/SegBar'
import { useLiveData } from '@/components/LiveDataProvider'
import type { ProbeResult, Recipe } from '@/lib/collectors/local-ai'
import { GATEWAY_PORT_FIRST, GATEWAY_PORT_LAST } from '@/lib/local-ai-constants'
import { LocalAiTop, useLocalAi } from './LocalAiTop'
import sys from '@/components/system.module.css'
import styles from '@/components/local-ai.module.css'

const POLL_MS = 15_000
const STALE_MS = 60_000
const RECIPE_PAGE = 40

const mem = (mib: number) => mib < 1024 ? `${mib}M` : `${(mib / 1024).toFixed(1)}G`
const sizeGb = (n: number | null) => n == null ? '—' : `${n.toFixed(1)}G`

/** `> read` / `· empty` / `× unavailable` for a probe, as the widget head's right slot. */
function ProbeState({ probe, empty = 'empty' }: { probe: ProbeResult<unknown>; empty?: string }) {
  return <span className={sys.fresh}>
    {probe.state === 'ok' ? <><Glyph g="ok" /> read</> : probe.state === 'empty' ? <><Glyph g="idle" /> {empty}</> : <><Glyph g="fail" /> unavailable</>}
  </span>
}

/** Names the source and the reason whenever a probe is not a clean read. */
function Provenance({ probe }: { probe: ProbeResult<unknown> }) {
  return <>
    {probe.reason && <p className={sys.notice}>{probe.state === 'unavailable' ? 'could not read' : 'read, but empty'}: {probe.reason}.</p>}
    <p className={styles.source}>src {probe.source}</p>
  </>
}

const PROXY_FIELDS: [string, string][] = [
  ['phase', 'phase'], ['resident', 'resident'], ['target', 'target'], ['owned', 'owned'],
  ['recovery_required', 'recovery'], ['last_error', 'last err'], ['rollback_error', 'rollbk err'],
]
/** One-line value for a key/value row; objects are summarised, never dumped as JSON. */
function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'none'
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`
  if (typeof v === 'object') return Object.keys(v).join(', ') || 'empty'
  return String(v)
}

export default function LocalAiPage() {
  const state = useLocalAi(POLL_MS)
  const { snap, error, refreshing, refresh, now } = state
  const lc = useLiveData().data?.costs?.localCompute
  const [hardware, setHardware] = useState('machine')
  const [expanded, setExpanded] = useState(false)

  const catalog = snap?.catalog.data
  const machineGroups = useMemo(() => catalog?.groups.filter(g => g.thisMachine) ?? [], [catalog])
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
  const proxyBody = snap?.proxy.data?.body ?? null
  const stale = !snap || now - Date.parse(snap.generatedAt) > STALE_MS

  if (!snap) return <section className="mc-widget" role="status" aria-live="polite">
    <Prompt host="desk" cmd="localai top" />
    {error ? <WRow g="fail">snapshot unavailable: {error}. nothing has been read.</WRow> : <WRow g="retry" dim>reading the stack…</WRow>}
  </section>

  return <div className={sys.content} aria-live="polite" aria-relevant="text additions">
    <div className={styles.stack}>
      <LocalAiTop lc={lc} state={state} />
      <div className={styles.controlsRow}>
        <span className={sys.fresh}>{error ? <><Glyph g="fail" /> refresh failed</> : stale ? <><Glyph g="fail" /> stale</> : <><Glyph g="ok" /> fresh</>}</span>
        <Button variant="primary" loading={refreshing} onClick={() => void refresh()} aria-label="Refresh local AI data">Refresh</Button>
      </div>
      {error && <p className={sys.notice}>refresh failed: {error}. showing the snapshot from {new Date(snap.generatedAt).toLocaleTimeString()}.</p>}
    </div>

    <section className={`mc-widget ${sys.widget}`} aria-label="GPU residency">
      <header className={sys.head}><Prompt as="h2" host="desk" cmd="nvidia-smi" /><div className={sys.headRight}><ProbeState probe={snap.gpu} /></div></header>
      {cards.length > 0 && <div className={sys.top}>
        {cards.map(c => {
          const p = c.totalMiB > 0 ? c.usedMiB / c.totalMiB * 100 : null
          return <div key={c.index} className={styles.row}>
            <span className={sys.k} title={c.name}>{c.name.match(/\b(\d{4})\b/)?.[1] ?? `gpu${c.index}`}</span>
            {p == null ? <span className={sys.na}>—</span> : <SegBar value={p} autoTone label={`GPU ${c.index} ${c.name} VRAM`} />}
            <span className={sys.v}>{p == null ? '—' : `${Math.round(p)}%`} <span className={sys.dim}>{mem(c.usedMiB)}/{mem(c.totalMiB)}</span></span>
          </div>
        })}
      </div>}
      {snap.gpu.state === 'ok' && <>
        <Divider label={`vram procs ${apps.length}`} />
        {apps.length
          ? apps.map(a => <WRow key={`${a.pid}-${a.usedMiB}-${a.process}`} g="run" right={mem(a.usedMiB)} title={`pid ${a.pid}`}>{a.process || `pid ${a.pid}`} <span className={sys.dim}>{a.pid}</span></WRow>)
          : <WRow g="idle" dim>no processes holding vram</WRow>}
        <p className={sys.note}>compute-apps does not say which card a process is on, so processes are listed apart from cards.</p>
      </>}
      <Provenance probe={snap.gpu} />
    </section>

    <section className={`mc-widget ${sys.widget}`} aria-label="Residency proxy">
      <header className={sys.head}><Prompt as="h2" host="desk" cmd="curl :8932/status" /><div className={sys.headRight}><ProbeState probe={snap.proxy} empty="no state" /></div></header>
      {proxyBody && (() => {
        const known = PROXY_FIELDS.filter(([k]) => k in proxyBody)
        const extra = Object.keys(proxyBody).filter(k => !PROXY_FIELDS.some(([f]) => f === k) && k !== 'history' && typeof proxyBody[k] !== 'object')
        const bad = (k: string) => (k === 'last_error' || k === 'rollback_error' || k === 'recovery_required') && !!proxyBody[k]
        return <>
          {!proxyBody.resident && <WRow g="idle" dim>/status answered, but no model is resident</WRow>}
          <Kv keyWidth="10ch">
            {[...known, ...extra.map(k => [k, k] as [string, string])].map(([k, label]) =>
              <KvRow key={k} k={label} v={<span className={bad(k) ? styles.bad : undefined} title={show(proxyBody[k])}>{show(proxyBody[k])}</span>} r="" />)}
          </Kv>
        </>
      })()}
      {snap.proxy.data && !proxyBody && snap.proxy.data.raw && <p className={sys.note}>unparsed response: {snap.proxy.data.raw}</p>}
      <p className={sys.note}>the guarded proxy in front of strata and exl3. up is not the same as loaded.</p>
      <Provenance probe={snap.proxy} />
    </section>

    <section className={`mc-widget ${sys.widget}`} aria-label="Engines and gateway ports">
      <header className={sys.head}><Prompt as="h2" host="desk" cmd="localai ps" /><div className={sys.headRight}><ProbeState probe={snap.engines} empty="none running" /></div></header>
      <Divider label={`engines ${engines.length}`} />
      {engines.length
        ? engines.map(e => <div key={e.name} className={sys.item}>
          <WRow g={/^up\b/i.test(e.status) ? 'run' : 'fail'} right={e.role}>{e.name}</WRow>
          <span className={sys.sub}>{e.status.toLowerCase()} · {e.image}</span>
        </div>)
        : <WRow g="idle" dim>no containers carry the local-ai label</WRow>}
      <Provenance probe={snap.engines} />
      <Divider label={`ports ${snap.ports.state === 'ok' ? `${activePorts.length}/${snap.ports.data.length}` : '—'}`} />
      {snap.ports.state === 'ok' && (activePorts.length
        ? activePorts.map(p => <WRow key={p.port} g="ok" right="listening">127.0.0.1:{p.port}</WRow>)
        : <WRow g="idle" dim>none of {GATEWAY_PORT_FIRST}–{GATEWAY_PORT_LAST} is listening</WRow>)}
      <Provenance probe={snap.ports} />
    </section>

    <section className={`mc-widget ${sys.widget}`} aria-label="Recipe catalog">
      <header className={sys.head}><Prompt as="h2" host="desk" cmd="localai recipes" /><div className={sys.headRight}><ProbeState probe={snap.catalog} /></div></header>
      {catalog && <Kv keyWidth="8ch">
        <KvRow k="path" v={<span title={catalog.path ?? undefined}>{catalog.path ?? 'none'}</span>} r="" />
        <KvRow k="shape" v={catalog.shape ?? '—'} r={`schema ${catalog.schemaVersion ?? '—'}`} />
        <KvRow k="registry" v={catalog.registryCommit?.slice(0, 12) ?? 'not stated'} r={`${catalog.hardwareGroups} groups`} />
        {catalog.alternates.map(a => <KvRow key={a.path} k="copy" v={<span title={a.path}>{a.path}</span>} r={`${a.recipeCount ?? '?'} recipes`} />)}
      </Kv>}
      <Provenance probe={snap.catalog} />
      {catalog && catalog.recipes.length > 0 && <>
        <div className={styles.controls}>
          <Field label="Hardware">
            <Select value={effectiveHardware} onChange={e => { setHardware(e.target.value); setExpanded(false) }}>
              {machineGroups.length > 0 && <option value="machine">This machine (matched by GPU name and VRAM)</option>}
              <option value="all">All hardware</option>
              {catalog.groups.map(g => <option key={g.key} value={g.key}>{g.name || g.key} · {g.recipeCount}</option>)}
            </Select>
          </Field>
        </div>
        {hardware === 'machine' && !machineGroups.length && <p className={sys.notice}>no gpu read from nvidia-smi matched a catalog group, so all hardware is shown.</p>}
        <Divider label={`recipes ${recipes.length}`} />
        {shown.map(r => <div key={`${r.hardware}/${r.id}`} className={sys.item}>
          <WRow g="idle" right={`${sizeGb(r.sizeGb)} · ${r.cards ?? '?'}c`} title={r.id}>{r.name}</WRow>
          <span className={sys.sub}>{[r.family, r.engine, r.format, r.minDriver ? `driver ${r.minDriver}+` : ''].filter(Boolean).join(' · ')}</span>
        </div>)}
        {recipes.length > shown.length && <div className={styles.more}><Button variant="ghost" onClick={() => setExpanded(true)}>Show all {recipes.length} (showing {shown.length})</Button></div>}
      </>}
    </section>
  </div>
}
