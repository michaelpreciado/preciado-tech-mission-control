'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveData } from '../LiveDataProvider'
import { Divider, EmptyTerminal, Glyph, Kv, KvRow, Prompt, SkeletonPanel, Verdict, WRow } from '../ui'
import dynamic from 'next/dynamic'
import { Heatmap } from '../Viz'
import { MicroBars } from '../charts/MicroBars'
import { MiniHist } from '../charts/MiniHist'
import { SegBar } from '../charts/SegBar'
import { LocalAiTop, useLocalAi } from './LocalAiTop'
import { BILLING_MODE_COLOR } from '@/lib/chart-colors'
import css from './costs.module.css'
import type { CostDashboard, BillingMode } from '@/lib/types'
import { billingMode } from '@/lib/collectors/costs-usage'

const BurnLandscape = dynamic(() => import('./BurnLandscape').then(m => m.default), { loading: () => null })

/* ══ Costs dashboard ═════════════════════════════════════════════════════
 *
 * ONE RULE ORGANIZES THIS ENTIRE VIEW: every figure belongs to exactly one
 * billing mode, and modes are never summed, ranked, or charted against one
 * another. See billingMode() in lib/collectors/costs-usage.ts.
 *
 *   metered       a real invoice line          → dollars mean dollars
 *   subscription  a flat plan already paid for → tokens only, never dollars
 *   local         this machine's GPU           → free
 *   cloud-routed  Ollama's hosted hardware     → not free, price unknown
 *
 * The second rule: volume is ranked on BILLABLE tokens (input + output + cache
 * writes), never on totals. Cache reads run to 96% of a heavily-cached model's
 * total and are billed at a fraction of input rate, so ranking on totals put a
 * cached agent loop 27x above a local model doing comparable work. Reads get
 * their own column, where they read as leverage rather than as volume.
 * ═════════════════════════════════════════════════════════════════════════ */

const MODE_META: Record<BillingMode, { label: string; color: string; note: string }> = {
  metered: { label: 'metered', color: BILLING_MODE_COLOR.metered, note: 'billed per token' },
  subscription: { label: 'subscription', color: BILLING_MODE_COLOR.subscription, note: 'flat plan · no per-token $' },
  local: { label: 'local', color: BILLING_MODE_COLOR.local, note: 'this rig · free' },
  'cloud-routed': { label: 'cloud-routed', color: BILLING_MODE_COLOR['cloud-routed'], note: "ollama's hardware · price not logged" },
}

/** Amber/red only where a real threshold is crossed: weekly cap and fair-use burn. */
const CAP_TONE = { warn: 70, crit: 90 }

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function fixed(n?: number | null, digits = 1): string {
  return finite(n) ? n.toFixed(digits) : '—'
}

// Formatters are built once: constructing an Intl formatter per call was the
// hottest JS on this route (thousands of cells per render).
const COUNT_FMT = new Intl.NumberFormat('en-US')
const MONEY_FMT = new Map<number, Intl.NumberFormat>()

function count(n?: number | null): string {
  return finite(n) ? COUNT_FMT.format(n) : '—'
}

function money(n?: number | null, digits = 2) {
  if (!finite(n)) return '—'
  let fmt = MONEY_FMT.get(digits)
  if (!fmt) MONEY_FMT.set(digits, fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits }))
  return fmt.format(n)
}

/** Wall-clock duration for the generation-time readout. */
function hours(sec?: number | null): string {
  if (!finite(sec) || sec < 0) return '—'
  if (sec >= 3600) return `${(sec / 3600).toFixed(1)}h`
  if (sec >= 60) return `${Math.round(sec / 60)}m`
  return `${Math.round(sec)}s`
}

function tok(n?: number | null): string {
  if (!finite(n)) return '—'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function timeAgo(value: string | null | undefined, now: number | null): string {
  if (!value || now === null || !Number.isFinite(Date.parse(value))) return '—'
  const elapsed = Math.max(0, now - Date.parse(value))
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Never renders a non-zero share as "0%" — a real but tiny slice reading as
 *  zero is the same lie as omitting it. */
function pct(n: number, d: number): string {
  if (!finite(n) || !finite(d) || d <= 0) return '—'
  const p = (n / d) * 100
  if (!finite(p)) return '—'
  if (p > 0 && p < 0.1) return '<0.1%'
  return `${p.toFixed(p < 10 ? 1 : 0)}%`
}

/** Sub-cent spend is real spend; rounding it to $0.00 makes a charged model
 *  look free, which is the exact confusion this page exists to remove. */
function spend(n: number): string {
  if (n > 0 && n < 0.01) return '<$0.01'
  return money(n)
}

function planLabel(plan?: string | null): string {
  if (!plan) return 'UNKNOWN'
  switch (plan.toLowerCase()) {
    case 'plus': return 'ChatGPT Plus'
    case 'prolite': case 'pro': return 'ChatGPT Pro'
    case 'free': return 'ChatGPT Free'
    default: return plan
  }
}

/** Begin ticking only after hydration; server and first client render agree. */
function useClock(): number | null {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()) }, 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/** UTC calendar anchor from data during SSR, then the live clock after mount. */
function calendarEnd(dates: string[], now: number | null): number | null {
  if (now !== null) return Math.floor(now / 86_400_000) * 86_400_000
  const latest = dates.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && finite(Date.parse(date))).sort().at(-1)
  return latest ? Date.parse(`${latest}T00:00:00Z`) : null
}

function utcTimestamp(value?: string | null): string {
  const ms = value ? Date.parse(value) : NaN
  return finite(ms) ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'
}

function resetTime(value?: string | null): string {
  const ms = value ? Date.parse(value) : NaN
  if (!finite(ms)) return '—'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', timeZoneName: 'short',
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(ms)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  return `${part('weekday')} ${part('month')} ${part('day')} · ${part('hour')}:${part('minute')} ${part('dayPeriod')} ${part('timeZoneName')}`
}

function resetRelative(value: string | null | undefined, now: number | null): string {
  const ms = value ? Date.parse(value) : NaN
  if (!finite(ms) || now === null) return '—'
  if (ms <= now) return 'reset time passed · awaiting provider snapshot'
  const minutes = Math.floor((ms - now) / 60_000)
  if (minutes < 1) return 'in <1m'
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `in ${hours}h ${minutes % 60}m` : `in ${Math.floor(hours / 24)}d ${hours % 24}h`
}

type CodexLimits = NonNullable<CostDashboard['codexUsage']>['rateLimits']

function weeklyPercent(value?: number | null): string {
  return finite(value) ? `${value}%` : '—'
}

