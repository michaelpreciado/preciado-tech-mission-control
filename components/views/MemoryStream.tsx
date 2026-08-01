'use client'

import { useLiveData } from '../LiveDataProvider'
import { Window, EmptyTerminal, SkeletonPanel, fmtDate } from '../ui'

/* ── Memory Stream ────────────────────────────────────── */

export function MemoryStream() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading memory" />
  const memory = data.memory ?? []
  if (!memory.length) return <EmptyTerminal label="no memory entries" />

  return (
    <Window tag="⊡" title="STEWARDSHIP LEDGER" meta={`${memory.length} entries`}>
      <div style={{ padding: 0 }}>
        {memory.map(m => (
          <div key={m.id} className="mc-commit">
            <span className="sha">{m.source}</span>
            <div>
              <div className="msg">{m.title}</div>
              {m.excerpt && <div className="repo">{m.excerpt.slice(0, 80)}</div>}
            </div>
            <span className="when">{fmtDate(m.updatedAt)}</span>
          </div>
        ))}
      </div>
    </Window>
  )
}
