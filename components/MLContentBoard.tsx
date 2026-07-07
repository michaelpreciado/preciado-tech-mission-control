'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { MLContentIdea, MLContentStage } from '@/lib/types'
import { SkeletonPanel, fmtDate } from './ui'

const POLL_MS = 30_000

const COLUMNS: { stage: MLContentStage; label: string; glyph: string; hint: string }[] = [
  { stage: 'script_film', label: 'SCRIPT & FILM', glyph: '◎', hint: 'write script, record' },
  { stage: 'edit_optimize', label: 'EDIT & OPTIMIZE', glyph: '▶', hint: 'cut video, optimize for X' },
  { stage: 'post_promote', label: 'POST & PROMOTE', glyph: '⏳', hint: 'publish Reel, post thread' },
  { stage: 'done', label: 'DONE', glyph: '✓', hint: 'archive' },
]

type WeekCardProps = {
  idea: MLContentIdea
  onClick: () => void
}

function WeekCard({ idea, onClick }: WeekCardProps) {
  return (
    <button type="button" className="mc-pipe-card" data-stage={idea.stage} onClick={onClick}>
      <div className="mc-pipe-card-head">
        <span className="mc-pipe-name">Week {idea.week}: {idea.title}</span>
      </div>
      <div className="mc-pipe-meta">
        <span>{idea.project}</span>
      </div>
      {idea.video && (
        <div className="mc-pipe-row">🎥 {idea.video}</div>
      )}
      {idea.x_thread && (
        <div className="mc-pipe-row dim">
          X Thread: {idea.x_thread.length} tweets drafted
        </div>
      )}
      <div className="mc-pipe-when">
        {idea.updated_at ? fmtDate(idea.updated_at) : ''}
      </div>
    </button>
  )
}

export function MLContentBoard() {
  const [ideas, setIdeas] = useState<MLContentIdea[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedIdea, setSelectedIdea] = useState<MLContentIdea | null>(null)
  const ideasRef = useRef<MLContentIdea[]>([])
  ideasRef.current = ideas

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/ml-content', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setIdeas(data.ideas ?? [])
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  if (!ideas.length && !error) return <SkeletonPanel label="loading ML content" />

  return (
    <>
      {error && <div className="mc-pipe-error">⚠ ML content store unreachable — {error}</div>}
      <div className="mc-pipeline">
        {COLUMNS.map(col => {
          const items = ideas.filter(i => i.stage === col.stage)
          return (
            <div key={col.stage} className="mc-window mc-pipe-col">
              <div className={`mc-tcol-head`}>
                <span className="mc-tcol-glyph">{col.glyph}</span>
                <span>{col.label}</span>
                <span className="mc-tcol-count">{items.length}</span>
              </div>
              <div className="mc-pipe-hint">{col.hint}</div>
              <div className="mc-pipe-col-body">
                {items.length === 0 && <div className="mc-pipe-empty">— empty —</div>}
                {items.map(idea => (
                  <WeekCard 
                    key={`${idea.week}-${idea.title}`} 
                    idea={idea} 
                    onClick={() => setSelectedIdea(idea)} 
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Details Modal */}
      {selectedIdea && (
        <div className="mc-modal-overlay" onClick={() => setSelectedIdea(null)}>
          <div className="mc-modal" onClick={e => e.stopPropagation()}>
            <button className="mc-modal-close" onClick={() => setSelectedIdea(null)}>✕</button>
            <h3>Week {selectedIdea.week}: {selectedIdea.title}</h3>
            <p><strong>Project:</strong> {selectedIdea.project}</p>
            <p><strong>Video:</strong> {selectedIdea.video}</p>
            {selectedIdea.x_thread && (
              <div>
                <strong>X Thread:</strong>
                {selectedIdea.x_thread.map((tweet: string, idx: number) => (
                  <div key={idx} className="mc-modal-tweet">
                    {idx+1}/3: {tweet}
                  </div>
                ))}
              </div>
            )}
            {selectedIdea.source_tweet && (
              <p><a href={`https://x.com/i/status/${selectedIdea.source_tweet}`} target="_blank" rel="noreferrer">View Source Tweet</a></p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