/** `4d 18h` until a provider reset; '' when unknown or passed. */
function resetIn(value: string | null | undefined, now: number | null): string {
  const ms = value ? Date.parse(value) : NaN
  if (!finite(ms) || now === null || ms <= now) return ''
  const minutes = Math.floor((ms - now) / 60_000)
  const h = Math.floor(minutes / 60)
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`
}

/** `● week   4d 18h   3%` over a thin progress line — the launcher CLAUDE card row. */
function CapRow({ label, used, resetsAt, now, active = false }: { label: string; used: number | null | undefined; resetsAt?: string | null; now: number | null; active?: boolean }) {
  const pctUsed = finite(used) ? used : null
  const tone = pctUsed == null ? undefined : pctUsed >= CAP_TONE.crit ? 'crit' : pctUsed >= CAP_TONE.warn ? 'warn' : undefined
  return (
    <div className={css.capRow}>
      <div className={css.capLine}>
        <span className={active ? css.capDotOn : css.capDot} aria-hidden="true" />
        <span className={css.capName}>{label}</span>
        <span className={css.capReset} title={resetsAt ? `resets ${resetTime(resetsAt)}` : undefined}>{resetIn(resetsAt, now)}</span>
        <span className={tone === 'crit' ? css.crit : tone === 'warn' ? css.warn : css.capPct}>{weeklyPercent(pctUsed)}</span>
      </div>
      <SegBar value={pctUsed ?? 0} thin segments={40} autoTone={CAP_TONE} label={`${label} ${weeklyPercent(pctUsed)} used`} />
    </div>
  )
}

/** Codex weekly cap: provider-reported percent from the session rate_limits snapshot. */
function WeeklyUsage({ limits, now }: { limits: CodexLimits; now: number | null }) {
  const used = limits?.weeklyUsedPercent
  return (
    <div className={css.caps}>
      {limits?.secondaryUsedPercent != null && limits.secondaryWindowMinutes !== limits.weeklyWindowMinutes && (
        <CapRow label="session" used={limits.secondaryUsedPercent} resetsAt={limits.secondaryResetsAt} now={now} />
      )}
      <CapRow label="week" used={used} resetsAt={limits?.weeklyResetsAt} now={now} active />
      {!limits && <p className={css.hint}>no provider snapshot in session logs</p>}
      {limits?.weeklyResetsAt && <p className={css.hint}>resets {resetTime(limits.weeklyResetsAt)} · {resetRelative(limits.weeklyResetsAt, now)}</p>}
    </div>
  )
}

/* ── Primitives ─────────────────────────────────────────────────────── */

function Stat({ value, label, sub, color, size = 'md' }: {
  value: ReactNode; label: string; sub?: ReactNode
  /** Only for a real threshold tone (STATUS.*); figures are otherwise white. */
  color?: string; size?: 'hero' | 'lg' | 'md' | 'sm'
}) {
  const shown = value == null || (typeof value === 'number' && !finite(value)) ? '—' : value
  return (
    <div className={css.stat}>
      {size === 'hero'
        ? <Verdict>{shown}</Verdict>
        : <div className={`${css.statValue} ${size === 'lg' ? css.statLg : size === 'sm' ? css.statSm : ''}`} style={color ? { color } : undefined}>{shown}</div>}
      <div className={css.statLabel}>{label}</div>
      {sub != null && <div className={css.statSub}>{sub}</div>}
    </div>
  )
}

/** Provenance line. Every panel gets one — where the number came from and what
 *  it does not cover. Kept uniform so a caveat is never mistaken for a footnote
 *  about a different figure. */
function Note({ children }: { children: ReactNode }) {
  // Phones clamp the caveat to two lines behind a toggle; the full text stays in the DOM.
  const [open, setOpen] = useState(false)
  return (
    <div className={`cp-note ${css.note}${open ? ' is-open' : ''}`}>
      <div className="cp-note-body">{children}</div>
      <button type="button" className="cp-note-more" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {open ? 'less' : 'source & caveats'}
      </button>
    </div>
  )
}

/** Flat identity square for a billing mode (legend key, never a status). */
function ModeDot({ mode }: { mode: BillingMode }) {
  return <span className={css.modeDot} style={{ background: MODE_META[mode].color }} aria-hidden="true" />
}

/** A launcher widget: `desk:~$ <cmd>` head, then the body. */
function Widget({ cmd, meta, children, className = '', label }: { cmd: string; meta?: ReactNode; children: ReactNode; className?: string; label?: string }) {
  return (
    <section className={`mc-widget ${css.widget} ${className}`} aria-label={label ?? cmd}>
      <Prompt as="h2" host="desk" cmd={cmd} meta={meta} />
      {children}
    </section>
  )
}

/* ── Table ──────────────────────────────────────────────────────────────
   One table component for every model list, so column alignment and number
   formatting cannot drift between sections. Columns are declared per section
   rather than hardcoded: a subscription table must not have a $ column at all,
   which is stronger than rendering "$0.00" and hoping it reads as "not billed". */

type Col<T> = { key: string; head: string; align?: 'left' | 'right'; render: (row: T) => ReactNode; w?: number }

/** Phones and folds always get the stacked layout, whatever the column budget. */
const STACK_MEDIA = '(max-width: 820px)'

function Table<T>({ cols, rows, empty, rowKey }: { cols: Col<T>[]; rows: T[]; empty: string; rowKey: (row: T) => string }) {
  const wrapper = useRef<HTMLDivElement>(null)
  // A stacked first render also fits narrow screens before hydration.
  const [stacked, setStacked] = useState(true)
  const isEmpty = rows.length === 0
  const minTableWidth = Math.max(720, cols.reduce((sum, col) => sum + (col.w ?? 190), 0))
  useEffect(() => {
    const element = wrapper.current
    if (!element) return
    const mq = window.matchMedia(STACK_MEDIA)
    let width = element.getBoundingClientRect().width
    const sync = () => setStacked(mq.matches || width < minTableWidth)
    const observer = new ResizeObserver(([entry]) => { width = entry.contentRect.width; sync() })
    observer.observe(element)
    mq.addEventListener('change', sync)
    sync()
    return () => { observer.disconnect(); mq.removeEventListener('change', sync) }
  }, [isEmpty, minTableWidth])
  if (!rows.length) {
    return <WRow g="idle" dim>{empty}</WRow>
  }
  return (
    <div className="cp-tablewrap" ref={wrapper} style={{ minWidth: 0, overflowX: 'visible' }}>
      <table className="cp-table" role="table" style={{ minWidth: 0, width: '100%', tableLayout: 'fixed', ...(stacked ? { display: 'block' } : {}) }}>
        <thead style={stacked ? { display: 'none' } : undefined}>
          <tr>{cols.map(c => (
            <th key={c.key} scope="col" style={{ textAlign: c.align ?? 'left', width: c.w ?? 'auto', minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{c.head}</th>
          ))}</tr>
        </thead>
        <tbody role="rowgroup" style={stacked ? { display: 'block' } : undefined}>
          {rows.map((r, index) => (
            <tr key={rowKey(r)} role="row" style={stacked ? { display: 'block', padding: '14px 16px', borderBottom: index < rows.length - 1 ? '1px dashed var(--pt-border-dim)' : 0 } : undefined}>{cols.map(c => (
              <td key={c.key} role="cell" data-label={c.head} style={{ textAlign: c.align ?? 'left', minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere', ...(stacked ? { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px 12px', width: 'auto', padding: '5px 0', border: 0 } : {}) }}>
                {stacked && <span className={css.stackHead}>{c.head.toLowerCase()}</span>}
                <span style={{ minWidth: 0, ...(stacked ? { flex: '1 1 130px' } : { display: 'block' }) }}>{c.render(r)}</span>
              </td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Inline proportion bar for a table cell — magnitude at a glance without a
 *  second chart. Width is share-of-max within its own column only. */
function Bar({ value, max }: { value: number; max: number }) {
  return <span className={css.cellBar} aria-hidden><SegBar value={finite(value) ? value : 0} max={finite(max) && max > 0 ? max : 1} segments={12} /></span>
}

function BurnTrend({ codexDaily, windowDays }: { codexDaily: { date: string; tokens: number }[]; windowDays: number }) {
  const series = new Map(codexDaily.map(day => [day.date, day.tokens]))
  const latestDate = [...series.keys()].sort().at(-1)
  if (!latestDate) return null
  const latest = new Date(`${latestDate}T00:00:00Z`)
  if (!finite(latest.getTime())) return null
  const days = Array.from({ length: Math.max(1, windowDays) }, (_, index) => {
    const date = new Date(latest)
    date.setUTCDate(latest.getUTCDate() - (windowDays - index - 1))
    const key = date.toISOString().slice(0, 10)
    return [key, series.get(key) ?? 0] as [string, number]
  })
  const values = days.map(([, value]) => value)
  if (values.every(value => value === 0)) return null
  const peak = values.reduce((best, value, index) => value > values[best] ? index : best, 0)
  return (
    <KvRow k={`${days.length}d`} v={<MiniHist values={values} days={days.length} label={`Codex tokens per day, last ${days.length} days, peak ${tok(values[peak])} on ${days[peak][0]}`} />} r={tok(values.at(-1) ?? 0)} />
  )
}

/* ── 1 · What you actually paid ─────────────────────────────────────── */

function ActualSpend({ costs }: { costs: CostDashboard }) {
  const b = costs.billing?.[0]
  const or = costs.openRouterLive
  const lc = costs.localCompute
  const isCurrent = b && costs.subscription?.month === b.month
  const plan = b?.planAmount
  const metered = b?.openRouterUsd
  const total = finite(plan) && finite(metered) ? plan + metered : null

  const rate = lc?.blendedApiRatePerMTokens ?? null
  const displaced = rate != null && b ? (b.localTokens / 1_000_000) * rate : null

  const lines = [
    { label: b?.plan ?? 'plan', kind: 'subscription' as BillingMode, amount: plan, src: 'configured in data/config.json' },
    { label: 'OpenRouter', kind: 'metered' as BillingMode, amount: metered, src: 'live key billing API' },
  ]

  return (
    <Widget cmd="costs" label="Actual spend this month" meta={isCurrent ? b?.month : 'no current-month record'}>
      <Verdict unit="this month">{money(total)}</Verdict>
      <Kv keyWidth="14ch" className={css.lines}>
        {lines.map(l => (
          <KvRow key={l.label} k={<><ModeDot mode={l.kind} /> {l.label.toLowerCase()}</>} v={<span className={css.dim}>{l.src}</span>} r={money(l.amount)} />
        ))}
        {displaced != null && displaced > 0 && (
          <KvRow k="displaced" v={<span className={css.dim}>{tok(b!.localTokens)} local tokens</span>} r={money(displaced)} />
        )}
      </Kv>
      <Note>
        THE ONLY TWO THINGS THAT MOVE MONEY: A FLAT PLAN AND METERED API USE. TOKENS PROCESSED UNDER THE PLAN
        ({tok((b?.claudeTokens ?? 0) + (b?.codexTokens ?? 0))} THIS MONTH ACROSS CLAUDE CODE + CODEX CLI) COST NOTHING EXTRA AND ARE DELIBERATELY ABSENT FROM THIS FIGURE.
        {or && <> OPENROUTER&apos;S MONTHLY NUMBER IS ITS OWN BILLING API, NOT A LOG ESTIMATE.</>}
        {displaced != null && displaced > 0 && ` DISPLACED = LOCAL TOKENS PRICED AT ${money(rate, 2)}/M, THE RATE YOUR OWN METERED USAGE IMPLIES — A COUNTERFACTUAL, NOT A REFUND.`}
      </Note>
    </Widget>
  )
}

/* ── 2 · Where the volume goes, by billing mode ─────────────────────── */

function ModeBreakdown({ costs }: { costs: CostDashboard }) {
  const modes = costs.modes ?? []
  if (!modes.length) return null
  const maxBillable = Math.max(...modes.map(m => m.billableTokens), 1)

  return (
    <Widget cmd="costs --by-mode" label="Volume by billing mode, all-time logs" meta="never summed">
      <Table
        rows={modes}
        rowKey={m => m.mode}
        empty="no usage logged"
        cols={[
          {
            key: 'mode', head: 'MODE', render: m => (
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
                <ModeDot mode={m.mode} />
                <span className={css.hi}>{MODE_META[m.mode].label}</span>
                <span className="cp-cellnote">{MODE_META[m.mode].note}</span>
              </span>
            ),
          },
          { key: 'models', head: 'MODELS', align: 'right', w: 60, render: m => m.models },
          { key: 'req', head: 'REQUESTS', align: 'right', w: 80, render: m => count(m.requests) },
          {
            key: 'billable', head: 'BILLABLE', align: 'right', w: 150, render: m => (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                <Bar value={m.billableTokens} max={maxBillable} />
                <span style={{ minWidth: 46, textAlign: 'right' }}>{tok(m.billableTokens)}</span>
              </span>
            ),
          },
          { key: 'cache', head: 'CACHE READ', align: 'right', w: 84, render: m => m.cacheReadTokens > 0 ? tok(m.cacheReadTokens) : <span className={css.mute}>—</span> },
          {
            key: 'lev', head: 'LEVERAGE', align: 'right', w: 74, render: m => m.cacheReadTokens > 0
              ? <span>{fixed(m.cacheReadTokens / Math.max(1, m.billableTokens))}×</span>
              : <span className={css.mute}>—</span>,
          },
          {
            key: 'cost', head: 'BILLED', align: 'right', w: 86, render: m => m.mode === 'metered'
              ? <span className={css.hi}>{money(m.costUsd)}</span>
              : <span className={css.mute}>{m.mode === 'local' ? 'free' : m.mode === 'subscription' ? 'in plan' : 'not logged'}</span>,
          },
        ]}
      />
      <Note>
        BILLABLE = INPUT + OUTPUT + CACHE WRITES — THE TOKENS A METERED PROVIDER CHARGES FOR. CACHE READS ARE SHOWN
        APART BECAUSE THEY BILL AT A FRACTION OF INPUT RATE; LEVERAGE IS READS PER BILLABLE TOKEN, SO HIGHER IS CHEAPER.
        ONLY THE METERED ROW CARRIES REAL DOLLARS — {modes.some(m => m.notionalCostUsd > 0)
          ? `THE OTHERS' LOGS PRICE THEMSELVES AT LIST RATE (${money(modes.reduce((s, m) => s + m.notionalCostUsd, 0))} ALL-TIME), WHICH A FLAT PLAN HAD ALREADY PAID FOR.`
          : 'THE OTHERS ARE NOT BILLED PER TOKEN.'}
      </Note>
    </Widget>
  )
}


