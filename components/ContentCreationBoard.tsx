'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { MLContentIdea } from '@/lib/types'
import { Button, SkeletonPanel, fmtDate } from './ui'

const POLL_MS = 30_000

/** Avoid "Week 27: Week 27: …" when the source title already starts with the week prefix. */
function titleLabel(idea: MLContentIdea): string {
  const prefix = `week ${idea.week}:`
  const t = idea.title.trim()
  return t.toLowerCase().startsWith(prefix) ? t : `Week ${idea.week}: ${t}`
}

function ScoreChip({ score }: { score?: number }) {
  if (typeof score !== 'number') return null
  const tone = score >= 70 ? 'hi' : score >= 40 ? 'mid' : 'lo'
  return <span className={`mc-pipe-score ${tone}`}>SCORE {score}</span>
}

/** Builds the task body sent to /api/kanban — the dispatched task should be
 *  fully actionable without re-opening this tab. */
function dispatchBody(idea: MLContentIdea): string {
  const parts = [
    idea.video ? `Video hook:\n${idea.video}` : '',
    idea.shot_list?.length ? `Shot list:\n${idea.shot_list.map(s => `- ${s}`).join('\n')}` : '',
    idea.x_thread?.length ? `X thread:\n${idea.x_thread.map((t, i) => `${i + 1}/${idea.x_thread.length}: ${t}`).join('\n')}` : '',
    idea.source_tweet ? `Source tweet: https://x.com/i/status/${idea.source_tweet}` : '',
  ].filter(Boolean)
  return parts.join('\n\n')
}

type IdeaCardProps = {
  idea: MLContentIdea
  onDispatch: (idea: MLContentIdea) => void
  dispatching: boolean
}

function IdeaCard({ idea, onDispatch, dispatching }: IdeaCardProps) {
  return (
    <div className="mc-pipe-card">
      <div className="mc-pipe-card-head">
        <span className="mc-pipe-name">{titleLabel(idea)}</span>
        <ScoreChip score={idea.score} />
      </div>
      <div className="mc-pipe-meta">
        <span>{idea.project}</span>
      </div>
      {idea.video && <div className="mc-pipe-row">🎥 {idea.video}</div>}
      {idea.x_thread?.length > 0 && (
        <div className="mc-pipe-row dim">
          {idea.x_thread.length} tweet{idea.x_thread.length === 1 ? '' : 's'} drafted — “{idea.x_thread[0].slice(0, 120)}{idea.x_thread[0].length > 120 ? '…' : ''}”
        </div>
      )}
      {idea.source_tweet && (
        <a
          className="mc-pipe-link"
          href={`https://x.com/i/status/${idea.source_tweet}`}
          target="_blank"
          rel="noreferrer"
        >
          View source tweet ↗
        </a>
      )}
      <div className="mc-pipe-when">{idea.updated_at ? fmtDate(idea.updated_at) : ''}</div>
      <div className="mc-content-card-foot">
        {idea.dispatched ? (
          <span className="mc-pipe-approval approved">
            ✓ Dispatched{idea.dispatchedAt ? ` · ${fmtDate(idea.dispatchedAt)}` : ''}
          </span>
        ) : (
          <Button variant="primary" loading={dispatching} onClick={() => onDispatch(idea)}>
            Dispatch to Hermes
          </Button>
        )}
      </div>
    </div>
  )
}

export function ContentCreationBoard() {
  const [ideas, setIdeas] = useState<MLContentIdea[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dispatchingId, setDispatchingId] = useState<string | null>(null)
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

  const dispatch = useCallback(async (idea: MLContentIdea) => {
    setDispatchingId(idea.id)
    try {
      const kanbanRes = await fetch('/api/kanban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleLabel(idea),
          body: dispatchBody(idea),
          origin: 'content-creation',
        }),
      })
      if (!kanbanRes.ok) {
        const j = await kanbanRes.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${kanbanRes.status}`)
      }

      // Separate call: only marks the idea as already-dispatched so the UI
      // doesn't offer to re-dispatch it — does not itself create a task.
      const dispatchRes = await fetch('/api/ml-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idea.id }),
      })
      if (!dispatchRes.ok) throw new Error(`HTTP ${dispatchRes.status}`)

      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDispatchingId(null)
    }
  }, [refresh])

  if (!ideas.length && !error) return <SkeletonPanel label="loading content ideas" />

  return (
    <>
      {error && <div className="mc-pipe-error">⚠ Content ideas store unreachable — {error}</div>}
      <div className="mc-content-grid">
        {ideas.length === 0 && !error && <div className="mc-pipe-empty">— no ideas yet —</div>}
        {ideas.map(idea => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            onDispatch={dispatch}
            dispatching={dispatchingId === idea.id}
          />
        ))}
      </div>
    </>
  )
}
