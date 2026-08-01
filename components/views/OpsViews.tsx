'use client'

import { useLiveData } from '../LiveDataProvider'
import { Window, EmptyTerminal, SkeletonPanel, fmtDate } from '../ui'

/* ── Ideas Panel ──────────────────────────────────────── */

/* Note: IdeasPanel, MissionsPanel and IntegrationsPanel currently have no route
   or nav entry — nothing mounts them. Kept because the collectors behind them
   (ideas / missions / integrations) still populate the payload. */

export function IdeasPanel() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading ideas" />
  const ideas = data.ideas ?? []
  if (!ideas.length) return <EmptyTerminal label="no ideas yet" />
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
      {ideas.map((idea, i) => (
        <Window key={i} tag="◇" title={`IDEA · ${String(i + 1).padStart(2, '0')}`}>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--pt-text-high)', marginBottom: 6 }}>{idea.title}</div>
            {idea.description && <div style={{ fontSize: 11, color: 'var(--pt-text-dim)', lineHeight: 1.65 }}>{idea.description}</div>}
            <div style={{ fontSize: 9, color: 'var(--pt-text-mute)', marginTop: 8, letterSpacing: '0.14em' }}>
              {idea.source} · {idea.status}
            </div>
          </div>
        </Window>
      ))}
    </div>
  )
}

/* ── Operations Panel ─────────────────────────────────── */

const TONE_LED: Record<string, string> = { green: 'green', amber: 'amber', red: 'amber', blue: '', slate: '' }

export function OperationsPanel() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading operations" />
  const ops = data.operations
  if (!ops) return <EmptyTerminal label="no operations data" />

  return (
    <>
      {/* Hotspot badges */}
      {ops.hotspots?.length > 0 && (
        <Window tag="◉" title="HOTSPOTS" meta={`${ops.hotspots.length} areas`}>
          <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {ops.hotspots.map(h => (
              <div key={h.label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--pt-surface-2)', borderRadius: 3, fontSize: 10, letterSpacing: '0.12em' }}>
                <span className={`mc-led ${TONE_LED[h.tone] ?? ''}`} />
                <span style={{ color: 'var(--pt-text-high)' }}>{h.label}</span>
                <span style={{ color: 'var(--pt-text-mute)' }}>{h.count}</span>
              </div>
            ))}
          </div>
        </Window>
      )}

      {/* Inbox items */}
      {ops.inbox?.length > 0 && (
        <Window tag="▣" title="INBOX" meta={`${ops.inbox.length} items`}>
          <div>
            {ops.inbox.slice(0, 8).map(item => (
              <div key={item.id} className="mc-commit">
                <span className="sha">{item.ownerName}</span>
                <div>
                  <div className="msg">{item.title}</div>
                  <div className="repo">{item.area}</div>
                </div>
                <span className="when">{fmtDate(item.updatedAt)}</span>
              </div>
            ))}
          </div>
        </Window>
      )}

      {/* Recent activity */}
      <Window tag="▶" title="RECENT ACTIVITY" meta={`${ops.recentFiles?.length ?? 0} files`}>
        <div>
          {(ops.recentFiles ?? []).slice(0, 15).map(f => (
            <div key={f.id} className="mc-commit">
              <span className="sha">{f.ownerName}</span>
              <div>
                <div className="msg">{f.title}</div>
                <div className="repo">{f.area} · {f.kind}</div>
              </div>
              <span className="when">{fmtDate(f.updatedAt)}</span>
            </div>
          ))}
        </div>
      </Window>
    </>
  )
}

/* ── Missions Panel ───────────────────────────────────── */

export function MissionsPanel() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading missions" />
  const missions = data.missions ?? []
  if (!missions.length) return <EmptyTerminal label="no missions in flight" />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
      {missions.map(m => (
        <Window key={m.id} tag={m.id} title={m.title}>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 10, letterSpacing: '0.18em', color: 'var(--pt-text-dim)' }}>STATUS</span>
              <span style={{ fontSize: 12, color: 'var(--pt-neon-bright)', textShadow: 'var(--pt-glow-sm)' }}>{m.status.toUpperCase()}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--pt-text-dim)' }}>{m.priority}</span>
            </div>
            {m.description && <div style={{ fontSize: 11, color: 'var(--pt-text-dim)', lineHeight: 1.6 }}>{m.description}</div>}
          </div>
        </Window>
      ))}
    </div>
  )
}

/* ── Integrations Panel ───────────────────────────────── */

export function IntegrationsPanel() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading integrations" />
  const integrations = data.integrations ?? []
  if (!integrations.length) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {integrations.map(int => (
        <div key={int.name} className="mc-window" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className={`mc-led ${int.status === 'connected' ? 'green' : int.status === 'attention' ? 'amber' : ''}`} />
            <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--pt-text-high)' }}>{int.name}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--pt-text-dim)' }}>{int.detail}</div>
        </div>
      ))}
    </div>
  )
}