/* ── Local vs API vs plan ────────────────────────────────────────────────
   The three-way question this page exists to answer: how much of the work is
   the rig doing, how much am I renting by the token, and how much is riding a
   flat plan. Compared on OUTPUT tokens, which is the only measure that means
   the same thing in all three columns — totals are inflated by cache reads
   that Ollama never reports, and requests vary wildly in size. */
function SourceSplit({ costs }: { costs: CostDashboard }) {
  const modes = costs.modes ?? []
  if (modes.length < 2) return null
  const lc = costs.localCompute
  const rows = modes.map(m => ({ ...m, outputTokens: m.outputTokens, requests: m.requests }))
  const totalOut = rows.reduce((s, r) => s + r.outputTokens, 0)
  const maxOut = Math.max(...rows.map(r => r.outputTokens), 1)
  const rate = lc?.blendedApiRatePerMTokens ?? null

  return (
    <Widget cmd="costs --who-did-the-work" label="Local vs metered vs plan" meta={`${tok(totalOut)} out`}>
      <div className={css.stats}>
        {rows.map(r => (
          <Stat key={r.mode} value={pct(r.outputTokens, totalOut)} label={`${MODE_META[r.mode].label} share`}
            size="lg" sub={`${tok(r.outputTokens)} generated`} />
        ))}
      </div>
      <Table
        rows={rows}
        rowKey={r => r.mode}
        empty="no usage logged"
        cols={[
          {
            key: 'm', head: 'SOURCE', render: r => (
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
                <ModeDot mode={r.mode} />
                <span className={css.hi}>{MODE_META[r.mode].label}</span>
              </span>
            ),
          },
          {
            key: 'out', head: 'OUTPUT TOKENS', align: 'right', w: 170, render: r => (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                <Bar value={r.outputTokens} max={maxOut} />
                <span style={{ minWidth: 46, textAlign: 'right' }}>{tok(r.outputTokens)}</span>
              </span>
            ),
          },
          { key: 'share', head: 'SHARE', align: 'right', w: 66, render: r => pct(r.outputTokens, totalOut) },
          { key: 'in', head: 'INPUT', align: 'right', w: 76, render: r => tok(r.inputTokens) },
          { key: 'req', head: 'REQUESTS', align: 'right', w: 82, render: r => count(r.requests) },
          {
            key: 'avg', head: 'AVG OUT/REQ', align: 'right', w: 90,
            render: r => r.requests > 0 ? tok(Math.round(r.outputTokens / r.requests)) : <span className={css.mute}>—</span>,
          },
          {
            key: 'cost', head: '$ / M OUTPUT', align: 'right', w: 96,
            render: r => r.mode === 'metered'
              ? <span className={css.hi}>{r.outputTokens > 0 ? money(r.costUsd / (r.outputTokens / 1_000_000)) : '—'}</span>
              : <span className={r.mode === 'local' ? undefined : css.mute}>
                  {r.mode === 'local' ? '$0.00' : r.mode === 'subscription' ? 'in plan' : 'not logged'}
                </span>,
          },
        ]}
      />
      <Note>
        COMPARED ON OUTPUT TOKENS BECAUSE IT IS THE ONE FIGURE THAT MEANS THE SAME THING IN ALL THREE COLUMNS — TOTALS
        ARE DOMINATED BY CACHE READS THAT OLLAMA NEVER REPORTS, AND A REQUEST IS NOT A FIXED UNIT OF WORK.
        {rate != null && ` AT YOUR METERED RATE, THE ${tok(rows.find(r => r.mode === 'local')?.outputTokens ?? 0)} TOKENS THE RIG GENERATED WOULD HAVE BEEN BILLABLE WORK ELSEWHERE.`}
        {' '}CLAUDE CODE AND CODEX CLI OUTPUT ARE FOLDED INTO THE SUBSCRIPTION ROW; BOTH ARE LOGGED IN SEPARATE TREES AND HAVE NO REQUEST COUNT.
      </Note>
    </Widget>
  )
}

