'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { MLContentIdea } from '@/lib/types'
import { Button, SkeletonPanel, fmtDate } from './ui'
import { EmptyState } from './EmptyState'

const POLL_MS = 30_000

/** Avoid "Week 27: Week 27: …" when the source title already starts with the week prefix. */
function titleLabel(idea: MLContentIdea): string {
  const prefix = `week ${idea.week}:`
  const t = idea.title.trim()
  return t.toLowerCase().startsWith(prefix) ? t : `Week ${idea.week}: ${t}`
}

function scoreTone(score?: number): 'hi' | 'mid' | 'lo' {
  return typeof score !== 'number' ? 'lo' : score >= 70 ? 'hi' : score >= 40 ? 'mid' : 'lo'
}

/** Score chip → score bar. Tone classes (hi/mid/lo) preserved for color semantics;
 *  the bar gives the same signal at a glance without reading the number. */
function ScoreBar({ score }: { score?: number }) {
  if (typeof score !== 'number') return null
  const tone = scoreTone(score)
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div className="mc-content-score">
      <span className={`mc-pipe-score ${tone}`}>SCORE {Math.round(score)}</span>
      <div className="mc-pipe-bar"><span style={{ width: `${pct}%` }} /></div>
    </div>
  )
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
  expanded: boolean
  onToggle: () => void
}

