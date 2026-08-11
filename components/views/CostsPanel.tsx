'use client'

import { useState, type ReactNode } from 'react'
import { useLiveData } from '../LiveDataProvider'
import { SectionHead, Window, EmptyTerminal, SkeletonPanel } from '../ui'
import { StackedBarChart } from '../Viz'
import { CATEGORICAL, STATUS } from '@/lib/chart-colors'
import type { CostDashboard, ModelUsage } from '@/lib/types'

function money(n?: number) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

/* ── Costs Panel ──────────────────────────────────────── */

/* Color follows the entity, never its rank: each provider/model family keeps
   its categorical slot so a filter that drops a series never repaints the
   survivors. Slots are assigned in fixed order and never cycled. */
const CLAUDE_COLORS: Record<string, string> = {
  'claude-opus': CATEGORICAL[3],   // violet
  'claude-sonnet': CATEGORICAL[0], // blue
  'claude-haiku': CATEGORICAL[4],  // teal
}

const PROVIDER_COLORS: Record<string, string> = {
  'ollama': CATEGORICAL[2],       // lime
  'openrouter': CATEGORICAL[0],   // blue
  'openai-codex': CATEGORICAL[5], // orange
  'openclaw': CATEGORICAL[6],     // sky
  'together': CATEGORICAL[1],     // magenta
  'claude': CATEGORICAL[3],       // violet
}

/** Fallback for an unrecognized provider/model — muted, so it reads as "other". */
const OTHER_COLOR = 'var(--pt-text-mute)'

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

/* Scope/coverage caveats. The $ figures and the token figures come from two
   different sources over two different windows — say so wherever they sit in
   the same pane, otherwise they read as one reconciled number. */
function ScopeNote({ children }: { children: ReactNode }) {
  return (
    <div style={{
      padding: '7px 16px 10px', fontSize: 8, lineHeight: 1.6,
      color: 'var(--pt-text-mute)', letterSpacing: '0.1em',
    }}>
      {children}
    </div>
  )
}

/* ── Statistic block ────────────────────────────────────
   Centralized value + tracked label pair so every readout row across the
   panel shares one alignment + type scale. The hero figure is a `Stat`
   with size="hero" + glow; the accent color is always passed inline so a
   stat never leaks another metric's hue. */
function Stat({ value, label, color = 'var(--pt-text-high)', size = 'md', align = 'left', glow = false }: {
  value: ReactNode
  label: string
  color?: string
  size?: 'hero' | 'lg' | 'md'
  align?: 'left' | 'right'
  glow?: boolean
}) {
  const fs = size === 'hero' ? 34 : size === 'lg' ? 22 : 17
  return (
    <div className="cp-stat" data-align={align} style={{ textAlign: align }}>
      <div style={{
        fontSize: fs, fontWeight: 700, lineHeight: 1,
        fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
        color: glow ? 'var(--pt-neon-bright)' : color,
        ...(glow ? { textShadow: 'var(--pt-glow-text)' } : {}),
      }}>
        {value}
      </div>
      <div style={{ fontSize: 7, color: 'var(--pt-text-mute)', letterSpacing: '0.18em', marginTop: 4, whiteSpace: 'nowrap' }}>
        {label}
      </div>
    </div>
  )
}

/** Days actually present in a daily series — the real window behind "30D" labels. */
function loggedDays(daily?: { date: string }[]): number {
  return (daily ?? []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date)).length
}

/** "LAST 30 DAYS" only when 30 days are really there; otherwise state the truth. */
function windowLabel(n: number): string {
  return n >= 30 ? 'LAST 30 DAYS' : `${n} LOGGED DAYS`
}

function claudeModelColor(model: string): string {
  for (const [key, color] of Object.entries(CLAUDE_COLORS)) {
    if (model.includes(key)) return color
  }
  return OTHER_COLOR
}

function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8,}$/, '').replace(/-20\d+$/, '')
}

function providerColor(provider: string): string {
  for (const [key, color] of Object.entries(PROVIDER_COLORS)) {
    if (provider.toLowerCase().includes(key)) return color
  }
  return OTHER_COLOR
}

function shortProvider(provider: string): string {
  return provider.replace(/^openrouter$/, 'OR').replace(/^openai-codex$/, 'OpenAI').replace(/^ollama$/, 'Ollama').replace(/^openclaw$/, 'OClaw')
}

