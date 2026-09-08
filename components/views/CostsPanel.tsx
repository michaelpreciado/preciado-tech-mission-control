'use client'

import { AsciiDivider } from '@/app/vf/Ascii'

import { useMemo, useState, type ReactNode } from 'react'
import { useLiveData } from '../LiveDataProvider'
import { TFrame, SectionRule, Window, EmptyTerminal, SkeletonPanel } from '../ui'
import dynamic from 'next/dynamic'
import { Heatmap } from '../Viz'
import { AsciiSpark, AsciiHeat } from '../ascii-viz'
import { CATEGORICAL, STATUS } from '@/lib/chart-colors'
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
  metered: { label: 'METERED', color: CATEGORICAL[0], note: 'billed per token' },
  subscription: { label: 'SUBSCRIPTION', color: CATEGORICAL[3], note: 'flat plan · no per-token $' },
  local: { label: 'LOCAL', color: CATEGORICAL[2], note: 'this rig · free' },
  'cloud-routed': { label: 'CLOUD-ROUTED', color: CATEGORICAL[5], note: "ollama's hardware · price not logged" },
}

function money(n?: number | null, digits = 2) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits }).format(n)
}

/** Wall-clock duration for the generation-time readout. */
function hours(sec: number): string {
  if (sec >= 3600) return `${(sec / 3600).toFixed(1)}h`
  if (sec >= 60) return `${Math.round(sec / 60)}m`
  return `${Math.round(sec)}s`
}