function IdeaCard({ idea, onDispatch, dispatching, expanded, onToggle }: IdeaCardProps) {
  return (
    <div className="mc-pipe-card">
      <div className="mc-pipe-card-head">
        <button
          type="button"
          className="mc-content-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse idea details' : 'Expand idea details'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="mc-pipe-name">{titleLabel(idea)}</span>
      </div>
      <div className="mc-pipe-meta">
        <span>{idea.project}</span>
      </div>
      <ScoreBar score={idea.score} />
      {expanded ? (
        <div className="mc-content-detail">
          {idea.video && (
            <div className="mc-content-section">
              <h4>VIDEO HOOK</h4>
              <div className="mc-pipe-row">🎥 {idea.video}</div>
            </div>
          )}
          {idea.shot_list?.length > 0 && (
            <div className="mc-content-section">
              <h4>SHOT LIST</h4>
              <ul className="mc-content-list">
                {idea.shot_list.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {idea.x_thread?.length > 0 && (
            <div className="mc-content-section">
              <h4>X THREAD</h4>
              <ol className="mc-content-list">
                {idea.x_thread.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
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
        </div>
      ) : (
        idea.video && <div className="mc-pipe-row">🎥 {idea.video}</div>
      )}
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

type SortKey = 'score' | 'updated'

export function ContentCreationBoard() {
  const [ideas, setIdeas] = useState<MLContentIdea[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dispatchingId, setDispatchingId] = useState<string | null>(null)
  const [bulking, setBulking] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [project, setProject] = useState('all')
  const [scoreRange, setScoreRange] = useState<'all' | '70' | '40' | 'low'>('all')
  const [undispatchedOnly, setUndispatchedOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('score')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
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
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const projects = useMemo(
    () => Array.from(new Set(ideas.map(i => i.project).filter(Boolean))).sort(),
    [ideas],
  )

  const stats = useMemo(() => {
    const scored = ideas.filter(i => typeof i.score === 'number')
    const avg = scored.length ? scored.reduce((n, i) => n + (i.score ?? 0), 0) / scored.length : 0
    return {
      total: ideas.length,
      avg: Math.round(avg * 10) / 10,
      open: ideas.filter(i => !i.dispatched).length,
    }
  }, [ideas])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = ideas.filter(idea => {
      if (project !== 'all' && idea.project !== project) return false
      if (undispatchedOnly && idea.dispatched) return false
      if (scoreRange === '70' && (typeof idea.score !== 'number' || idea.score < 70)) return false
      if (scoreRange === '40' && (typeof idea.score !== 'number' || idea.score < 40 || idea.score >= 70)) return false
      if (scoreRange === 'low' && (typeof idea.score !== 'number' || idea.score >= 40)) return false
      if (!q) return true
      const hay = [
        idea.title,
        idea.project,
        idea.video,
        ...(idea.shot_list ?? []),
        ...(idea.x_thread ?? []),
        idea.source_tweet ?? '',
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
    const sorted = [...matches]
    if (sort === 'score') {
      sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    } else {
      sorted.sort((a, b) => {
        const at = a.updated_at ? Date.parse(a.updated_at) : -Infinity
        const bt = b.updated_at ? Date.parse(b.updated_at) : -Infinity
        return bt - at
      })
    }
    return sorted
  }, [ideas, query, project, scoreRange, undispatchedOnly, sort])

  const dispatchOne = useCallback(async (idea: MLContentIdea): Promise<void> => {
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
  }, [])

  const dispatch = useCallback(async (idea: MLContentIdea) => {
    setDispatchingId(idea.id)
    try {
      await dispatchOne(idea)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDispatchingId(null)
    }
  }, [dispatchOne, refresh])

  /** Bulk ghost action — dispatch the top-3 undispatched ideas by score. */
  const bulkDispatch = useCallback(async () => {
    const targets = ideas
      .filter(i => !i.dispatched)
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      .slice(0, 3)
    if (!targets.length) return
    setBulking(true)
    try {
      for (const idea of targets) await dispatchOne(idea)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBulking(false)
    }
  }, [ideas, dispatchOne, refresh])

  const toggleExpanded = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearFilters = useCallback(() => {
    setQuery('')
    setProject('all')
    setScoreRange('all')
    setUndispatchedOnly(false)
    setSort('score')
  }, [])

  if (!loaded && !ideas.length && !error) return <SkeletonPanel label="loading content ideas" />

  return (
    <>
      {error && <div className="mc-pipe-error">⚠ Content ideas store unreachable — {error}</div>}

      {ideas.length === 0 && !error ? (
        <EmptyState
          glyph="◇"
          title="No content ideas yet"
          desc="The weekly idea loop writes week-N.json files into the configured ideas dir. Point it there in Setup, or run the loop and the next batch lands here."
          actions={[
            { label: 'Open Setup', href: '/setup', primary: true },
            { label: 'Refresh', onClick: () => void refresh() },
          ]}
        />
      ) : (
        <>
          <div className="mc-content-toolbar">
            <span className="mc-content-search">
              <span className="mc-content-search-glyph" aria-hidden="true">⌕</span>
              <input
                className="mc-input mc-content-search-input"
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="search ideas…"
                aria-label="Search ideas"
              />
            </span>
            <select
              className="mc-content-select"
              value={project}
              onChange={e => setProject(e.target.value)}
              aria-label="Filter by project"
            >
              <option value="all">project: all</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              className="mc-content-select"
              value={scoreRange}
              onChange={e => setScoreRange(e.target.value as typeof scoreRange)}
              aria-label="Score range"
            >
              <option value="all">score: all</option>
              <option value="70">score: 70+</option>
              <option value="40">score: 40–69</option>
              <option value="low">score: &lt;40</option>
            </select>
            <button
              type="button"
              className={`mc-content-chip${undispatchedOnly ? ' is-on' : ''}`}
              onClick={() => setUndispatchedOnly(v => !v)}
              aria-pressed={undispatchedOnly}
            >
              open only
            </button>
            <select
              className="mc-content-select"
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              aria-label="Sort ideas"
            >
              <option value="score">sort: score</option>
              <option value="updated">sort: updated</option>
            </select>
            <Button variant="ghost" loading={bulking} disabled={!stats.open} onClick={() => void bulkDispatch()}>
              ⚡ Top 3
            </Button>
            <span className="mc-content-count">{visible.length} / {stats.total}</span>
          </div>

          <div className="mc-content-stats">
            <span className="mc-content-stat"><em>TOTAL IDEAS</em><b>{stats.total}</b></span>
            <span className="mc-content-stat"><em>AVG SCORE</em><b>{stats.avg}</b></span>
            <span className="mc-content-stat"><em>UNDISPATCHED</em><b>{stats.open}</b></span>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              compact
              glyph="⌕"
              title="No ideas match"
              desc="Nothing in this batch matches the current search and filters."
              actions={[{ label: 'Clear filters', onClick: clearFilters }]}
            />
          ) : (
            <div className="mc-content-grid">
              {visible.map(idea => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  onDispatch={dispatch}
                  dispatching={dispatchingId === idea.id}
                  expanded={expanded.has(idea.id)}
                  onToggle={() => toggleExpanded(idea.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}