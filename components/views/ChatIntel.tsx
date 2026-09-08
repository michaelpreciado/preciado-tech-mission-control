'use client'

import { AsciiMsg } from '@/components/ascii-msg'

/**
 * CHAT INTEL — what fills the thread pane before you pick a conversation.
 *
 * The whole archive at a glance: volume, a 12-week activity heatmap, and where
 * the traffic actually comes from (agent, device, source, model). Every number
 * is computed server-side over EVERY conversation, not the page currently
 * listed, so it stays honest while you search and filter.
 *
 * Same engineering-HUD language as the RIG panel on Home: thin rules, tick
 * grids, tabular numerals, accent intensity for magnitude.
 */
import type { ConversationStats } from '@/lib/conversations'
import { sourceGlyph } from '@/lib/conv-format'

function fmtNum(n: number): string {
  return n.toLocaleString()
}

function fmtWhen(ts: number | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

/* ── 12-week activity heatmap ───────────────────────────────────────── */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function Heatmap({ days }: { days: { date: string; count: number }[] }) {
  if (!days.length) return null
  const peak = Math.max(1, ...days.map(d => d.count))

  // Column-major weeks so the grid reads like a calendar: each column is a
  // week, each row a weekday. Pad the front so week 1 starts on the right day.
  const first = new Date(`${days[0].date}T00:00:00`)
  const pad = first.getDay()
  const cells: ({ date: string; count: number } | null)[] = [...Array(pad).fill(null), ...days]

  const weeks: (typeof cells)[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return (
    <div className="ci-heat">
      <div className="ci-heat-days">
        {WEEKDAYS.map((d, i) => <span key={i}>{i % 2 ? d : ''}</span>)}
      </div>
      <div className="ci-heat-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="ci-heat-week">
            {Array.from({ length: 7 }, (_, di) => {
              const cell = week[di]
              if (!cell) return <span key={di} className="ci-heat-cell is-pad" />
              // sqrt keeps a single busy day from flattening every other day to
              // nothing — message volume is extremely spiky.
              const intensity = cell.count ? Math.sqrt(cell.count / peak) : 0
              return (
                <span
                  key={di}
                  className={`ci-heat-cell${cell.count ? '' : ' is-zero'}`}
                  title={`${cell.date} — ${fmtNum(cell.count)} messages`}
                  style={cell.count ? {
                    background: `color-mix(in srgb, var(--pt-neon-bright) ${Math.round(12 + intensity * 88)}%, transparent)`,
                  } : undefined}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="ci-heat-legend">
        <span>12 weeks</span>
        <span className="ci-heat-scale">
          less
          {[0.05, 0.3, 0.55, 0.8, 1].map(f => (
            <i key={f} style={{ background: `color-mix(in srgb, var(--pt-neon-bright) ${Math.round(12 + f * 88)}%, transparent)` }} />
          ))}
          more
        </span>
        <span>peak {fmtNum(peak)}/day</span>
      </div>
    </div>
  )
}

/* ── ranked bar list ────────────────────────────────────────────────── */

function BarList({ rows, unit }: {
  rows: { name: string; count: number; messages?: number }[]
  unit: string
}) {
  if (!rows.length) return <div className="ci-none">none</div>
  const max = Math.max(1, ...rows.map(r => r.count))
  return (
    <div className="ci-bars">
      {rows.map(r => (
        <div key={r.name} className="ci-bar" title={`${r.name} — ${fmtNum(r.count)} ${unit}${r.messages != null ? ` · ${fmtNum(r.messages)} messages` : ''}`}>
          <span className="ci-bar-name">{r.name}</span>
          <span className="ci-bar-track"><i style={{ width: `${(r.count / max) * 100}%` }} /></span>
          <span className="ci-bar-val">{fmtNum(r.count)}</span>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <AsciiMsg who={title} ts={meta} compact className="amsg-panel">
      {children}
    </AsciiMsg>
  )
}

/* ── the dashboard ──────────────────────────────────────────────────── */

export function ChatIntel({ stats, onOpen }: {
  stats: ConversationStats
  onOpen?: (id: string, profile: string, device: string) => void
}) {
  return (
    <div className="ci amsg-surface">
      <div className="ci-hero">
        <div className="ci-stat">
          <span className="ci-stat-val">{fmtNum(stats.totalConversations)}</span>
          <span className="ci-stat-lbl">THREADS</span>
        </div>
        <div className="ci-stat">
          <span className="ci-stat-val">{fmtNum(stats.totalMessages)}</span>
          <span className="ci-stat-lbl">MESSAGES</span>
        </div>
        <div className="ci-stat">
          <span className="ci-stat-val">{stats.byAgent.length}</span>
          <span className="ci-stat-lbl">AGENTS</span>
        </div>
        <div className="ci-stat">
          <span className="ci-stat-val">{stats.byDevice.length}</span>
          <span className="ci-stat-lbl">DEVICES</span>
        </div>
        <div className="ci-stat">
          <span className="ci-stat-val">
            {stats.totalConversations ? Math.round(stats.totalMessages / stats.totalConversations) : 0}
          </span>
          <span className="ci-stat-lbl">AVG / THREAD</span>
        </div>
      </div>

      <Panel title="ACTIVITY" meta={`${fmtWhen(stats.firstActiveAt)} → ${fmtWhen(stats.lastActiveAt)}`}>
        <Heatmap days={stats.heatmap} />
      </Panel>

      <div className="ci-split">
        <Panel title="BY AGENT" meta={`${stats.byAgent.length}`}>
          <BarList rows={stats.byAgent} unit="threads" />
        </Panel>
        <Panel title="BY DEVICE" meta={`${stats.byDevice.length}`}>
          <BarList rows={stats.byDevice} unit="threads" />
        </Panel>
      </div>

      <Panel title="BY SOURCE" meta={`${stats.bySource.length} channels`}>
        <div className="ci-sources">
          {stats.bySource.map(s => (
            <span key={s.name} className="ci-source" title={`${s.name} — ${fmtNum(s.count)} threads`}>
              <i className="ci-source-glyph">{sourceGlyph(s.name)}</i>
              <b>{s.name}</b>
              <em>{fmtNum(s.count)}</em>
            </span>
          ))}
        </div>
      </Panel>

      <div className="ci-split">
        <Panel title="TOP MODELS" meta="by threads">
          <BarList rows={stats.byModel} unit="threads" />
        </Panel>
        <Panel title="BUSIEST THREADS" meta="by messages">
          <div className="ci-busiest">
            {stats.busiest.map(b => (
              <button
                key={`${b.device}::${b.profile}::${b.id}`}
                type="button"
                className="ci-busy"
                onClick={() => onOpen?.(b.id, b.profile, b.device)}
                title={`${b.title} — ${b.profile} on ${b.device}`}
              >
                <span className="ci-busy-title">{b.title}</span>
                <span className="ci-busy-count">{fmtNum(b.messageCount)}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