/* ── 3 · Metered spend + reconciliation against the real invoice ────── */

function MeteredSpend({ costs }: { costs: CostDashboard }) {
  const or = costs.openRouterLive
  if (!or) return null
  const logged = costs.meteredCostUsd ?? 0
  const cov = or.usageLifetime > 0 ? logged / or.usageLifetime : 0

  return (
    <Widget cmd="openrouter" label="Metered spend, OpenRouter" meta={or.label}>
      <Verdict unit="this month">{money(or.usageMonthly)}</Verdict>
      <Kv keyWidth="9ch" className={css.lines}>
        <KvRow k="7d" v="" r={money(or.usageWeekly)} />
        <KvRow k="today" v="" r={money(or.usageDaily)} />
        <KvRow k="lifetime" v={<span className={css.dim}>on this key</span>} r={money(or.usageLifetime)} />
        {or.limit != null && <KvRow k="credit" v={<span className={css.dim}>remaining</span>} r={money(or.limitRemaining)} />}
        <KvRow k="logged" v={<SegBar value={Math.min(100, cov * 100)} label="Log coverage of lifetime OpenRouter billing" />} r={pct(logged, or.usageLifetime)} />
      </Kv>
      <p className={css.hint}>{money(logged)} of {money(or.usageLifetime)} lifetime billing is visible in this machine&apos;s logs</p>
      <Note>
        THE BAR IS NOT A BUDGET — IT IS HOW MUCH OF YOUR REAL OPENROUTER BILL THIS MACHINE&apos;S LOGS CAN SEE.
        REQUESTS MADE FROM ANY OTHER MACHINE ARE BILLED TO THIS KEY AND NEVER APPEAR HERE, SO THE LOGGED FIGURE IS
        A FLOOR. THE TWO NUMBERS ARE REPORTED SIDE BY SIDE AND NEVER ADDED.
      </Note>
    </Widget>
  )
}

/* ── 4 · Scrollable model-burn chart ─────────────────────────────────── */

type Row = {
  name: string; provider: string; mode: BillingMode
  billable: number; cache: number; total: number
  /** null when the source records no request count (Claude Code's logs don't). */
  requests: number | null
  cost: number
  /** Windowed BILLABLE tokens — same basis as the `billable` column. Mixing a
   *  total-token window figure into a billable-ranked row put 496M beside 2.0M
   *  on one line and made the table look broken. */
  windowBillable: number
  tokensPerSec?: number | null
  /** Provider genuinely bills nothing (an explicit free tier), as opposed to
   *  simply not recording a price. */
  freeTier?: boolean
}

type ModelChartGroup = {
  title: string
  rows: Row[]
  meta?: string
  showCost?: boolean
  showSpeed?: boolean
  note: ReactNode
}

