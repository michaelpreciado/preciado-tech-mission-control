'use client'

import { useLiveData } from '../LiveDataProvider'
import { Window, EmptyTerminal, SkeletonPanel, fmtDate, Clamp } from '../ui'

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
              <div className="msg" title={m.title}>{m.title}</div>
              {m.excerpt && <Clamp className="repo" text={m.excerpt} lines={2} label="MEMORY EXCERPT" />}
            </div>
            <span className="when">{fmtDate(m.updatedAt)}</span>
          </div>
        ))}
      </div>
    </Window>
  )
}
