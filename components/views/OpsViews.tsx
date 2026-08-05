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
    <div className="mc-tile-grid">
      {ideas.map((idea, i) => (
        <Window key={i} tag="◇" title={`IDEA · ${String(i + 1).padStart(2, '0')}`}>
          <div className="mc-tile-body">
            <div className="mc-tile-title">{idea.title}</div>
            {idea.description && <div className="mc-tile-desc">{idea.description}</div>}
            <div className="mc-tile-foot">
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
          <div className="mc-hspot-row">
            {ops.hotspots.map(h => (
              <span key={h.label} className="mc-hspot-chip">
                <span className={`mc-led ${TONE_LED[h.tone] ?? ''}`} />
                <span className="mc-hspot-label">{h.label}</span>
                <span className="mc-hspot-count">{h.count}</span>
              </span>
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
        {(ops.recentFiles ?? []).length === 0 ? (
          <div className="mc-empty is-compact">
            <div className="mc-empty-glyph">▶</div>
            <div className="mc-empty-title">NO RECENT ACTIVITY</div>
            <p className="mc-empty-desc">Agent and file activity will stream in here as it happens.</p>
          </div>
        ) : (
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
        )}
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
    <div className="mc-tile-grid">
      {missions.map(m => (
        <Window key={m.id} tag={m.id} title={m.title}>
          <div className="mc-tile-body">
            <div className="mc-tile-head">
              <span className="mc-tile-key">STATUS</span>
              <span className="mc-tile-status">{m.status.toUpperCase()}</span>
              <span className="mc-tile-right">{m.priority}</span>
            </div>
            {m.description && <div className="mc-tile-desc">{m.description}</div>}
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
    <div className="mc-tile-grid mc-tile-grid--tri">
      {integrations.map(int => (
        <div key={int.name} className="mc-window mc-tile-card">
          <div className="mc-tile-body">
            <div className="mc-tile-head">
              <span className={`mc-led ${int.status === 'connected' ? 'green' : int.status === 'attention' ? 'amber' : ''}`} />
              <span className="mc-tile-name">{int.name}</span>
            </div>
            <div className="mc-tile-desc">{int.detail}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