function ModelBurnChart({ groups, windowDays }: { groups: ModelChartGroup[]; windowDays: number }) {
  const activeGroups = groups.filter(group => group.rows.length > 0)
  const sortedGroups = activeGroups.map(group => ({
    ...group,
    rows: [...group.rows].sort((a, b) => b.billable - a.billable),
  }))
  const rows = sortedGroups.flatMap(group => group.rows)
  const max = Math.max(...rows.map(row => row.billable), 1)

  return (
    <Widget cmd="costs --models" label="Models ranked on billable tokens" meta={`${rows.length} models`}>
      <div className="cp-model-chart">
        <div className="cp-model-chart-legend" aria-label="Billing mode legend">
          {(Object.entries(MODE_META) as [BillingMode, typeof MODE_META[BillingMode]][]).map(([mode, meta]) => (
            <span key={mode}><ModeDot mode={mode} />{meta.label}</span>
          ))}
        </div>
        <div className="cp-model-chart-scroll" role="region" aria-label="Models ranked by billable tokens">
          {sortedGroups.map(group => (
            <section className="cp-model-chart-group" key={group.title}>
              <Divider label={`${group.title.toLowerCase()}${group.meta ? ` · ${group.meta}` : ''}`} />
              {group.rows.map(row => {
                const cost = row.cost > 0 ? spend(row.cost) : row.freeTier ? 'free tier' : 'no price logged'
                const speed = finite(row.tokensPerSec) ? `${fixed(row.tokensPerSec)} tok/s` : '— tok/s'
                return (
                  <div className="cp-model-chart-row" key={JSON.stringify([row.mode, row.provider, row.name])}>
                    <div className="cp-model-chart-main">
                      <div className="cp-model-chart-name">
                        <ModeDot mode={row.mode} />
                        <span className="cp-model-chart-model">{row.name}</span>
                        {row.provider && <span className="cp-cellprov">{row.provider}</span>}
                      </div>
                      <div className="cp-model-chart-barline">
                        <SegBar className={css.trackBar} value={row.billable} max={max} segments={24} label={`${row.name}: ${tok(row.billable)} billable tokens`} />
                        <strong>{tok(row.billable)}</strong>
                      </div>
                    </div>
                    <div className="cp-model-chart-stats">
                      <span>cache {row.cache > 0 ? tok(row.cache) : '—'}</span>
                      <span>req {row.requests == null ? '—' : count(row.requests)}</span>
                      <span>{windowDays}d {row.windowBillable > 0 ? tok(row.windowBillable) : 'idle'}</span>
                      {group.showSpeed && <span>{speed}</span>}
                      {group.showCost && <span className={row.cost > 0 ? css.hi : css.mute}>{cost}</span>}
                    </div>
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      </div>
      <Note>
        {sortedGroups.map(group => <div key={group.title} className={css.noteLine}>{group.note}</div>)}
      </Note>
    </Widget>
  )
}

/* ── 5 · Activity: one bar per calendar day, colored by mode ────────── */

function Activity({ costs, modeOf, now }: { costs: CostDashboard; modeOf: (m: string) => BillingMode; now: number | null }) {
  const windowDays = finite(costs.dailyWindowDays) ? Math.max(0, Math.floor(costs.dailyWindowDays)) : 30
  const cu = costs.claudeUsage
  const xu = costs.codexUsage

  const days = useMemo(() => {
    const byDate = new Map<string, Record<BillingMode, number>>()
    const blank = (): Record<BillingMode, number> => ({ metered: 0, subscription: 0, local: 0, 'cloud-routed': 0 })
    for (const d of costs.daily ?? []) {
      const slot = byDate.get(d.date) ?? blank()
      for (const [model, v] of Object.entries(d.byModel ?? {})) {
        slot[modeOf(model)] += (v as { tokens?: number })?.tokens ?? 0
      }
      byDate.set(d.date, slot)
    }
    for (const d of cu?.daily ?? []) {
      const slot = byDate.get(d.date) ?? blank()
      slot.subscription += d.tokens
      byDate.set(d.date, slot)
    }
    for (const d of xu?.daily ?? []) {
      const slot = byDate.get(d.date) ?? blank()
      slot.subscription += d.tokens
      byDate.set(d.date, slot)
    }
    // One column per calendar day. Plotting only active days spaces them evenly
    // and hides the quiet stretches, so a fortnight of silence would look
    // identical to a fortnight of steady work.
    const end = calendarEnd([...byDate.keys()], now)
    if (end === null) return []
    return Array.from({ length: windowDays }, (_, i) => {
      const date = new Date(end - (windowDays - 1 - i) * 86_400_000).toISOString().slice(0, 10)
      const v = byDate.get(date) ?? blank()
      return { date, ...v, total: v.metered + v.subscription + v.local + v['cloud-routed'] }
    })
  }, [costs.daily, cu?.daily, xu?.daily, windowDays, modeOf, now])

  const active = days.filter(d => d.total > 0).length
  const totals = days.reduce((a, d) => {
    (Object.keys(MODE_META) as BillingMode[]).forEach(k => { a[k] += d[k] })
    return a
  }, { metered: 0, subscription: 0, local: 0, 'cloud-routed': 0 } as Record<BillingMode, number>)
  const grand = Object.values(totals).reduce((s, v) => s + v, 0)
  const order: BillingMode[] = ['metered', 'subscription', 'local', 'cloud-routed']

  return (
    <Widget cmd={`costs --activity ${windowDays}d`} label={`Activity, last ${windowDays} days`} meta={`${active}/${windowDays} days active`}>
      <div className={css.stats}>
        <Stat value={tok(grand)} label={`tokens processed · ${windowDays}d`} size="lg" />
        {order.filter(k => totals[k] > 0).map(k => (
          <Stat key={k} value={tok(totals[k])} label={MODE_META[k].label} size="md"
            sub={pct(totals[k], grand)} />
        ))}
      </div>
      <MicroBars
        label={`Tokens processed per day, last ${windowDays} days, stacked by billing mode`}
        format={tok}
        height={92}
        bars={days.map(d => ({
          key: d.date, value: d.total,
          title: `${d.date} · ${d.total > 0 ? tok(d.total) : 'no activity'}${order.filter(k => d[k] > 0).map(k => ` · ${MODE_META[k].label.toLowerCase()} ${tok(d[k])}`).join('')}`,
          segments: order.map(k => ({ value: d[k], color: MODE_META[k].color })),
        }))}
        axis={[days[0]?.date.slice(5) ?? '', days[Math.floor(days.length / 2)]?.date.slice(5) ?? '', days.at(-1)?.date.slice(5) ?? '']}
        empty={`No tokens logged in the last ${windowDays} days.`}
      />
      <div className={css.legend}>
        {order.filter(k => totals[k] > 0).map(k => (
          <span key={k}><ModeDot mode={k} />{MODE_META[k].label}</span>
        ))}
      </div>
      <Note>
        ONE COLUMN PER CALENDAR DAY — EMPTY COLUMNS ARE QUIET DAYS, NOT MISSING DATA. THIS CHART COUNTS TOTAL TOKENS
        PROCESSED (CACHE READS INCLUDED), WHICH IS WHY IT IS LABELLED PROCESSED AND CARRIES NO DOLLARS: IT MEASURES
        HOW BUSY THE STACK WAS, NOT WHAT IT COST. FROM THIS MACHINE&apos;S LOGS ONLY.
      </Note>
    </Widget>
  )
}

function CodexUsage({ costs, now }: { costs: CostDashboard; now: number | null }) {
  const usage = costs.codexUsage
  if (!usage) return null
  const lastActivity = utcTimestamp(usage.lastActivityAt)
  return (
    <Widget cmd="codex usage" label="Codex CLI flat plan usage" meta={usage.planType ? `${planLabel(usage.planType).toLowerCase()} · tokens only` : 'tokens only'}>
      <div className={css.stats}>
        <Stat value={planLabel(usage.planType)} label="plan" size="lg" />
        <Stat value={tok(usage.totalTokens)} label="tokens" size="lg" />
        <Stat value={count(usage.sessionsCount)} label="sessions" size="lg" />
        <Stat value={lastActivity} label="last activity" size="sm" />
      </div>
      <WeeklyUsage limits={usage.rateLimits} now={now} />
      <MicroBars
        label="Codex CLI tokens per day"
        format={tok}
        height={54}
        bars={usage.daily.map(day => ({ key: day.date, value: day.tokens, title: `${day.date} · ${tok(day.tokens)}`, segments: [{ value: day.tokens, color: MODE_META.subscription.color }] }))}
        axis={[usage.daily[0]?.date.slice(5) ?? '—', usage.daily[Math.floor(usage.daily.length / 2)]?.date.slice(5) ?? '', usage.daily.at(-1)?.date.slice(5) ?? '—']}
        empty="No Codex CLI tokens logged in this window."
      />
      <Note>CODEX CLI ROLLOUT LOGS · SUBSCRIPTION USAGE IS REPORTED AS TOKENS AND NEVER AS METERED SPEND.</Note>
    </Widget>
  )
}

/* ── 6 · Local AI ───────────────────────────────────────────────────── */

function heatmapWeeks(daily: { date: string; tokens: number }[], now: number | null, weeksBack = 14): number[][] {
  const byDate = new Map(daily.map(d => [d.date, d.tokens]))
  const nz = daily.map(d => d.tokens).filter(t => t > 0).sort((a, b) => a - b)
  const q = (p: number) => nz.length ? nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] : 0
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75)
  const lvl = (t: number) => t <= 0 ? 0 : t <= t1 ? 1 : t <= t2 ? 2 : t <= t3 ? 3 : 4
  // UTC throughout — daily[].date keys are UTC calendar dates, so building this
  // grid in local time would misalign every cell near midnight.
  const end = calendarEnd(daily.map(day => day.date), now)
  if (end === null) return []
  let start = end - (weeksBack * 7 - 1) * 86_400_000
  start -= new Date(start).getUTCDay() * 86_400_000
  const days: number[] = []
  for (let t = start; t <= end; t += 86_400_000) days.push(lvl(byDate.get(new Date(t).toISOString().slice(0, 10)) ?? 0))
  const weeks: number[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}

function LocalAI({ costs, now }: { costs: CostDashboard; now: number | null }) {
  const lc = costs.localCompute
  const rate = lc?.blendedApiRatePerMTokens ?? null
  // Hooks run before the "no local usage" return so the hook order never changes.
  const dailyBurn = useMemo(() => {
    const byDate = new Map((lc?.daily ?? []).map(day => [day.date, day]))
    const today = new Date()
    const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    return Array.from({ length: 14 }, (_, i) => {
      const date = new Date(end - (13 - i) * 86_400_000).toISOString().slice(0, 10)
      const day = byDate.get(date)
      const tokens = day?.tokens ?? 0
      return { date, tokens, requests: day?.requests ?? 0, avoided: rate != null ? tokens * rate / 1_000_000 : null }
    })
  }, [lc?.daily, rate])
  if (!lc) return null
  const weeks = heatmapWeeks(lc.daily, now)
  const spark = lc.dailyThroughput.map(d => d.avgTokensPerSec)
  const todayBurn = dailyBurn[dailyBurn.length - 1]
  const last7 = dailyBurn.slice(-7)
  const weekTokens = last7.reduce((sum, day) => sum + day.tokens, 0)
  const weekAvoided = rate != null ? weekTokens * rate / 1_000_000 : null
  const last24 = lc.last24Hours ?? []
  const last24Tokens = last24.reduce((sum, hour) => sum + hour.tokens, 0)
  const last24Requests = last24.reduce((sum, hour) => sum + hour.requests, 0)
  const last24Avoided = rate != null ? last24Tokens * rate / 1_000_000 : null

  return (
    <>
      <Divider label="local ai · ollama" />
      <Widget cmd="localai stats" label="Local inference, what the rig did" meta={`${count(lc.totalRequests)} reqs`}>
        <div className={css.stats}>
          <Stat value={tok(lc.totalTokens)} label="tokens all-time" size="hero"
            sub={`${tok(lc.outputTokens)} generated · ${tok(lc.inputTokens)} prompt`} />
          <Stat value={fixed(lc.medianTokensPerSec)} label="median tok/s" size="lg"
            sub={<>p95 {fixed(lc.p95TokensPerSec)} · mean {fixed(lc.avgTokensPerSec)}</>} />
          <Stat value={hours(lc.generationSeconds)} label="time generating" size="lg"
            sub={`${count(lc.sampleCount)} sampled turns`} />
          <Stat value={rate != null ? money(lc.costAvoidedAllTimeUsd) : '—'} label="would have cost, metered" size="lg"
            sub={rate != null ? `at ${money(rate)}/M` : 'no metered rate to compare'} />
          <Stat value={lc.daily.filter(day => day.tokens > 0).length} label="active days" size="lg"
            sub={lc.busiestDay ? `peak ${tok(lc.busiestDay.tokens)} on ${lc.busiestDay.date.slice(5)}` : undefined} />
          <Stat value={lc.totalRequests > 0 ? tok(Math.round(lc.totalTokens / lc.totalRequests)) : '—'} label="avg tokens / request" size="lg" />
        </div>
        <Note>
          {rate != null && lc.blendedRateBasis
            ? <>THE $ FIGURE IS A COUNTERFACTUAL, NOT A SAVING: LOCAL TOKENS PRICED AT {money(rate)}/M, DERIVED FROM {money(lc.blendedRateBasis.costUsd)} OF
              <strong> METERED</strong> SPEND ACROSS {tok(lc.blendedRateBasis.billableTokens)} BILLABLE TOKENS. SUBSCRIPTION USAGE IS EXCLUDED FROM THAT RATE — ITS
              LIST-RATE DOLLARS WERE NEVER INVOICED, AND BLENDING THEM IN OVERSTATED THIS BY 85%.</>
            : 'NO METERED USAGE LOGGED, SO THERE IS NO HONEST RATE TO PRICE LOCAL TOKENS AGAINST.'}
          {' '}TOK/S IS END-TO-END PER-TURN (PROMPT PROCESSING INCLUDED), NOT A DECODE BENCHMARK — THE MEDIAN IS QUOTED FIRST BECAUSE A
          HANDFUL OF CPU-BOUND TURNS NEAR 0.2 TOK/S DRAG THE MEAN WELL BELOW WHAT THE RIG USUALLY DOES.
          {lc.cloudRouted.tokens > 0 && ` EXCLUDES ${lc.cloudRouted.models.join(', ')} (${tok(lc.cloudRouted.tokens)} TOKENS) — CLOUD-ROUTED, NOT THIS RIG.`}
        </Note>
      </Widget>

      <Divider label="daily local ai burn · 14d" />
      <Widget cmd="localai burn --14d" label="Local tokens and API value avoided, last 14 days" meta="daily">
        <div className={css.stats}>
          <Stat value={tok(todayBurn.tokens)} label="today · local tokens" size="lg" sub={`${count(todayBurn.requests)} requests`} />
          <Stat value={tok(weekTokens)} label="7-day local tokens" size="lg" />
          <Stat value={weekAvoided != null ? money(weekAvoided) : '—'} label="7-day api cost avoided · est." size="lg"
            sub={rate != null ? `at ${money(rate)}/M metered rate` : 'no metered rate to compare'} />
        </div>
        <MicroBars
          label="Local AI tokens per day, last 14 days"
          format={tok}
          bars={dailyBurn.map(day => ({ key: day.date, value: day.tokens, title: `${day.date}: ${count(day.tokens)} local tokens · ${count(day.requests)} requests${day.avoided != null ? ` · ${money(day.avoided)} estimated API cost avoided` : ''}` }))}
          axis={[dailyBurn[0].date.slice(5), dailyBurn[7].date.slice(5), 'today']}
          empty="No local inference logged in the last 14 days."
        />
        <div className={css.legend}>
          <span>daily local tokens · utc days</span><span className={css.push}>{rate != null ? `est. 7d avoided · ${money(weekAvoided)}` : 'no metered baseline'}</span>
        </div>
        <Note>API VALUE IS A COUNTERFACTUAL ESTIMATE, NOT CASH SAVED OR AVOIDED ELECTRICITY COST. IT PRICES LOCAL TOKENS AT THE LOG-DERIVED METERED RATE; SUBSCRIPTION USAGE IS EXCLUDED. POWER / ENERGY COST IS NOT INCLUDED.</Note>
      </Widget>

      <Divider label="local ai burn · rolling 24h" />
      <Widget cmd="localai burn --24h" label="Hourly local usage, last 24 hours" meta="this rig only">
        <div className={css.stats}>
          <Stat value={tok(last24Tokens)} label="local tokens · 24h" size="lg" />
          <Stat value={count(last24Requests)} label="requests · 24h" size="lg" />
          <Stat value={last24Avoided != null ? money(last24Avoided) : '—'} label="api value · est. 24h" size="lg"
            sub={rate != null ? `at ${money(rate)}/M metered rate` : 'no metered rate to compare'} />
        </div>
        <MicroBars
          label="Local AI tokens by hour, rolling last 24 hours"
          format={tok}
          bars={last24.map(hour => ({ key: hour.hour, value: hour.tokens, title: `${new Date(hour.hour).toISOString().slice(0, 13)}:00 UTC: ${count(hour.tokens)} local tokens · ${count(hour.requests)} requests` }))}
          axis={last24.length ? [`${last24[0].hour.slice(11, 13)}:00`, `${last24[Math.floor(last24.length / 2)].hour.slice(11, 13)}:00`, 'now'] : ['', '', '']}
          empty="No local inference logged in the last 24 hours."
        />
        <div className={css.legend}>
          <span>utc hour · last 24h</span><span className={css.push}>{last24Avoided != null ? `est. api value · ${money(last24Avoided)}` : 'no metered baseline'}</span>
        </div>
        <Note>ROLLING 24 HOURS FROM LOGGED LOCAL INFERENCE TIMESTAMPS, GROUPED BY UTC HOUR. API VALUE IS A COUNTERFACTUAL ESTIMATE, NOT CASH SAVED; EXCLUDES SUBSCRIPTION USE AND ELECTRICITY COST.</Note>
      </Widget>

      <div className={css.grid}>
        {weeks.length > 0 && (
          <Widget cmd="localai heatmap" label="Daily local volume" meta={`${weeks.length}w`}>
            <div className="mc-gh-heatmap-wrap">
              <div className="mc-gh-day-labels"><span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /></div>
              <div className={`mc-gh-heatmap-inner ${css.heatScroll}`}><Heatmap data={weeks} /></div>
            </div>
            <div className={css.legend}>
              <span>less</span>
              <span className="mc-heatmap-legend"><span className="scale"><span className="lvl-0" /><span className="lvl-1" /><span className="lvl-2" /><span className="lvl-3" /><span className="lvl-4" /></span></span>
              <span>more</span>
              <span className={css.push}>shades are quartiles of this series</span>
            </div>
          </Widget>
        )}
        {spark.length > 1 && (
          <Widget cmd="localai tok/s" label="Throughput trend" meta={`${count(lc.sampleCount)} samples`}>
            <Kv keyWidth="7ch">
              <KvRow k={`${spark.length}d`} v={<MiniHist values={spark} days={spark.length} label={`Daily mean tokens per second, peak ${fixed(Math.max(...spark), 0)}`} />} r={`${fixed(spark.at(-1), 0)}`} />
              <KvRow k="peak" v={<span className={css.dim}>{lc.dailyThroughput[0]?.date} → {lc.dailyThroughput.at(-1)?.date}</span>} r={`${fixed(Math.max(...spark), 0)} tok/s`} />
              <KvRow k="avg" v="" r={`${fixed(spark.reduce((s, v) => s + v, 0) / spark.length)} tok/s`} />
            </Kv>
            <Note>DAILY MEAN OF PER-TURN TOKENS/SEC. GAPS OVER 120S BETWEEN TURNS ARE TREATED AS IDLE AND EXCLUDED.</Note>
          </Widget>
        )}
      </div>
    </>
  )
}

/* ── 7 · Monthly billing history ────────────────────────────────────── */

function MonthlyBilling({ costs }: { costs: CostDashboard }) {
  const billing = costs.billing ?? []
  if (!billing.length) return null
  return (
    <>
      <Divider label="billing history" />
      <div className={css.grid}>
        {billing.map(b => {
          const real = finite(b.planAmount) && finite(b.openRouterUsd) ? b.planAmount + b.openRouterUsd : null
          const current = costs.subscription?.month === b.month
          return (
            <Widget key={b.month} cmd={`bill ${b.month}`} label={`${b.month} billing, ${b.plan}`} meta={current ? 'current' : 'previous'}>
              <Kv keyWidth="11ch">
                <KvRow k={<><ModeDot mode="subscription" /> plan</>} v={<span className={css.dim}>{b.plan.toLowerCase()} · flat</span>} r={money(b.planAmount)} />
                <KvRow k={<><ModeDot mode="metered" /> openrouter</>} v={<span className={css.dim}>metered</span>} r={b.openRouterUsd != null ? money(b.openRouterUsd) : '—'} />
              </Kv>
              <div className={css.billed}><span>billed</span><Verdict>{money(real)}</Verdict></div>
              <Kv keyWidth="7ch">
                <KvRow k="tokens" v={<span className={css.dim}>{tok(b.claudeTokens + b.codexTokens)} plan · {tok(b.apiTokens)} api · {tok(b.localTokens)} local</span>} r={tok(b.totalTokens)} />
              </Kv>
              {b.openRouterUsd == null && <p className={css.hint}>openrouter keeps no per-month history for past months</p>}
            </Widget>
          )
        })}
      </div>
    </>
  )
}

/* ── Subscription tools: real usage against the one flat plan ───────── */

/** Sum of the last `n` UTC calendar days of a `{date, tokens}` series. */
function lastDays(daily: { date: string; tokens: number }[] | undefined, n: number, now: number | null): number {
  const end = calendarEnd((daily ?? []).map(d => d.date), now)
  if (end === null) return 0
  const from = new Date(end - (n - 1) * 86_400_000).toISOString().slice(0, 10)
  return (daily ?? []).filter(d => d.date >= from).reduce((sum, d) => sum + d.tokens, 0)
}

/** The launcher's `CLAUDE  3% this week` card. Only Codex logs a provider cap
 *  snapshot, so Claude Code's verdict is honest 7-day token volume, not a percent. */
function SubscriptionTools({ costs, now }: { costs: CostDashboard; now: number | null }) {
  const days = costs.dailyWindowDays ?? 30
  const claude = costs.claudeUsage
  const codex = costs.codexUsage
  const limits = codex?.rateLimits
  const usage = [
    {
      name: 'CLAUDE',
      data: claude,
      week: lastDays(claude?.daily, 7, now),
      windowTokens: (claude?.daily ?? []).reduce((sum, day) => sum + day.tokens, 0),
      sessions: claude?.sessionsCount ?? 0,
      lastActive: [...(claude?.daily ?? [])].reverse().find(day => day.tokens > 0)?.date ?? null,
      model: claude?.models?.[0]?.model,
      tag: 'claude code · flat plan',
    },
    {
      name: 'CODEX',
      data: codex,
      week: lastDays(codex?.daily, 7, now),
      windowTokens: (codex?.daily ?? []).reduce((sum, day) => sum + day.tokens, 0),
      sessions: codex?.sessionsCount ?? 0,
      lastActive: codex?.lastActivityAt,
      model: codex?.models?.[0]?.model,
      tag: codex?.planType ? `codex cli · ${planLabel(codex.planType).toLowerCase()}` : 'codex cli',
    },
  ]
  const claudeTokens = usage[0].windowTokens
  const codexTokens = usage[1].windowTokens
  const delta = claudeTokens === 0 && codexTokens === 0
    ? 'no recent workload logged'
    : claudeTokens === codexTokens
      ? 'equal logged workload'
      : `${usage[claudeTokens > codexTokens ? 0 : 1].name.toLowerCase()} is the heavier workload`

  return (
    <>
      <Divider label="subscription tools · use & keep" />
      <div className={css.grid}>
        {usage.map(tool => {
          const hasUsage = !!tool.data?.models?.length || tool.windowTokens > 0
          const isCodex = tool.name === 'CODEX'
          const capPct = isCodex && finite(limits?.weeklyUsedPercent) ? limits!.weeklyUsedPercent! : null
          const capTone = capPct == null ? undefined : capPct >= CAP_TONE.crit ? 'crit' : capPct >= CAP_TONE.warn ? 'warn' : undefined
          return (
            <section key={tool.name} className={`mc-widget ${css.widget}`} aria-label={`${tool.name} usage`}>
              <div className={css.capHead}><h3 className={css.capTitle}>{tool.name}</h3><span className={css.dim}>{tool.tag}</span></div>
              {capPct != null
                ? <Verdict unit="this week" tone={capTone}>{`${capPct}%`}</Verdict>
                : <Verdict unit="this week">{hasUsage ? tok(tool.week) : '—'}</Verdict>}
              {isCodex && <WeeklyUsage limits={limits} now={now} />}
              {hasUsage ? (
                <Kv keyWidth="9ch" className={css.lines}>
                  <KvRow k={`${days}d`} v={<span className={css.dim}>tokens</span>} r={tok(tool.windowTokens)} />
                  <KvRow k="all-time" v={<span className={css.dim}>tokens</span>} r={tok(tool.data?.totalTokens ?? 0)} />
                  <KvRow k="sessions" v="" r={count(tool.sessions)} />
                  <KvRow k="last" v={<span className={css.dim}>active</span>} r={timeAgo(tool.lastActive, now)} />
                  <KvRow k="model" v={<span title={tool.model}>{tool.model ?? '—'}</span>} r="" />
                </Kv>
              ) : <WRow g="idle" dim>no usage logged</WRow>}
            </section>
          )
        })}
      </div>
      <p className={css.hint}>claude code {tok(claudeTokens)} · codex {tok(codexTokens)} over {days}d · {delta}</p>
    </>
  )
}

function FairUseGuard({ costs }: { costs: CostDashboard }) {
  const billing = costs.billing?.[0]
  const ceiling = billing?.fairUse?.codexTokens
  const burn = billing?.codexTokens
  if (!billing || typeof ceiling !== 'number' || !Number.isFinite(ceiling) || ceiling <= 0 || typeof burn !== 'number' || !Number.isFinite(burn) || burn < 0) return null

  const percent = burn / ceiling * 100
  const tone = percent >= CAP_TONE.crit ? 'crit' : percent >= CAP_TONE.warn ? 'warn' : undefined
  const verdict = tone === 'crit' ? 'throttle risk' : tone === 'warn' ? 'watch' : 'comfort'
  const burnDays = [...(costs.codexUsage?.daily ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const latestBurnDate = burnDays.filter(day => finite(Date.parse(`${day.date}T00:00:00Z`))).at(-1)?.date
  const burnByDate = new Map(burnDays.map(day => [day.date, day.tokens]))
  const burn14 = latestBurnDate ? Array.from({ length: 14 }, (_, index) => {
    const date = new Date(`${latestBurnDate}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - 13 + index)
    return burnByDate.get(date.toISOString().slice(0, 10)) ?? 0
  }) : []

  return (
    <>
      <Divider label="fair-use guard" />
      <Widget cmd="codex --fair-use" label="Codex monthly burn against the estimated ceiling" meta={billing.month}>
        <Verdict unit="of est. ceiling" tone={tone}>{`${fixed(percent, 0)}%`}</Verdict>
        <Kv keyWidth="7ch" className={css.lines}>
          <KvRow k="burn" v={<SegBar value={percent} autoTone={CAP_TONE} label={`Codex burn is ${fixed(percent, 0)} percent of the estimated monthly ceiling`} />} r={`${tok(burn)}/${tok(ceiling)}`} />
          {burn14.length > 0 && <KvRow k="14d" v={<MiniHist values={burn14} label="Codex tokens per day, last 14 logged days" />} r={tok(burn14.at(-1) ?? 0)} />}
          <BurnTrend codexDaily={costs.codexUsage?.daily ?? []} windowDays={7} />
        </Kv>
        <WRow g={tone === 'crit' ? 'err' : tone === 'warn' ? 'fail' : 'ok'} right={`${fixed(percent, 0)}%`}>{verdict}</WRow>
        <p className={css.hint} title={billing.fairUse.note}>estimate only · owner-adjustable in data/config.json → billing.fairUse.codexTokens</p>
        {costs.codexUsage?.rateLimits && <p className={css.hint}>weekly percent is provider-reported from codex session rate_limits</p>}
      </Widget>
    </>
  )
}

/* ── Panel ──────────────────────────────────────────────────────────── */

export function CostsPanel({ initialCosts }: { initialCosts?: CostDashboard } = {}) {
  const { data } = useLiveData()
  const now = useClock()
  const costs = data?.costs ?? initialCosts
  const localAi = useLocalAi(30_000)

  const view = useMemo(() => {
    if (!costs) return null
    const models = costs.models ?? []
    const windowDays = costs.dailyWindowDays ?? 30
    const provider = new Map(models.map(m => [m.model, m.provider]))
    const modeOf = (model: string): BillingMode => billingMode(provider.get(model) ?? '', model)

    // Windowed BILLABLE tokens per model, from the same rows the window label
    // describes and on the same basis as the column it sits next to.
    const win = new Map<string, number>()
    for (const d of costs.daily ?? []) {
      for (const [model, v] of Object.entries(d.byModel ?? {})) {
        win.set(model, (win.get(model) ?? 0) + ((v as { billable?: number })?.billable ?? 0))
      }
    }
    // Claude Code's daily rows carry only a token total, so its window figure is
    // scaled by that model's own all-time billable share rather than silently
    // reported on a different basis than the column header claims.
    const cuWin = new Map<string, number>()
    for (const d of costs.claudeUsage?.daily ?? []) {
      for (const [model, t] of Object.entries(d.byModel ?? {})) cuWin.set(model, (cuWin.get(model) ?? 0) + Number(t))
    }
    const xuWin = new Map<string, number>()
    for (const d of costs.codexUsage?.daily ?? []) {
      for (const [model, t] of Object.entries(d.byModel ?? {})) xuWin.set(model, (xuWin.get(model) ?? 0) + Number(t))
    }

    const tps = new Map((costs.localCompute?.models ?? []).map(m => [m.model, m.avgTokensPerSec]))
    const rowOf = (m: typeof models[number]): Row => ({
      name: m.model, provider: m.provider, mode: m.mode,
      billable: m.billableTokens, cache: m.cacheReadTokens, total: m.totalTokens,
      requests: m.requests, cost: m.estimatedCostUsd,
      windowBillable: win.get(m.model) ?? 0,
      tokensPerSec: tps.get(m.model),
      freeTier: /:free$/i.test(m.model),
    })

    // Claude Code lives in its own tree (~/.claude/projects) and never reaches
    // `models`, so its rows are built separately but classified the same way.
    const claudeRows: Row[] = (costs.claudeUsage?.models ?? []).map(m => {
      const billable = m.inputTokens + m.outputTokens
      const share = m.totalTokens > 0 ? billable / m.totalTokens : 0
      return {
        name: m.model.replace(/^claude-/, '').replace(/-20\d{6,}$/, ''),
        provider: 'claude code',
        mode: 'subscription' as BillingMode,
        billable, cache: m.cacheTokens, total: m.totalTokens,
        requests: null, cost: 0,
        windowBillable: Math.round((cuWin.get(m.model) ?? 0) * share),
      }
    })
    const codexRows: Row[] = (costs.codexUsage?.models ?? []).map(m => {
      const billable = m.inputTokens + m.outputTokens
      const share = m.totalTokens > 0 ? billable / m.totalTokens : 0
      return {
        name: m.model,
        provider: 'codex cli', mode: 'subscription' as BillingMode,
        billable, cache: m.cacheTokens, total: m.totalTokens,
        requests: null, cost: 0,
        windowBillable: Math.round((xuWin.get(m.model) ?? 0) * share),
      }
    })

    return {
      windowDays, modeOf,
      metered: models.filter(m => m.mode === 'metered').map(rowOf),
      subscription: [...models.filter(m => m.mode === 'subscription').map(rowOf), ...claudeRows, ...codexRows],
      local: models.filter(m => m.mode === 'local').map(rowOf),
      cloud: models.filter(m => m.mode === 'cloud-routed').map(rowOf),
    }
  }, [costs])

  if (!costs || !view) return <SkeletonPanel label="loading costs" />
  const or = costs.openRouterLive
  const nothing = !or && !costs.models?.length && !costs.claudeUsage && !costs.codexUsage && !costs.billing?.length && !costs.localCompute
  if (nothing) return <EmptyTerminal label="no billing data — set OPENROUTER_API_KEY in .env" />
  const staleLogs = (costs.freshness?.staleDays ?? 0) > 3

  return (
    <div className={`cp-panel ${css.panel}`}>
      <WRow g={staleLogs ? 'fail' : 'ok'} dim={!staleLogs} right={costs.freshness?.lastLoggedAt ? utcTimestamp(costs.freshness.lastLoggedAt) : 'unknown'}>
        {staleLogs ? 'stale · newest log' : 'newest log'}
      </WRow>
      <Divider label="what it cost" />
      <div className={css.top}>
        <ActualSpend costs={costs} />
        <LocalAiTop lc={costs.localCompute} state={localAi} />
        <MeteredSpend costs={costs} />
      </div>
      <SubscriptionTools costs={costs} now={now} />
      <FairUseGuard costs={costs} />
      <MonthlyBilling costs={costs} />

      <Divider label="what it did" />
      <Activity costs={costs} modeOf={view.modeOf} now={now} />
      <ModeBreakdown costs={costs} />
      <SourceSplit costs={costs} />
      <CodexUsage costs={costs} now={now} />

      <ModelBurnChart
        windowDays={view.windowDays}
        groups={[
          {
            title: 'METERED · PAID PER TOKEN', rows: view.metered, showCost: true, meta: `${money(costs.meteredCostUsd)} logged`,
            note: <>EVERY DOLLAR HERE IS A REAL CHARGE. &ldquo;NO PRICE LOGGED&rdquo; STILL MOVED TOKENS — THE SESSION LOG RECORDED NO COST, SO THE COLUMN TOTAL IS A FLOOR, NOT A BILL.</>,
          },
          {
            title: 'SUBSCRIPTION · COVERED BY A FLAT PLAN', rows: view.subscription, meta: `${costs.subscription?.plan ?? 'plan'} · no per-token $`,
            note: <>DELIBERATELY NO $ COLUMN. THESE LOGS DO RECORD A LIST-RATE PRICE, BUT A FLAT PLAN HAD ALREADY PAID FOR THE REQUEST — COUNTING IT AS SPEND CREATES PHANTOM COST.</>,
          },
          {
            title: 'LOCAL · RAN ON THIS MACHINE', rows: view.local, showSpeed: true, meta: 'free',
            note: <>OLLAMA LOGS NO CACHE READS, SO THESE MODELS ARE COMPARED ON BILLABLE TOKENS. AGAINST TOTALS, A CACHED API LOOP CAN OUTRANK THE RIG FOR THE SAME WORK.</>,
          },
          {
            title: 'CLOUD-ROUTED · NEITHER LOCAL NOR FREE', rows: view.cloud, meta: 'price not logged',
            note: <>OLLAMA <code>:cloud</code> MODELS EXECUTE ON OLLAMA&apos;S HARDWARE. LISTED SEPARATELY SO THEIR TOKENS ARE NOT SILENTLY UNACCOUNTED.</>,
          },
        ]}
      />

      <LocalAI costs={costs} now={now} />

      <Divider label="burn landscape · 14d" />
      <Widget cmd="costs --burn 14d" label="Daily burn by billing mode" meta="tokens / day">
        <BurnLandscape costs={costs} />
        <Note>
          STACKED BY BILLING MODE IN A FIXED ORDER; MODES SHARE A TOKEN AXIS HERE BUT ARE NEVER PRICED AGAINST EACH OTHER.
          FLAT MARKERS ARE DAYS WITH NO LOGGED ACTIVITY.
        </Note>
      </Widget>

      {(costs.warnings?.length ?? 0) > 0 && (
        <Widget cmd="costs --caveats" label="Data caveats" meta={`${costs.warnings.length}`}>
          {costs.warnings.map((w, i) => (
            <div key={i} className={css.warnRow}><Glyph g="fail" /><span>{w}</span></div>
          ))}
          {costs.freshness?.lastLoggedAt && (
            <div className={css.warnRow}><Glyph g="idle" /><span className={css.dim}>newest parsed session {utcTimestamp(costs.freshness.lastLoggedAt)} · source {costs.source}</span></div>
          )}
        </Widget>
      )}
    </div>
  )
}
