'use client'

/* `desk:~$ localai top` — the launcher's local-AI widget, shared by /costs and
   /local-ai. Token / saved / request figures come from the usage logs
   (costs.localCompute); VRAM and engines come from the live /api/local-ai probe.
   Both routes read the probe through useLocalAi() so the fetch, validation and
   abort handling live in one place. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Divider, Glyph, Kv, KvRow, Prompt, WRow, type GlyphName } from '../ui'
import { SegBar } from '../charts/SegBar'
import { MiniHist } from '../charts/MiniHist'
import { apiFetch } from '@/lib/api-base'
import type { LocalAiSnapshot } from '@/lib/collectors/local-ai'
import type { CostDashboard } from '@/lib/types'

export type LocalCompute = NonNullable<CostDashboard['localCompute']>

export type LocalAiState = {
  snap: LocalAiSnapshot | null
  error: string | null
  refreshing: boolean
  /** Epoch ms of the last settled request (0 before the first). */
  now: number
  refresh: () => Promise<void>
}

/** One poll of /api/local-ai: validated, abortable, paused while the tab is hidden. */
export function useLocalAi(pollMs = 15_000): LocalAiState {
  const [snap, setSnap] = useState<LocalAiSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(0)
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
    const timer = window.setInterval(() => { setNow(Date.now()); if (!document.hidden) void refresh() }, pollMs)
    const onVisible = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); inflight.current?.abort(); inflight.current = null }
  }, [refresh, pollMs])

  return { snap, error, refreshing, now, refresh }
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const COUNT = new Intl.NumberFormat('en-US')
const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

export function tok(n?: number | null): string {
  if (!finite(n)) return '—'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

/** Last `days` UTC calendar days of local usage, oldest first (the log keys are UTC dates). */
export function localDays(lc: LocalCompute | undefined, days = 14, nowMs = Date.now()) {
  const byDate = new Map((lc?.daily ?? []).map(d => [d.date, d]))
  const today = new Date(nowMs)
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10)
    const d = byDate.get(date)
    return { date, tokens: d?.tokens ?? 0, requests: d?.requests ?? 0 }
  })
}

function engineGlyph(status: string): GlyphName {
  return /^up\b/i.test(status) ? 'run' : /restart/i.test(status) ? 'retry' : 'fail'
}

/** `localai top` card. `lc` is optional: without usage logs the probe rows still render. */
export function LocalAiTop({ lc, state, headingLevel = 'h2' }: { lc?: LocalCompute; state: LocalAiState; headingLevel?: 'h1' | 'h2' }) {
  const { snap, error } = state
  // Render-stable day window: anchored to the last settled probe, else to mount.
  const [mountedAt] = useState(() => Date.now())
  const anchor = state.now || mountedAt
  const days = useMemo(() => localDays(lc, 14, anchor), [lc, anchor])
  const today = days[days.length - 1]
  const rate = lc?.blendedApiRatePerMTokens ?? null
  const todaySaved = rate != null ? today.tokens * rate / 1_000_000 : null

  const cards = snap?.gpu.state === 'ok' ? snap.gpu.data.cards : []
  const vramUsed = cards.reduce((s, c) => s + c.usedMiB, 0)
  const vramTotal = cards.reduce((s, c) => s + c.totalMiB, 0)
  const vramPct = vramTotal > 0 ? vramUsed / vramTotal * 100 : null
  const engines = (snap?.engines.data ?? []).filter(e => e.role !== 'other')
  const proxy = snap?.proxy
  const resident = proxy?.data?.body?.resident
  const residentName = typeof resident === 'string' ? resident : resident ? String(resident) : null

  return <section className="mc-widget" aria-label="Local AI summary">
    <Prompt as={headingLevel} host="desk" cmd="localai top" meta={error ? <><Glyph g="fail" /> probe failed</> : !snap ? 'reading…' : undefined} />
    <Kv keyWidth="7ch">
      <KvRow k="tokens" v={tok(lc?.totalTokens)} r={lc ? `${tok(lc.outputTokens)} out` : ''} />
      <KvRow k="saved" v={rate != null && lc ? MONEY.format(lc.costAvoidedAllTimeUsd) : '—'} r={todaySaved != null && todaySaved > 0 ? `+${MONEY.format(todaySaved)}` : ''} />
      <KvRow k="reqs" v={lc ? COUNT.format(lc.totalRequests) : '—'} r={today.requests > 0 ? `+${COUNT.format(today.requests)}` : ''} />
      <KvRow k="14d" v={<MiniHist values={days.map(d => d.tokens)} label={`local tokens per day, last 14 days: ${days.map(d => tok(d.tokens)).join(', ')}`} />} r={tok(today.tokens)} />
      <KvRow k="vram" v={vramPct != null ? <SegBar value={vramPct} autoTone label="VRAM used across GPUs" /> : <span>{snap ? 'not read' : '—'}</span>}
        r={vramPct != null ? `${Math.round(vramPct)}% ${(vramUsed / 1024).toFixed(1)}G` : ''} />
    </Kv>
    <Divider label={`engines ${engines.length}`} />
    {snap?.engines.state === 'unavailable' && <WRow g="fail" dim right="docker">engines not read</WRow>}
    {engines.map(e => <WRow key={e.name} g={engineGlyph(e.status)} right={e.status.replace(/^Up\s+/i, 'up ').toLowerCase()} title={e.image}>{e.name}</WRow>)}
    {snap?.engines.state !== 'unavailable' && snap && engines.length === 0 && <WRow g="idle" dim>no engines running</WRow>}
    {proxy && <WRow g={proxy.state === 'unavailable' ? 'fail' : residentName ? 'run' : 'idle'} dim={!residentName} right={proxy.state === 'unavailable' ? 'unreachable' : residentName ? 'resident' : 'idle'}>
      proxy{residentName ? ` ${residentName}` : ''}
    </WRow>}
    <Prompt host="desk" foot meta={snap ? new Date(snap.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : undefined} />
  </section>
}