function tok(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function timeAgo(value?: string | null): string {
  if (!value) return '—'
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
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
  if (d <= 0) return '—'
  const p = (n / d) * 100
  if (p > 0 && p < 0.1) return '<0.1%'
  return `${p.toFixed(p < 10 ? 1 : 0)}%`
}

/** Sub-cent spend is real spend; rounding it to $0.00 makes a charged model
 *  look free, which is the exact confusion this page exists to remove. */
function spend(n: number): string {
  if (n > 0 && n < 0.01) return '<$0.01'
  return money(n)
}

/* ── Primitives ─────────────────────────────────────────────────────── */

function Stat({ value, label, sub, color = 'var(--pt-text-high)', size = 'md', glow = false }: {
  value: ReactNode; label: string; sub?: ReactNode
  color?: string; size?: 'hero' | 'lg' | 'md' | 'sm'; glow?: boolean
}) {
  const fs = size === 'hero' ? 36 : size === 'lg' ? 23 : size === 'sm' ? 14 : 17
  return (
    <TFrame><div className="cp-stat">
      <div style={{
        fontSize: fs, fontWeight: 700, lineHeight: 1.05,
        fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
        color: glow ? 'var(--pt-neon-bright)' : color,
        ...(glow ? { textShadow: 'var(--pt-glow-text)' } : {}),
      }}>{value}</div>
      <div style={{ fontSize: 7, color: 'var(--pt-text-mute)', letterSpacing: '0.18em', marginTop: 5, whiteSpace: 'nowrap' }}>{label}</div>
      {sub != null && <div style={{ fontSize: 8.5, color: 'var(--pt-text-dim)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>{sub}</div>}
    </div></TFrame>
  )
}

/** Provenance line. Every panel gets one — where the number came from and what
 *  it does not cover. Kept uniform so a caveat is never mistaken for a footnote
 *  about a different figure. */
function Note({ children }: { children: ReactNode }) {
  return (
    <div style={{
      padding: '8px 16px 11px', fontSize: 8.5, lineHeight: 1.75,
      color: 'var(--pt-text-mute)', letterSpacing: '0.06em',
      borderTop: '1px solid var(--pt-border-dim)',
    }}>{children}</div>
  )
}

function ModeDot({ mode }: { mode: BillingMode }) {
  return <span style={{
    width: 7, height: 7, borderRadius: 2, flexShrink: 0, display: 'inline-block',
    background: MODE_META[mode].color, boxShadow: `0 0 5px ${MODE_META[mode].color}99`,
  }} />
}

/* ── Table ──────────────────────────────────────────────────────────────
   One table component for every model list, so column alignment and number
   formatting cannot drift between sections. Columns are declared per section
   rather than hardcoded: a subscription table must not have a $ column at all,
   which is stronger than rendering "$0.00" and hoping it reads as "not billed". */

type Col<T> = { key: string; head: string; align?: 'left' | 'right'; render: (row: T) => ReactNode; w?: number }

function Table<T>({ cols, rows, empty }: { cols: Col<T>[]; rows: T[]; empty: string }) {
  if (!rows.length) {
    return <div style={{ padding: '16px', fontSize: 10, color: 'var(--pt-text-mute)', letterSpacing: '0.14em' }}>— {empty} —</div>
  }
  return (
    <div className="cp-tablewrap">
      <table className="cp-table">
        <thead>
          <tr>{cols.map(c => (
            <th key={c.key} style={{ textAlign: c.align ?? 'left', width: c.w }}>{c.head}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map(c => (
              <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>{c.render(r)}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Inline proportion bar for a table cell — magnitude at a glance without a
 *  second chart. Width is share-of-max within its own column only. */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <span className="cp-bar" aria-hidden>
      <span style={{ width: `${max > 0 ? Math.max(1.5, (value / max) * 100) : 0}%`, background: color }} />
    </span>
  )
}

function BurnTrendSparkline({
  codexDaily,
  windowDays,
  tone,
}: {
  codexDaily: { date: string; tokens: number }[]
  windowDays: number
  tone: string
}) {
  const series = new Map(codexDaily.map(day => [day.date, day.tokens]))
  const activeDays = [...series.entries()].sort(([a], [b]) => a.localeCompare(b))
  const latestDate = activeDays.at(-1)?.[0]
  if (!latestDate) return null

  const daysInWindow = Math.max(1, windowDays)
  const latestCalendarDate = new Date(`${latestDate}T00:00:00Z`)
  const days = Array.from({ length: daysInWindow }, (_, index) => {
    const date = new Date(latestCalendarDate)
    date.setUTCDate(latestCalendarDate.getUTCDate() - (daysInWindow - index - 1))
    const dateKey = date.toISOString().slice(0, 10)
    return [dateKey, series.get(dateKey) ?? 0] as [string, number]
  })
  const values = days.map(([, value]) => value)
  if (values.every(value => value === 0)) return null

  const width = 320
  const height = 44
  const padX = 4
  const padY = 5
  const max = Math.max(...values, 1)
  const x = (index: number) => days.length === 1 ? width / 2 : padX + (index / (days.length - 1)) * (width - padX * 2)
  const y = (value: number) => height - padY - (value / max) * (height - padY * 2)
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ')
  const areaPoints = `${padX},${height - padY} ${points} ${width - padX},${height - padY}`
  const first = values[0]
  const latest = values.at(-1) ?? 0
  const direction = latest > first ? 'up' : latest < first ? 'down' : 'flat'
  const peakIndex = values.reduce((best, value, index) => value > values[best] ? index : best, 0)
  const label = `Last ${days.length} days Codex burn against the estimated monthly ceiling, trending ${direction}, peak ${tok(values[peakIndex])} on ${days[peakIndex][0]}`

  return (
    <div className="cp-plan-band-sparkline">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <polygon points={areaPoints} fill={tone} opacity="0.12" />
        <polyline points={points} fill="none" stroke={tone} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(values.length - 1)} cy={y(latest)} r="2.5" fill={tone} />
      </svg>
    </div>
  )
}

/* ── 1 · What you actually paid ─────────────────────────────────────── */

function ActualSpend({ costs }: { costs: CostDashboard }) {
  const b = costs.billing?.[0]
  const or = costs.openRouterLive
  const lc = costs.localCompute
  const isCurrent = b && costs.subscription?.month === b.month
  const plan = b?.planAmount ?? 0
  const metered = b?.openRouterUsd ?? 0
  const total = b ? plan + metered : null

  const rate = lc?.blendedApiRatePerMTokens ?? null
  const displaced = rate != null && b ? (b.localTokens / 1_000_000) * rate : null

  const lines = [
    { label: b?.plan ?? 'plan', kind: 'subscription' as BillingMode, amount: plan, src: 'configured in data/config.json' },
    { label: 'OpenRouter', kind: 'metered' as BillingMode, amount: metered, src: 'live key billing API' },
  ]

  return (
    <Window tag="◎" title={`ACTUAL SPEND · ${b?.month ?? 'THIS MONTH'}`}
      meta={isCurrent ? 'month to date' : 'no current-month record'}>
      <div style={{ padding: '16px 16px 10px', display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Stat value={money(total)} label="TOTAL BILLED THIS MONTH" size="hero" glow />
        <div style={{ flex: '1 1 260px', minWidth: 220, paddingTop: 2 }}>
          {lines.map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              <ModeDot mode={l.kind} />
              <span style={{ color: 'var(--pt-text)' }}>{l.label}</span>
              <span style={{ color: 'var(--pt-text-mute)', fontSize: 8.5, letterSpacing: '0.08em' }}>{l.src}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--pt-text-high)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(l.amount)}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--pt-border)', marginTop: 6, paddingTop: 7, display: 'flex', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--pt-text-mute)', letterSpacing: '0.14em', fontSize: 9 }}>TOTAL</span>
            <span style={{ marginLeft: 'auto', color: STATUS.warn, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(total)}</span>
          </div>
        </div>
        {displaced != null && displaced > 0 && (
          <Stat value={money(displaced)} label="DISPLACED BY LOCAL AI" size="lg" color={CATEGORICAL[2]}
            sub={`${tok(b!.localTokens)} tokens run free`} />
        )}
      </div>
      <Note>
        THE ONLY TWO THINGS THAT MOVE MONEY: A FLAT PLAN AND METERED API USE. TOKENS PROCESSED UNDER THE PLAN
        ({tok((b?.claudeTokens ?? 0) + (b?.codexTokens ?? 0))} THIS MONTH ACROSS CLAUDE CODE + CODEX CLI) COST NOTHING EXTRA AND ARE DELIBERATELY ABSENT FROM THIS FIGURE.
        {or && <> OPENROUTER&apos;S MONTHLY NUMBER IS ITS OWN BILLING API, NOT A LOG ESTIMATE.</>}
        {displaced != null && displaced > 0 && ` DISPLACED = LOCAL TOKENS PRICED AT ${money(rate, 2)}/M, THE RATE YOUR OWN METERED USAGE IMPLIES — A COUNTERFACTUAL, NOT A REFUND.`}
      </Note>
    </Window>
  )
}

/* ── 2 · Where the volume goes, by billing mode ─────────────────────── */

function ModeBreakdown({ costs }: { costs: CostDashboard }) {
  const modes = costs.modes ?? []
  if (!modes.length) return null
  const maxBillable = Math.max(...modes.map(m => m.billableTokens), 1)

  return (
    <Window tag="▤" title="VOLUME BY BILLING MODE · ALL-TIME LOGS"
      meta="never summed across modes">
      <Table
        rows={modes}
        empty="no usage logged"
        cols={[
          {
            key: 'mode', head: 'MODE', render: m => (
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <ModeDot mode={m.mode} />
                <span style={{ color: 'var(--pt-text-high)', fontWeight: 600 }}>{MODE_META[m.mode].label}</span>
                <span className="cp-cellnote">{MODE_META[m.mode].note}</span>
              </span>
            ),
          },
          { key: 'models', head: 'MODELS', align: 'right', w: 60, render: m => m.models },
          { key: 'req', head: 'REQUESTS', align: 'right', w: 80, render: m => m.requests.toLocaleString() },
          {
            key: 'billable', head: 'BILLABLE', align: 'right', w: 150, render: m => (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                <Bar value={m.billableTokens} max={maxBillable} color={MODE_META[m.mode].color} />
                <span style={{ minWidth: 46, textAlign: 'right' }}>{tok(m.billableTokens)}</span>
              </span>
            ),
          },
          { key: 'cache', head: 'CACHE READ', align: 'right', w: 84, render: m => m.cacheReadTokens > 0 ? tok(m.cacheReadTokens) : <span style={{ color: 'var(--pt-text-mute)' }}>—</span> },
          {
            key: 'lev', head: 'LEVERAGE', align: 'right', w: 74, render: m => m.cacheReadTokens > 0
              ? <span style={{ color: CATEGORICAL[4] }}>{(m.cacheReadTokens / Math.max(1, m.billableTokens)).toFixed(1)}×</span>
              : <span style={{ color: 'var(--pt-text-mute)' }}>—</span>,
          },
          {
            key: 'cost', head: 'BILLED', align: 'right', w: 86, render: m => m.mode === 'metered'
              ? <span style={{ color: STATUS.warn, fontWeight: 600 }}>{money(m.costUsd)}</span>
              : <span style={{ color: 'var(--pt-text-mute)', fontSize: 9 }}>{m.mode === 'local' ? 'free' : m.mode === 'subscription' ? 'in plan' : 'not logged'}</span>,
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
    </Window>
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
    <Window tag="◫" title="LOCAL vs METERED vs PLAN · WHO DID THE WORK"
      meta={`${tok(totalOut)} output tokens all-time`}>
      <div style={{ padding: '14px 16px 4px', display: 'flex', gap: 30, flexWrap: 'wrap' }}>
        {rows.map(r => (
          <Stat key={r.mode} value={pct(r.outputTokens, totalOut)} label={`${MODE_META[r.mode].label} SHARE`}
            color={MODE_META[r.mode].color} size="lg" sub={`${tok(r.outputTokens)} generated`} />
        ))}
      </div>
      <Table
        rows={rows}
        empty="no usage logged"
        cols={[
          {
            key: 'm', head: 'SOURCE', render: r => (
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <ModeDot mode={r.mode} />
                <span style={{ color: 'var(--pt-text-high)', fontWeight: 600 }}>{MODE_META[r.mode].label}</span>
              </span>
            ),
          },
          {
            key: 'out', head: 'OUTPUT TOKENS', align: 'right', w: 170, render: r => (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                <Bar value={r.outputTokens} max={maxOut} color={MODE_META[r.mode].color} />
                <span style={{ minWidth: 46, textAlign: 'right' }}>{tok(r.outputTokens)}</span>
              </span>
            ),
          },
          { key: 'share', head: 'SHARE', align: 'right', w: 66, render: r => pct(r.outputTokens, totalOut) },
          { key: 'in', head: 'INPUT', align: 'right', w: 76, render: r => tok(r.inputTokens) },
          { key: 'req', head: 'REQUESTS', align: 'right', w: 82, render: r => r.requests.toLocaleString() },
          {
            key: 'avg', head: 'AVG OUT/REQ', align: 'right', w: 90,
            render: r => r.requests > 0 ? tok(Math.round(r.outputTokens / r.requests)) : <span style={{ color: 'var(--pt-text-mute)' }}>—</span>,
          },
          {
            key: 'cost', head: '$ / M OUTPUT', align: 'right', w: 96,
            render: r => r.mode === 'metered'
              ? <span style={{ color: STATUS.warn, fontWeight: 600 }}>{r.outputTokens > 0 ? money(r.costUsd / (r.outputTokens / 1_000_000)) : '—'}</span>
              : <span style={{ color: r.mode === 'local' ? CATEGORICAL[2] : 'var(--pt-text-mute)', fontSize: 9 }}>
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
    </Window>
  )
}

/* ── 3 · Metered spend + reconciliation against the real invoice ────── */

function MeteredSpend({ costs }: { costs: CostDashboard }) {
  const or = costs.openRouterLive
  if (!or) return null
  const logged = costs.meteredCostUsd ?? 0
  const cov = or.usageLifetime > 0 ? logged / or.usageLifetime : 0

  return (
    <Window tag="⬡" title="METERED SPEND · OPENROUTER" meta={or.label}>
      <div style={{ padding: '14px 16px 8px', display: 'flex', gap: 30, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Stat value={money(or.usageMonthly)} label="THIS MONTH" size="hero" color={CATEGORICAL[0]} />
        <Stat value={money(or.usageWeekly)} label="LAST 7 DAYS" size="lg" />
        <Stat value={money(or.usageDaily)} label="TODAY" size="lg" />
        <Stat value={money(or.usageLifetime)} label="LIFETIME ON THIS KEY" size="lg" color={STATUS.warn} />
        {or.limit != null && <Stat value={money(or.limitRemaining)} label="CREDIT REMAINING" size="lg" color={CATEGORICAL[2]} />}
      </div>

      <div style={{ padding: '6px 16px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--pt-text-mute)', letterSpacing: '0.12em', marginBottom: 5 }}>
          <span>LOG COVERAGE OF LIFETIME BILLING</span>
          <span style={{ color: cov < 0.5 ? STATUS.warn : 'var(--pt-text-dim)' }}>
            {money(logged)} of {money(or.usageLifetime)} · {pct(logged, or.usageLifetime)}
          </span>
        </div>
        <div style={{ height: 9, background: 'var(--pt-surface-2)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--pt-border-dim)' }}>
          <div style={{
            width: `${Math.min(100, cov * 100)}%`, height: '100%',
            background: `linear-gradient(90deg, ${CATEGORICAL[0]}77, ${CATEGORICAL[0]})`,
            boxShadow: `0 0 8px ${CATEGORICAL[0]}88`,
          }} />
        </div>
      </div>
      <Note>
        THE BAR IS NOT A BUDGET — IT IS HOW MUCH OF YOUR REAL OPENROUTER BILL THIS MACHINE&apos;S LOGS CAN SEE.
        REQUESTS MADE FROM ANY OTHER MACHINE ARE BILLED TO THIS KEY AND NEVER APPEAR HERE, SO THE LOGGED FIGURE IS
        A FLOOR. THE TWO NUMBERS ARE REPORTED SIDE BY SIDE AND NEVER ADDED.
      </Note>
    </Window>
  )
}

/* ── 4 · Per-mode model tables ──────────────────────────────────────── */

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

function ModelTable({ title, tag, rows, windowDays, showCost, showSpeed, note, meta }: {
  title: string; tag: string; rows: Row[]; windowDays: number
  showCost?: boolean; showSpeed?: boolean; note: ReactNode; meta?: string
}) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.billable - a.billable), [rows])
  const max = sorted[0]?.billable ?? 1
  const color = sorted.length ? MODE_META[sorted[0].mode].color : CATEGORICAL[0]

  const cols: Col<Row>[] = [
    {
      key: 'name', head: 'MODEL', render: r => (
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
          <ModeDot mode={r.mode} />
          <span style={{ color: 'var(--pt-text-high)', whiteSpace: 'nowrap' }}>{r.name}</span>
          {/* The same model name reaches us through more than one provider
              (gpt-5.5 arrives as both `openai` and `openai-codex`), so the
              provider is part of the row's identity, not decoration. */}
          {r.provider && <span className="cp-cellprov">{r.provider}</span>}
        </span>
      ),
    },
    {
      key: 'billable', head: 'BILLABLE', align: 'right', w: 160, render: r => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <Bar value={r.billable} max={max} color={color} />
          <span style={{ minWidth: 46, textAlign: 'right' }}>{tok(r.billable)}</span>
        </span>
      ),
    },
    { key: 'cache', head: 'CACHE READ', align: 'right', w: 84, render: r => r.cache > 0 ? tok(r.cache) : <span style={{ color: 'var(--pt-text-mute)' }}>—</span> },
    { key: 'req', head: 'REQ', align: 'right', w: 62, render: r => r.requests == null ? <span style={{ color: 'var(--pt-text-mute)' }} title="this source logs no request count">—</span> : r.requests.toLocaleString() },
  ]
  if (showSpeed) cols.push({
    key: 'tps', head: 'TOK/S', align: 'right', w: 62,
    render: r => r.tokensPerSec ? <span style={{ color: CATEGORICAL[6] }}>{r.tokensPerSec.toFixed(1)}</span> : <span style={{ color: 'var(--pt-text-mute)' }}>—</span>,
  })
  if (showCost) cols.push({
    key: 'cost', head: 'BILLED', align: 'right', w: 78,
    render: r => r.cost > 0
      ? <span style={{ color: STATUS.warn, fontWeight: 600 }}>{spend(r.cost)}</span>
      : r.freeTier
        ? <span style={{ color: CATEGORICAL[2], fontSize: 9 }}>free tier</span>
        : <span style={{ color: 'var(--pt-text-mute)', fontSize: 9 }} title="this model moved tokens but its log records no price">no price logged</span>,
  })
  cols.push({
    key: 'win', head: `${windowDays}D BILLABLE`, align: 'right', w: 92,
    render: r => r.windowBillable > 0
      ? <span style={{ color: 'var(--pt-text)' }}>{tok(r.windowBillable)}</span>
      : <span style={{ color: 'var(--pt-text-mute)', fontSize: 9 }}>idle</span>,
  })

  return (
    <Window tag={tag} title={title} meta={meta}>
      <Table cols={cols} rows={sorted} empty="no usage in the session logs" />
      <Note>{note}</Note>
    </Window>
  )
}

/* ── 5 · Activity: one bar per calendar day, colored by mode ────────── */

function Activity({ costs, modeOf }: { costs: CostDashboard; modeOf: (m: string) => BillingMode }) {
  const [hover, setHover] = useState<number | null>(null)
  const windowDays = costs.dailyWindowDays ?? 30
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
    const now = new Date()
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    return Array.from({ length: windowDays }, (_, i) => {
      const date = new Date(end - (windowDays - 1 - i) * 86_400_000).toISOString().slice(0, 10)
      const v = byDate.get(date) ?? blank()
      return { date, ...v, total: v.metered + v.subscription + v.local + v['cloud-routed'] }
    })
  }, [costs.daily, cu?.daily, xu?.daily, windowDays, modeOf])

  const max = Math.max(...days.map(d => d.total), 1)
  const active = days.filter(d => d.total > 0).length
  const totals = days.reduce((a, d) => {
    (Object.keys(MODE_META) as BillingMode[]).forEach(k => { a[k] += d[k] })
    return a
  }, { metered: 0, subscription: 0, local: 0, 'cloud-routed': 0 } as Record<BillingMode, number>)
  const grand = Object.values(totals).reduce((s, v) => s + v, 0)
  const order: BillingMode[] = ['metered', 'subscription', 'local', 'cloud-routed']

  return (
    <Window tag="▦" title={`ACTIVITY · LAST ${windowDays} DAYS`} meta={`${active} of ${windowDays} days active`}>
      <div style={{ padding: '14px 16px 6px', display: 'flex', gap: 26, flexWrap: 'wrap' }}>
        <Stat value={tok(grand)} label={`TOKENS PROCESSED · ${windowDays}D`} size="lg" glow />
        {order.filter(k => totals[k] > 0).map(k => (
          <Stat key={k} value={tok(totals[k])} label={MODE_META[k].label} color={MODE_META[k].color} size="md"
            sub={pct(totals[k], grand)} />
        ))}
      </div>
      <div style={{ padding: '4px 16px 2px' }}>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 92 }}>
          {days.map((d, i) => (
            <div key={d.date}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              title={`${d.date} · ${tok(d.total)}`}
              style={{
                flex: 1, minWidth: 3, height: '100%', display: 'flex', flexDirection: 'column',
                justifyContent: 'flex-end', cursor: 'crosshair',
                opacity: hover === null || hover === i ? 1 : 0.4, transition: 'opacity .14s',
              }}>
              {order.map(k => {
                const hgt = (d[k] / max) * 88
                return hgt > 0 ? <div key={k} style={{
                  height: Math.max(1.5, hgt),
                  background: MODE_META[k].color,
                  opacity: hover === i ? 1 : 0.78,
                }} /> : null
              })}
              {d.total === 0 && <div style={{ height: 1, background: 'var(--pt-border-dim)' }} />}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.1em', minHeight: 12 }}>
          <span>{days[0]?.date.slice(5)}</span>
          {hover !== null && days[hover] && (
            <span style={{ color: 'var(--pt-text-high)' }}>
              {days[hover].date} · {days[hover].total > 0 ? tok(days[hover].total) : 'no activity'}
              {order.filter(k => days[hover][k] > 0).map(k => ` · ${MODE_META[k].label.toLowerCase()} ${tok(days[hover][k])}`).join('')}
            </span>
          )}
          <span>{days[days.length - 1]?.date.slice(5)}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, padding: '9px 0 4px', flexWrap: 'wrap' }}>
          {order.filter(k => totals[k] > 0).map(k => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.14em' }}>
              <ModeDot mode={k} />{MODE_META[k].label}
            </span>
          ))}
        </div>
      </div>
      <Note>
        ONE COLUMN PER CALENDAR DAY — EMPTY COLUMNS ARE QUIET DAYS, NOT MISSING DATA. THIS CHART COUNTS TOTAL TOKENS
        PROCESSED (CACHE READS INCLUDED), WHICH IS WHY IT IS LABELLED PROCESSED AND CARRIES NO DOLLARS: IT MEASURES
        HOW BUSY THE STACK WAS, NOT WHAT IT COST. FROM THIS MACHINE&apos;S LOGS ONLY.
      </Note>
    </Window>
  )
}

function CodexUsage({ costs }: { costs: CostDashboard }) {
  const usage = costs.codexUsage
  if (!usage || usage.totalTokens <= 0) return null
  const max = Math.max(...usage.daily.map(day => day.tokens), 1)
  const lastActivity = usage.lastActivityAt ? usage.lastActivityAt.slice(0, 16).replace('T', ' ') + ' UTC' : '—'
  return (
    <Window tag="◇" title="CODEX CLI · FLAT PLAN USAGE" meta={usage.planType ? `${usage.planType} · tokens only` : 'tokens only'}>
      <div style={{ padding: '14px 16px 8px', display: 'flex', gap: 30, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Stat value={usage.planType?.toUpperCase() ?? 'UNKNOWN'} label="PLAN" color={CATEGORICAL[3]} size="lg" />
        <Stat value={tok(usage.totalTokens)} label="TOKENS" color={CATEGORICAL[3]} size="lg" />
        <Stat value={usage.sessionsCount.toLocaleString()} label="SESSIONS" size="lg" />
        <Stat value={lastActivity} label="LAST ACTIVITY" size="sm" />
      </div>
      <div style={{ padding: '4px 16px 12px' }}>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 54 }} aria-label="Codex daily token activity">
          {usage.daily.map(day => (
            <div key={day.date} title={`${day.date} · ${tok(day.tokens)}`} style={{ flex: 1, minWidth: 3, height: `${Math.max(2, (day.tokens / max) * 52)}px`, background: CATEGORICAL[3], opacity: 0.82 }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 8, color: 'var(--pt-text-mute)' }}>
          <span>{usage.daily[0]?.date.slice(5) ?? '—'}</span><span>{usage.daily.at(-1)?.date.slice(5) ?? '—'}</span>
        </div>
      </div>
      <Note>CODEX CLI ROLLOUT LOGS · SUBSCRIPTION USAGE IS REPORTED AS TOKENS AND NEVER AS METERED SPEND.</Note>
    </Window>
  )
}

/* ── 6 · Local AI ───────────────────────────────────────────────────── */

function heatmapWeeks(daily: { date: string; tokens: number }[], weeksBack = 14): number[][] {
  const byDate = new Map(daily.map(d => [d.date, d.tokens]))
  const nz = daily.map(d => d.tokens).filter(t => t > 0).sort((a, b) => a - b)
  const q = (p: number) => nz.length ? nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] : 0
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75)
  const lvl = (t: number) => t <= 0 ? 0 : t <= t1 ? 1 : t <= t2 ? 2 : t <= t3 ? 3 : 4
  // UTC throughout — daily[].date keys are UTC calendar dates, so building this
  // grid in local time would misalign every cell near midnight.
  const now = new Date()
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  let start = end - (weeksBack * 7 - 1) * 86_400_000
  start -= new Date(start).getUTCDay() * 86_400_000
  const days: number[] = []
  for (let t = start; t <= end; t += 86_400_000) days.push(lvl(byDate.get(new Date(t).toISOString().slice(0, 10)) ?? 0))
  const weeks: number[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}

const SPARK = '▁▂▃▄▅▆▇█'
function sparkline(v: number[]): string {
  if (!v.length) return ''
  const max = Math.max(...v, 1)
  return v.map(x => SPARK[Math.min(7, Math.floor((x / max) * 7))]).join('')
}

function LocalAI({ costs }: { costs: CostDashboard }) {
  const lc = costs.localCompute
  if (!lc) return null
  const weeks = heatmapWeeks(lc.daily)
  const spark = lc.dailyThroughput.map(d => d.avgTokensPerSec)
  const rate = lc.blendedApiRatePerMTokens

  return (
    <>
      <AsciiDivider />
      <SectionRule index={7} label="LOCAL AI · OLLAMA" />
      <Window tag="◆" title="LOCAL INFERENCE · WHAT THE RIG DID" meta={`${lc.totalRequests.toLocaleString()} requests all-time`}>
        <div style={{ padding: '14px 16px 12px', display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <Stat value={tok(lc.totalTokens)} label="TOKENS ALL-TIME" size="hero" color={CATEGORICAL[2]}
            sub={`${tok(lc.outputTokens)} generated · ${tok(lc.inputTokens)} prompt`} />
          <Stat value={lc.medianTokensPerSec != null ? lc.medianTokensPerSec.toFixed(1) : '—'} label="MEDIAN TOK/S" size="lg" color={CATEGORICAL[6]}
            sub={<>p95 {lc.p95TokensPerSec?.toFixed(1) ?? '—'} · mean {lc.avgTokensPerSec?.toFixed(1) ?? '—'}</>} />
          <Stat value={hours(lc.generationSeconds)} label="TIME SPENT GENERATING" size="lg" color={CATEGORICAL[6]}
            sub={`${lc.sampleCount.toLocaleString()} sampled turns`} />
          <Stat value={rate != null ? money(lc.costAvoidedAllTimeUsd) : '—'} label="WOULD HAVE COST, METERED" size="lg" color={CATEGORICAL[2]}
            sub={rate != null ? `at ${money(rate)}/M` : 'no metered rate to compare'} />
          <Stat value={lc.daily.length} label="ACTIVE DAYS" size="lg"
            sub={lc.busiestDay ? `peak ${tok(lc.busiestDay.tokens)} on ${lc.busiestDay.date.slice(5)}` : undefined} />
          <Stat value={lc.totalRequests > 0 ? tok(Math.round(lc.totalTokens / lc.totalRequests)) : '—'} label="AVG TOKENS / REQUEST" size="lg" />
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
      </Window>

      <div className="mc-viz-grid" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))' }}>
        {weeks.length > 0 && (
          <Window tag="▦" title="DAILY VOLUME" meta={`${weeks.length}w to today`}>
            <div className="mc-gh-heatmap-wrap">
              <div className="mc-gh-day-labels"><span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /></div>
              <div className="mc-gh-heatmap-inner"><Heatmap data={weeks} /><div className="asciiviz-inset" title="Daily volume · chronological quartile density"><AsciiHeat cells={weeks.flat()} /></div></div>
            </div>
            <div className="mc-heatmap-legend">
              <span>LESS</span>
              <span className="scale"><span className="lvl-0" /><span className="lvl-1" /><span className="lvl-2" /><span className="lvl-3" /><span className="lvl-4" /></span>
              <span>MORE</span>
              <span style={{ marginLeft: 'auto' }}>SHADES ARE QUARTILES OF THIS SERIES</span>
            </div>
          </Window>
        )}
        {spark.length > 1 && (
          <Window tag="~" title="THROUGHPUT TREND" meta={`${lc.sampleCount.toLocaleString()} samples`}>
            <div style={{ padding: '18px 14px 12px' }}>
              <div style={{ fontSize: 21, fontFamily: 'var(--font-mono)', color: CATEGORICAL[6], lineHeight: 1.2, wordBreak: 'break-all', textShadow: `0 0 8px ${CATEGORICAL[6]}55` }}>
                {sparkline(spark)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.1em' }}>
                <span>{lc.dailyThroughput[0]?.date}</span>
                <span style={{ color: CATEGORICAL[6] }}>{Math.max(...spark).toFixed(0)} peak · {(spark.reduce((s, v) => s + v, 0) / spark.length).toFixed(1)} avg tok/s</span>
                <span>{lc.dailyThroughput[lc.dailyThroughput.length - 1]?.date}</span>
              </div>
            </div>
            <Note>DAILY MEAN OF PER-TURN TOKENS/SEC. GAPS OVER 120S BETWEEN TURNS ARE TREATED AS IDLE AND EXCLUDED.</Note>
          </Window>
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
      <AsciiDivider />
      <SectionRule index={2} label="BILLING HISTORY" />
      <div className="mc-viz-grid" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
        {billing.map(b => {
          const real = b.planAmount + (b.openRouterUsd ?? 0)
          const current = costs.subscription?.month === b.month
          return (
            <Window key={b.month} tag="$" title={`${b.month} · ${b.plan.toUpperCase()}`} meta={current ? 'current' : 'previous'}>
              <div style={{ padding: '13px 16px 15px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {[
                  { k: 'plan (flat)', v: money(b.planAmount), mode: 'subscription' as BillingMode },
                  { k: 'openrouter (metered)', v: b.openRouterUsd != null ? money(b.openRouterUsd) : 'no per-month history', mode: 'metered' as BillingMode },
                ].map(r => (
                  <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                    <ModeDot mode={r.mode} />
                    <span style={{ color: 'var(--pt-text-mute)' }}>{r.k}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--pt-text-high)', fontVariantNumeric: 'tabular-nums' }}>{r.v}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--pt-border)', marginTop: 8, paddingTop: 8, display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 9, color: 'var(--pt-text-mute)', letterSpacing: '0.16em' }}>BILLED</span>
                  <span style={{ marginLeft: 'auto', fontSize: 19, fontWeight: 700, color: STATUS.warn, fontVariantNumeric: 'tabular-nums' }}>{money(real)}</span>
                </div>
                <div style={{ marginTop: 10, fontSize: 9.5, color: 'var(--pt-text-dim)', lineHeight: 1.8 }}>
                  <div>tokens · {tok(b.totalTokens)}</div>
                  <div style={{ color: 'var(--pt-text-mute)', fontSize: 9 }}>
                    {tok(b.claudeTokens + b.codexTokens)} in plan · {tok(b.apiTokens)} api · {tok(b.localTokens)} local
                  </div>
                </div>
              </div>
            </Window>
          )
        })}
      </div>
    </>
  )
}

/* ── Subscription tools: real usage against the one flat plan ───────── */

function SubscriptionTools({ costs }: { costs: CostDashboard }) {
  const days = costs.dailyWindowDays ?? 30
  const claude = costs.claudeUsage
  const codex = costs.codexUsage
  const usage = [
    {
      name: 'Claude Code',
      data: claude,
      windowTokens: (claude?.daily ?? []).reduce((sum, day) => sum + day.tokens, 0),
      sessions: claude?.sessionsCount ?? 0,
      lastActive: [...(claude?.daily ?? [])].reverse().find(day => day.tokens > 0)?.date ?? null,
      model: claude?.models?.[0]?.model,
      tag: null,
    },
    {
      name: 'Codex',
      data: codex,
      windowTokens: (codex?.daily ?? []).reduce((sum, day) => sum + day.tokens, 0),
      sessions: codex?.sessionsCount ?? 0,
      lastActive: codex?.lastActivityAt,
      model: codex?.models?.[0]?.model,
      tag: codex?.planType ? `via ${codex.planType.toLowerCase() === 'plus' ? 'ChatGPT Plus' : codex.planType}` : null,
    },
  ]
  const claudeTokens = usage[0].windowTokens
  const codexTokens = usage[1].windowTokens
  const delta = claudeTokens === codexTokens
    ? 'Equal logged workload'
    : claudeTokens === 0 && codexTokens === 0
      ? 'No recent workload logged'
      : `${usage[claudeTokens > codexTokens ? 0 : 1].name} is the heavier workload`

  return (
    <>
      <AsciiDivider />
      <SectionRule index={3} label="SUBSCRIPTION TOOLS — USE & KEEP" />
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
        {usage.map(tool => {
          const hasUsage = !!tool.data?.models?.length || tool.windowTokens > 0
          return (
            <Window key={tool.name} tag="◎" title={tool.name} meta="flat plan · usage logged locally">
              <div style={{ padding: '14px 16px 15px', fontFamily: 'var(--font-mono)', opacity: hasUsage ? 1 : 0.55 }}>
                {tool.tag && <div style={{ display: 'inline-block', padding: '3px 7px', border: '1px solid var(--pt-border)', color: CATEGORICAL[3], fontSize: 8, letterSpacing: '0.12em', marginBottom: 9 }}>{tool.tag}</div>}
                {hasUsage ? (
                  <>
                    <Stat value={tok(tool.windowTokens)} label={`${days}-DAY TOKENS`} size="hero" glow />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 18px', marginTop: 15, fontSize: 9.5, color: 'var(--pt-text-dim)', lineHeight: 1.55 }}>
                      <div><span style={{ color: 'var(--pt-text-mute)', display: 'block', fontSize: 8, letterSpacing: '0.12em' }}>ALL-TIME TOKENS</span>{tok(tool.data?.totalTokens ?? 0)}</div>
                      <div><span style={{ color: 'var(--pt-text-mute)', display: 'block', fontSize: 8, letterSpacing: '0.12em' }}>SESSIONS</span>{tool.sessions.toLocaleString()}</div>
                      <div><span style={{ color: 'var(--pt-text-mute)', display: 'block', fontSize: 8, letterSpacing: '0.12em' }}>LAST ACTIVE</span>{timeAgo(tool.lastActive)}</div>
                      <div><span style={{ color: 'var(--pt-text-mute)', display: 'block', fontSize: 8, letterSpacing: '0.12em' }}>TOP MODEL</span><span style={{ overflowWrap: 'anywhere' }}>{tool.model ?? '—'}</span></div>
                    </div>
                  </>
                ) : <div style={{ padding: '22px 0', fontSize: 10, color: 'var(--pt-text-mute)', letterSpacing: '0.12em' }}>— NO USAGE LOGGED —</div>}
              </div>
            </Window>
          )
        })}
      </div>
      <div style={{ padding: '9px 16px 12px', color: 'var(--pt-text-dim)', fontFamily: 'var(--font-mono)', fontSize: 9.5, borderBottom: '1px solid var(--pt-border-dim)' }}>
        Claude Code: {tok(claudeTokens)} tokens · Codex: {tok(codexTokens)} · {delta}
      </div>
    </>
  )
}

function FairUseGuard({ costs }: { costs: CostDashboard }) {
  const billing = costs.billing?.[0]
  const ceiling = billing?.fairUse?.codexTokens
  const burn = billing?.codexTokens
  if (!billing || typeof ceiling !== 'number' || !Number.isFinite(ceiling) || ceiling <= 0 || typeof burn !== 'number' || !Number.isFinite(burn) || burn < 0) return null
  const ceilingValue = ceiling
  const burnValue = burn

  const ratio = burnValue / ceilingValue
  const percent = ratio * 100
  const tone = percent >= 90 ? 'var(--pt-error)' : percent >= 70 ? 'var(--pt-warn)' : CATEGORICAL[4]
  const verdict = percent >= 90 ? 'THROTTLE RISK' : percent >= 70 ? 'WATCH' : 'COMFORT'
  const daily = (costs.codexUsage?.daily ?? []).slice(-7)
  const burnDays = [...(costs.codexUsage?.daily ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const latestBurnDate = burnDays.at(-1)?.date
  const burnByDate = new Map(burnDays.map(day => [day.date, day.tokens]))
  const burn14 = latestBurnDate ? Array.from({ length: 14 }, (_, index) => {
    const date = new Date(`${latestBurnDate}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - 13 + index)
    return burnByDate.get(date.toISOString().slice(0, 10)) ?? 0
  }) : []
  const maxDaily = Math.max(...daily.map(day => day.tokens), 1)

  return (
    <>
      <AsciiDivider />
      <SectionRule index={4} label="FAIR-USE GUARD" />
      <div className="cp-fairuse" title={billing.fairUse.note}>
        <div className="cp-fairuse-main">
          <div className="cp-plan-band-head">
            <span>CODEX MONTHLY BURN</span>
            <span>{tok(burnValue)} of {tok(ceilingValue)} estimate · {percent.toFixed(0)}%{burn14.length > 0 && <span className="asciiviz-burn" title="Last 14 days through latest logged date · Codex tokens"><span className="asciiviz-caption">14D TOKENS </span><AsciiSpark data={burn14} width={14} /></span>}</span>
          </div>
          <div className="cp-plan-band-track" role="img" aria-label={`Codex burn is ${percent.toFixed(0)} percent of the estimated monthly ceiling`}>
            <span style={{ width: `${Math.min(100, ratio * 100)}%`, background: tone }} />
          </div>
          <BurnTrendSparkline codexDaily={costs.codexUsage?.daily ?? []} windowDays={7} tone={tone} />
          <div className="cp-fairuse-verdict" style={{ color: tone }}>{verdict} · {percent.toFixed(0)}% of estimated ceiling</div>
          <div className="cp-plan-band-hint">estimate only · owner-adjustable in data/config.json → billing.fairUse.codexTokens</div>
        </div>
        <div className="cp-fairuse-trend" aria-label="Codex daily token cadence for the last 7 days">
          <div className="cp-fairuse-trend-label">7-DAY CADENCE</div>
          <div className="cp-fairuse-ticks">
            {daily.map(day => (
              <span key={day.date} title={`${day.date}: ${tok(day.tokens)} tokens`} style={{ height: `${Math.max(8, (day.tokens / maxDaily) * 100)}%`, background: tone }} />
            ))}
          </div>
          <div className="cp-fairuse-trend-dates"><span>{daily[0]?.date.slice(5) ?? '—'}</span><span>{daily.at(-1)?.date.slice(5) ?? '—'}</span></div>
        </div>
      </div>
    </>
  )
}

/* ── Panel ──────────────────────────────────────────────────────────── */

export function CostsPanel({ initialCosts }: { initialCosts?: CostDashboard } = {}) {
  const { data } = useLiveData()
  const costs = data?.costs ?? initialCosts

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
  const nothing = !or && !costs.models?.length && !costs.claudeUsage && !costs.codexUsage
  if (nothing) return <EmptyTerminal label="no billing data — set OPENROUTER_API_KEY in .env" />

  return (
    <div className="cp-panel v4-group">
      <AsciiDivider />
      <SectionRule index={1} label="WHAT IT COST" />
      <ActualSpend costs={costs} />
      <MeteredSpend costs={costs} />
      <MonthlyBilling costs={costs} />
      <SubscriptionTools costs={costs} />
      <FairUseGuard costs={costs} />

      <AsciiDivider />
      <SectionRule index={5} label="WHAT IT DID" />
      <Activity costs={costs} modeOf={view.modeOf} />
      <ModeBreakdown costs={costs} />
      <SourceSplit costs={costs} />
      <CodexUsage costs={costs} />

      <AsciiDivider />
      <SectionRule index={6} label="MODELS · RANKED ON BILLABLE TOKENS" />
      {view.metered.length > 0 && (
        <ModelTable tag="◆" title="METERED · PAID PER TOKEN" rows={view.metered} windowDays={view.windowDays} showCost
          meta={`${money(costs.meteredCostUsd)} logged`}
          note={<>EVERY DOLLAR HERE IS A REAL CHARGE. A ROW READING &ldquo;NO PRICE LOGGED&rdquo; STILL MOVED TOKENS — THE SESSION LOG
            SIMPLY RECORDED NO COST FOR IT, SO THE COLUMN TOTAL IS A FLOOR, NOT A BILL.</>} />
      )}
      {view.subscription.length > 0 && (
        <ModelTable tag="◆" title="SUBSCRIPTION · COVERED BY A FLAT PLAN" rows={view.subscription} windowDays={view.windowDays}
          meta={`${costs.subscription?.plan ?? 'plan'} · no per-token $`}
          note={<>DELIBERATELY NO $ COLUMN. THESE LOGS DO RECORD A LIST-RATE PRICE, BUT A FLAT PLAN HAD ALREADY PAID FOR THE
            REQUEST — COUNTING IT AS SPEND IS WHAT PUT {money(costs.modes?.reduce((s, m) => s + m.notionalCostUsd, 0) ?? 0)} OF
            PHANTOM COST ON THIS PAGE.</>} />
      )}
      {view.local.length > 0 && (
        <ModelTable tag="◆" title="LOCAL · RAN ON THIS MACHINE" rows={view.local} windowDays={view.windowDays} showSpeed
          meta="free"
          note={<>NO CACHE COLUMN VALUES BECAUSE OLLAMA LOGS NO CACHE READS AT ALL — WHICH IS EXACTLY WHY THESE MODELS MUST BE
            COMPARED ON BILLABLE TOKENS. AGAINST TOTALS, A CACHED API LOOP OUTRANKS THE RIG 27× FOR THE SAME WORK.</>} />
      )}
      {view.cloud.length > 0 && (
        <ModelTable tag="◆" title="CLOUD-ROUTED · NEITHER LOCAL NOR FREE" rows={view.cloud} windowDays={view.windowDays}
          meta="price not logged"
          note={<>OLLAMA `:cloud` MODELS EXECUTE ON OLLAMA&apos;S HARDWARE. THEY LOG A $0 COST, WHICH MAKES THEM INVISIBLE ON THE
            PAID SIDE, AND THEY ARE NOT THIS RIG, WHICH KEEPS THEM OUT OF THE LOCAL FIGURES. LISTED SEPARATELY SO THE TOKENS
            ARE NOT SILENTLY UNACCOUNTED.</>} />
      )}

      <LocalAI costs={costs} />

      <AsciiDivider />
      <SectionRule index={8} label="BURN LANDSCAPE · LAST 14 DAYS" />
      <Window tag="▦" title="DAILY BURN · BY BILLING MODE" meta="tokens processed per day">
        <BurnLandscape costs={costs} />
        <Note>
          AXONOMETRIC PROJECTION — NO VANISHING POINT, SO A UNIT OF HEIGHT IS THE SAME NUMBER OF PIXELS FOR THE NEAREST
          COLUMN AND THE FARTHEST. THE PERSPECTIVE RENDER THIS REPLACES FORESHORTENED, WHICH MADE CLOSER DAYS LOOK
          BIGGER THAN IDENTICAL FAR ONES, AND IT CARRIED NO AXIS AT ALL. FLAT TILES ARE DAYS WITH NO LOGGED ACTIVITY.
        </Note>
      </Window>

      {(costs.warnings?.length ?? 0) > 0 && (
        <Window tag="⚠" title="DATA CAVEATS" meta={`${costs.warnings.length}`}>
          <div style={{ padding: '10px 16px 12px' }}>
            {costs.warnings.map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 9, padding: '5px 0', fontSize: 10, color: 'var(--pt-text-dim)', lineHeight: 1.6 }}>
                <span style={{ color: STATUS.warn, flexShrink: 0 }}>⚠</span><span>{w}</span>
              </div>
            ))}
            {costs.freshness?.lastLoggedAt && (
              <div style={{ display: 'flex', gap: 9, padding: '5px 0', fontSize: 10, color: 'var(--pt-text-mute)' }}>
                <span style={{ flexShrink: 0 }}>◷</span>
                <span>newest parsed session {costs.freshness.lastLoggedAt.slice(0, 16).replace('T', ' ')} UTC · source {costs.source}</span>
              </div>
            )}
          </div>
        </Window>
      )}
    </div>
  )
}