/* ── Ranked model leaderboard (monthly) ── */
function ModelLeaderboard({ rows, color, emptyLabel = 'no usage in the last 30 days' }: {
  rows: { name: string; tokens: number; cost?: number; requests?: number }[]
  color: string
  emptyLabel?: string
}) {
  const sorted = [...rows].filter(r => r.tokens > 0).sort((a, b) => b.tokens - a.tokens).slice(0, 10)
  if (!sorted.length) {
    return <div style={{ padding: '14px', fontSize: 10, color: 'var(--pt-text-mute)', letterSpacing: '0.16em' }}>— {emptyLabel} —</div>
  }
  const max = sorted[0].tokens
  const totalTokens = sorted.reduce((s, r) => s + r.tokens, 0)
  const RANK_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32']
  return (
    <div style={{ padding: '6px 14px 10px' }}>
      {sorted.map((r, i) => {
        const rankColor = RANK_COLORS[i] ?? 'var(--pt-text-mute)'
        const pct = totalTokens ? ((r.tokens / totalTokens) * 100).toFixed(1) : '0'
        return (
          <div key={r.name} style={{ padding: '7px 0', borderBottom: i < sorted.length - 1 ? '1px dashed var(--pt-border-dim)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, width: 22, flexShrink: 0,
                color: rankColor, textShadow: i < 3 ? `0 0 6px ${rankColor}66` : 'none',
              }}>#{i + 1}</span>
              <span style={{ fontSize: 11, color: 'var(--pt-text-high)', fontFamily: 'var(--font-mono)', fontWeight: i === 0 ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--pt-text)', fontFamily: 'var(--font-mono)', fontWeight: 600, flexShrink: 0 }}>
                {fmtTokens(r.tokens)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 30 }}>
              <div style={{ flex: 1, height: 5, background: 'rgba(3,8,20,0.8)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--pt-border-dim)' }}>
                <div style={{ width: `${(r.tokens / max) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${color}44, ${color})`, boxShadow: `0 0 6px ${color}55`, borderRadius: '0 3px 3px 0', transition: 'width 0.5s ease' }} />
              </div>
              <span style={{ fontSize: 8, color: 'var(--pt-text-mute)', width: 80, textAlign: 'right', letterSpacing: '0.06em', flexShrink: 0 }}>
                {pct}%{typeof r.requests === 'number' && r.requests > 0 ? ` · ${r.requests} req` : ''}{typeof r.cost === 'number' && r.cost > 0 ? ` · ${money(r.cost)}` : ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── 30-day burn hero — stacked daily bars: api / claude code / local ── */
function MonthlyBurnHero({ costs }: { costs: CostDashboard }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const cu = costs.claudeUsage
  const or = costs.openRouterLive
  const providerOf = (model: string) =>
    (costs.models ?? []).find(m => m.model === model)?.provider ?? 'unknown'

  // Merge agent-session days and claude-code days into one 30-day series,
  // split into local (ollama) / api (everything else) / claude code.
  const byDate = new Map<string, { local: number; api: number; claude: number }>()
  for (const d of costs.daily ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
    const slot = byDate.get(d.date) ?? { local: 0, api: 0, claude: 0 }
    for (const [model, v] of Object.entries(d.byModel ?? {})) {
      const tokens = typeof v === 'object' ? (v as { tokens?: number }).tokens ?? 0 : 0
      if (providerOf(model) === 'ollama') slot.local += tokens
      else slot.api += tokens
    }
    byDate.set(d.date, slot)
  }
  for (const d of cu?.daily ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
    const slot = byDate.get(d.date) ?? { local: 0, api: 0, claude: 0 }
    slot.claude += d.tokens
    byDate.set(d.date, slot)
  }
  const days = [...byDate.entries()]
    .map(([date, v]) => ({ date, ...v, total: v.local + v.api + v.claude }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)

  const totalMonth = days.reduce((s, d) => s + d.total, 0)
  const claudeMonth = days.reduce((s, d) => s + d.claude, 0)
  const localMonth = days.reduce((s, d) => s + d.local, 0)
  const apiMonth = days.reduce((s, d) => s + d.api, 0)
  const maxDay = Math.max(...days.map(d => d.total), 1)

  const SEG = [
    { key: 'api' as const, label: 'API', color: CATEGORICAL[0] },
    { key: 'claude' as const, label: 'CLAUDE CODE', color: CATEGORICAL[3] },
    { key: 'local' as const, label: 'LOCAL', color: CATEGORICAL[2] },
  ]

  // The headline number sums exactly these days, so the label has to name them.
  const n = days.length
  const span = n ? `${days[0].date} → ${days[n - 1].date}` : ''

  return (
    <Window tag="◎" title={`TOKEN BURN · ${windowLabel(n)}`}
      meta={or ? `openrouter billed ${money(or.usageMonthly)} this month` : undefined}>
      <div style={{ padding: '14px 16px 8px', display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Stat value={fmtTokens(totalMonth)}
          label={`TOKENS BURNED · ${n >= 30 ? '30D' : `${n}D`}`} size="hero" glow />
        {[
          { label: 'API', value: fmtTokens(apiMonth), color: CATEGORICAL[0] },
          { label: 'CLAUDE CODE', value: fmtTokens(claudeMonth), color: CATEGORICAL[3] },
          { label: 'LOCAL · FREE', value: fmtTokens(localMonth), color: CATEGORICAL[2] },
          ...(or ? [{ label: 'OPENROUTER $/MO', value: money(or.usageMonthly), color: STATUS.warn }] : []),
        ].map(s => (
          <Stat key={s.label} value={s.value} label={s.label} color={s.color} />
        ))}
      </div>

      <div style={{ padding: '10px 16px 4px' }}>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 86 }}>
          {days.map((d, i) => {
            const isHovered = hovered === i
            return (
              <div key={d.date}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                style={{ flex: 1, minWidth: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'crosshair', opacity: hovered === null || isHovered ? 1 : 0.45, transition: 'opacity 0.15s' }}>
                {SEG.map(seg => {
                  const h = (d[seg.key] / maxDay) * 82
                  return h > 0 ? (
                    <div key={seg.key} style={{
                      height: Math.max(1.5, h),
                      background: `linear-gradient(to top, ${seg.color}${isHovered ? 'ee' : '88'}, ${seg.color}${isHovered ? 'aa' : '44'})`,
                      boxShadow: isHovered ? `0 0 6px ${seg.color}66` : 'none',
                    }} />
                  ) : null
                })}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 7, color: 'var(--pt-text-mute)', letterSpacing: '0.1em' }}>
          <span>{days[0]?.date.slice(5)}</span>
          {hovered !== null && days[hovered] && (
            <span style={{ color: 'var(--pt-text-high)' }}>
              {days[hovered].date} · {fmtTokens(days[hovered].total)}
              {days[hovered].api > 0 && ` · api ${fmtTokens(days[hovered].api)}`}
              {days[hovered].claude > 0 && ` · claude ${fmtTokens(days[hovered].claude)}`}
              {days[hovered].local > 0 && ` · local ${fmtTokens(days[hovered].local)}`}
            </span>
          )}
          <span>{days[days.length - 1]?.date.slice(5)}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, padding: '8px 0 10px' }}>
          {SEG.map(seg => (
            <span key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.14em' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, boxShadow: `0 0 5px ${seg.color}88` }} />
              {seg.label}
            </span>
          ))}
        </div>
      </div>
      <ScopeNote>
        {n < 30 && <>PARTIAL COVERAGE — only {n} days logged ({span}), not a full 30-day window.<br /></>}
        TOKENS FROM LOCAL SESSION LOGS ON THIS MACHINE ONLY — MAY UNDERCOUNT. $ FROM THE OPENROUTER BILLING API.
      </ScopeNote>
    </Window>
  )
}

/* ── BURN-vs-COST header strip (P3) ─────────────────────
   The one-glance answer to "what is this costing / saving me".
   Real cost = Claude plan + OpenRouter billed for the current month.
   Local savings = the local (Ollama) tokens this month × what they'd have
   cost if sent to an API at a rough $2.50/M input-ish blended rate. The
   blended rate is deliberately conservative and labeled — a framing aid,
   not a bill. */
function BurnVsCost({ costs }: { costs: CostDashboard }) {
  const billing = costs.billing?.[0]
  const subMonth = costs.subscription?.month
  const isCurrent = billing && subMonth === billing.month
  const realCost = billing ? (billing.planAmount + (billing.openRouterUsd ?? 0)) : null

  const cu = costs.claudeUsage
  const or = costs.openRouterLive

  // Local tokens this month (from the daily series).
  const providerOf = (model: string) => (costs.models ?? []).find(m => m.model === model)?.provider ?? 'unknown'
  let localMonthTokens = 0
  const dayCount = loggedDays(costs.daily)
  for (const d of costs.daily ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
    for (const [model, v] of Object.entries(d.byModel ?? {})) {
      if (providerOf(model) === 'ollama') {
        localMonthTokens += typeof v === 'object' ? (v as { tokens?: number }).tokens ?? 0 : 0
      }
    }
  }
  const localSaved = localMonthTokens * 2.5 / 1_000_000 // $2.50 / M blended

  const orTokens = or ? ` · OR ${money(or.usageMonthly)}` : ''
  const planToken = cu?.totalTokens ? `${fmtTokens(cu.totalTokens)} claude` : ''

  return (
    <Window tag="◎" title="BURN vs COST · THIS MONTH" meta={`${billing?.plan.toUpperCase() ?? 'plan'}${orTokens}`}>
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Stat
            value={realCost != null ? money(realCost) : '—'}
            label={`TOTAL REAL COST ${isCurrent ? '· THIS MONTH' : ''}`}
            size="hero" glow color={STATUS.warn}
          />
          <Stat
            value={localMonthTokens ? money(localSaved) : '—'}
            label={`LOCAL AI SAVED · ${fmtTokens(localMonthTokens)} FREE TOKENS`}
            size="lg" color={CATEGORICAL[2]}
          />
          <Stat
            value={localMonthTokens ? `%${Math.round((localSaved / Math.max(1, (realCost ?? localSaved))) * 100)}` : '—'}
            label="OF REAL COST OFFSET"
            size="lg" color={CATEGORICAL[2]}
          />
        </div>
        <ScopeNote>
          {isCurrent
            ? `REAL COST = CLAUDE ${billing.plan.toUpperCase()} PLAN ${money(billing.planAmount)} + OPENROUTER BILLED ${billing.openRouterUsd != null ? money(billing.openRouterUsd) : 'n/a'}.`
            : 'NO CURRENT-MONTH BILLING RECORD (only historical plans).'}
          {localMonthTokens > 0
            ? ` LOCAL SAVINGS = ${fmtTokens(localMonthTokens)} local tokens × $2.50/M blended (conservative API-equivalent) — NEVER billed.`
            : ' NO LOCAL TOKENS THIS MONTH IN LOGGED WINDOW.'}
          {planToken ? ` ${planToken} covered by the fixed subscription (no per-token $).` : ''}
        </ScopeNote>
      </div>
    </Window>
  )
}

/* ── Monthly billing reconciliation: plan + real cost per month ── */
function MonthlyBilling({ costs }: { costs: CostDashboard }) {
  const billing = costs.billing ?? []
  if (!billing.length) return null
  const subMonth = costs.subscription?.month
  return (
    <>
      <SectionHead label="MONTHLY BILLING · PLAN & REAL COST" />
      <div className="mc-viz-grid" style={{ display: 'grid', gap: 16, gridTemplateColumns: `repeat(${Math.min(billing.length, 2)}, minmax(0, 1fr))` }}>
        {billing.map(b => {
          const or = b.openRouterUsd
          const realCost = b.planAmount + (or ?? 0)
          const isCurrent = subMonth === b.month
          return (
            <Window key={b.month} tag="$" title={`${b.month} · ${b.plan.toUpperCase()}`}
              meta={isCurrent ? 'current plan' : 'previous month'}>
              <div style={{ padding: '12px 16px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--pt-text-mute)', letterSpacing: '0.16em' }}>CLAUDE PLAN</span>
                  <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: CATEGORICAL[isCurrent ? 3 : 0] }}>{money(b.planAmount)}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--pt-text-dim)', lineHeight: 1.85, marginTop: 4 }}>
                  <div><span style={{ color: 'var(--pt-text-mute)' }}>plan</span> · {b.plan}</div>
                  <div><span style={{ color: 'var(--pt-text-mute)' }}>tokens</span> · {fmtTokens(b.totalTokens)} <span style={{ color: 'var(--pt-text-mute)', fontSize: 9 }}>({fmtTokens(b.claudeTokens)} claude · {fmtTokens(b.apiTokens)} api · {fmtTokens(b.localTokens)} local)</span></div>
                  <div><span style={{ color: 'var(--pt-text-mute)' }}>openrouter billed</span> · {or != null ? money(or) : <span style={{ fontSize: 9 }}>n/a (key API has no per-month history)</span>}</div>
                  <div><span style={{ color: 'var(--pt-text-mute)' }}>logged session cost</span> · {money(b.logCost)}</div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--pt-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 9, color: 'var(--pt-text-mute)', letterSpacing: '0.18em' }}>REAL MONTH COST</span>
                  <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: STATUS.warn }}>≈ {money(realCost)}</span>
                </div>
              </div>
            </Window>
          )
        })}
      </div>
    </>
  )
}

export function CostsPanel({ initialCosts }: { initialCosts?: CostDashboard } = {}) {
  const { data } = useLiveData()
  const costs = data?.costs ?? initialCosts
  if (!costs) return <SkeletonPanel label="loading costs" />

  const or = costs.openRouterLive
  const cu = costs.claudeUsage
  const allModels = costs.models ?? []

  // Separate by provider type
  const ollamaModels = allModels.filter(m => m.provider === 'ollama')
  const paidModels = allModels.filter(m => m.estimatedCostUsd > 0)
  const maxCost = Math.max(...paidModels.map(m => m.estimatedCostUsd), 1)

  // Ollama totals
  const ollamaTotalTokens = ollamaModels.reduce((s, m) => s + m.totalTokens, 0)
  const ollamaTotalRequests = ollamaModels.reduce((s, m) => s + m.requests, 0)

  // ── Per-model aggregates from the daily series (up to 30 days, often fewer) ──
  const dayCount = loggedDays(costs.daily)
  const claudeDayCount = loggedDays(cu?.daily)
  const providerOf = (model: string) => allModels.find(m => m.model === model)?.provider ?? 'unknown'
  const monthlyByModel = new Map<string, { tokens: number; cost: number }>()
  for (const d of costs.daily ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
    for (const [model, v] of Object.entries(d.byModel ?? {})) {
      const tokens = typeof v === 'object' ? (v as { tokens?: number }).tokens ?? 0 : 0
      const cost = typeof v === 'object' ? (v as { cost?: number }).cost ?? 0 : 0
      const cur = monthlyByModel.get(model) ?? { tokens: 0, cost: 0 }
      cur.tokens += tokens; cur.cost += cost
      monthlyByModel.set(model, cur)
    }
  }
  const requestsOf = (model: string) => allModels.find(m => m.model === model)?.requests
  const orMonthlyRows = [...monthlyByModel.entries()]
    .filter(([model]) => /openrouter/i.test(`${providerOf(model)} ${model}`))
    .map(([model, v]) => ({ name: model.split('/').slice(-2).join('/'), tokens: v.tokens, cost: v.cost, requests: requestsOf(model) }))
  const ollamaMonthlyRows = [...monthlyByModel.entries()]
    .filter(([model]) => providerOf(model) === 'ollama')
    .map(([model, v]) => ({ name: model, tokens: v.tokens, requests: requestsOf(model) }))
  const orMonthlyTokens = orMonthlyRows.reduce((s, r) => s + r.tokens, 0)
  const ollamaMonthlyTokens = ollamaMonthlyRows.reduce((s, r) => s + r.tokens, 0)

  const claudeMonthlyByModel = new Map<string, number>()
  for (const d of cu?.daily ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
    for (const [model, tokens] of Object.entries(d.byModel ?? {})) {
      claudeMonthlyByModel.set(model, (claudeMonthlyByModel.get(model) ?? 0) + Number(tokens))
    }
  }
  const claudeMonthlyRows = [...claudeMonthlyByModel.entries()]
    .map(([model, tokens]) => ({ name: shortModel(model), tokens }))
  const claudeMonthlyTokens = claudeMonthlyRows.reduce((s, r) => s + r.tokens, 0)

  // Claude daily token chart
  const cuDaily = cu?.daily ?? []
  const cuTopModels = (cu?.models ?? []).slice(0, 4)
  const cuStackedDaily = cuDaily.map(d => ({
    label: d.date.slice(5),
    segments: cuTopModels.map(m => ({
      key: m.model,
      value: d.byModel?.[m.model] ?? 0,
      color: claudeModelColor(m.model),
    })),
  }))

  return (
    <div className="cp-panel">
      {/* ── 30-DAY BURN HERO ── */}
      <MonthlyBurnHero costs={costs} />

      {/* ── MONTHLY BILLING · PLAN & REAL COST ── */}
      <MonthlyBilling costs={costs} />

      {/* ── OpenRouter: monthly billing + model leaderboard ── */}
      {(or || orMonthlyRows.length > 0) && (
        <>
          <SectionHead label="OPENROUTER · MONTHLY" />
          {or && (
            <Window tag="⬡" title="OPENROUTER · LIVE BILLING"
              meta={or.limit != null ? `${Math.round((or.usageMonthly / or.limit) * 100)}% of $${or.limit} limit` : 'no limit'}>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <Stat value={money(or.usageMonthly)} label="THIS MONTH" color={CATEGORICAL[0]} size="hero" />
                  <Stat value={fmtTokens(orMonthlyTokens)}
                    label={`TOKENS · ${dayCount >= 30 ? '30D' : `${dayCount}D LOGGED`}`} color={CATEGORICAL[4]} size="lg" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 2 }}>
                    <div style={{ fontSize: 11, color: 'var(--pt-text-dim)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ color: 'var(--pt-text-mute)', fontSize: 9, letterSpacing: '0.12em' }}>WEEK</span>
                      {' '}{money(or.usageWeekly)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--pt-text-dim)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ color: 'var(--pt-text-mute)', fontSize: 9, letterSpacing: '0.12em' }}>TODAY</span>
                      {' '}{money(or.usageDaily)}
                    </div>
                  </div>
                  {or.limitRemaining != null && (
                    <Stat value={money(or.limitRemaining)} label="REMAINING" color={CATEGORICAL[2]} size="lg" align="right" />
                  )}
                </div>
                {or.limit != null && (() => {
                  const pct = Math.min(100, (or.usageMonthly / or.limit) * 100)
                  const barColor = pct > 85 ? STATUS.crit : pct > 60 ? STATUS.warn : CATEGORICAL[0]
                  return (
                    <div>
                      <div style={{ height: 8, background: 'var(--pt-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          width: `${pct}%`, height: '100%',
                          background: `linear-gradient(90deg, ${barColor}88, ${barColor})`,
                          boxShadow: `0 0 10px ${barColor}`,
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.1em' }}>
                        <span>$0</span>
                        <span style={{ color: barColor }}>{pct.toFixed(1)}% used</span>
                        <span>{money(or.limit)}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
              <ScopeNote>
                $ = LIVE OPENROUTER BILLING (AUTHORITATIVE) · TOKENS = LOCAL-LOG COVERAGE.
                THE TWO COVER DIFFERENT WINDOWS — LIFETIME BILLED {money(or.usageLifetime)}.
              </ScopeNote>
            </Window>
          )}
          <Window tag="◆" title={`OPENROUTER · MODEL LEADERBOARD — ${windowLabel(dayCount)}`}
            meta={`${fmtTokens(orMonthlyTokens)} tokens`}>
            <ModelLeaderboard rows={orMonthlyRows} color={CATEGORICAL[0]}
              emptyLabel={`no openrouter usage in the ${dayCount} logged days`} />
          </Window>
        </>
      )}

      {/* ── Claude Code: monthly leaderboard + trend ── */}
      {cu && cu.totalTokens > 0 && (
        <>
          <SectionHead label="CLAUDE CODE · MONTHLY" />
          <Window tag="◆" title={`CLAUDE CODE · MODEL LEADERBOARD — ${windowLabel(claudeDayCount)}`}
            meta={`${fmtTokens(claudeMonthlyTokens)} tokens · ${claudeDayCount}d (${fmtTokens(cu.totalTokens)} all-time)`}>
            <ModelLeaderboard rows={claudeMonthlyRows} color={CATEGORICAL[3]}
              emptyLabel={`no claude code usage in the ${claudeDayCount} logged days`} />
            <ScopeNote>
              TOKENS ONLY — FIXED SUBSCRIPTION (CLAUDE MAX), NO PER-TOKEN $. NOT INCLUDED IN ANY $ FIGURE ON THIS TAB.
            </ScopeNote>
          </Window>

          {cuStackedDaily.length > 1 && (
            <Window tag="▦" title="CLAUDE · DAILY TOKEN TREND" meta={`${cuStackedDaily.length}d`}>
              <div style={{ padding: '8px 14px 12px' }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                  {cuTopModels.map(m => (
                    <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, background: claudeModelColor(m.model), borderRadius: 1, display: 'inline-block', boxShadow: `0 0 4px ${claudeModelColor(m.model)}` }} />
                      <span style={{ fontSize: 8, color: 'var(--pt-text-mute)', letterSpacing: '0.12em' }}>{shortModel(m.model)}</span>
                    </div>
                  ))}
                </div>
                <StackedBarChart data={cuStackedDaily} h={90} />
              </div>
            </Window>
          )}
        </>
      )}

      {/* ── Ollama: local inference leaderboard ── */}
      {ollamaModels.length > 0 && (
        <>
          <SectionHead label="OLLAMA · LOCAL INFERENCE" />
          <Window tag="◆" title={`OLLAMA · MODEL LEADERBOARD — ${windowLabel(dayCount)}`}
            meta={`${ollamaTotalRequests.toLocaleString()} reqs all-time · $0.00`}>
            <div style={{ padding: '12px 14px 0', display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Stat value={fmtTokens(ollamaMonthlyTokens)}
                label={`TOKENS · ${dayCount >= 30 ? '30D' : `${dayCount}D LOGGED`}`} color={CATEGORICAL[2]} size="lg" />
              <Stat value={fmtTokens(ollamaTotalTokens)} label="ALL-TIME" color={CATEGORICAL[2]} size="lg" />
              <Stat value={money(ollamaTotalTokens * 0.0000005)} label="EST. SAVED vs API" color={CATEGORICAL[2]} size="lg" align="right" />
            </div>
            <ModelLeaderboard rows={ollamaMonthlyRows} color={CATEGORICAL[2]}
              emptyLabel={`no local inference in the ${dayCount} logged days`} />
          </Window>
        </>
      )}

      {/* ── Paid API models burn (all-time logs) ── */}
      {paidModels.length > 0 && (
        <Window tag="$" title="BURN BY MODEL — ALL-TIME LOGS"
          meta={`total ${money(costs.estimatedCostUsd)} · logged`}>
          <div className="mc-cost-rows">
            {paidModels.map(m => (
              <div key={m.model} className="mc-cost-row">
                <div className="mc-cost-name">{m.model.split('/').pop()}</div>
                <div className="mc-cost-bar"><span style={{ width: `${(m.estimatedCostUsd / maxCost) * 100}%` }} /></div>
                <div className="mc-cost-val">{money(m.estimatedCostUsd)}</div>
              </div>
            ))}
          </div>
          {(() => {
            // Reconcile the panel total against the OpenRouter-only disclaimer below:
            // this chart sums EVERY logged provider, so split it so the numbers add up.
            const or = paidModels.filter(m => /openrouter/i.test(`${m.provider} ${m.model}`)).reduce((s, m) => s + m.estimatedCostUsd, 0)
            const other = costs.estimatedCostUsd - or
            return (
              <div style={{ padding: '8px 14px', fontSize: 9, color: 'var(--pt-text-mute)', letterSpacing: '0.1em', borderTop: '1px solid var(--pt-border)', fontFamily: 'var(--font-mono)' }}>
                split · OpenRouter {money(or)} · {other > 0 ? `other API ${money(other)}` : ''} — logged sessions only, excludes Claude subscription &amp; unlogged/current spend
              </div>
            )
          })()}
          {costs.warnings?.map((w, i) => (
            <div key={i} style={{ padding: '6px 14px', fontSize: 9, color: STATUS.warn, letterSpacing: '0.14em', borderTop: '1px solid var(--pt-border)' }}>
              ⚠ {w}
            </div>
          ))}
        </Window>
      )}

      {!or && !cu && paidModels.length === 0 && ollamaModels.length === 0 && (
        <EmptyTerminal label="no billing data — set OPENROUTER_API_KEY in .env" />
      )}
    </div>
  )
}
