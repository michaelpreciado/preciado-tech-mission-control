'use client'

import { useEffect, useMemo, useState } from 'react'
import { SkeletonPanel } from '@/components/ui'

type Signal = {
  id: string
  title: string
  url: string
  source: 'HN' | 'arXiv:cs.RO' | 'arXiv:cs.AI'
  author: string | null
  score: number
  ageDays: number
  summary: string | null
  tags: string[]
  matched: boolean
}

type SignalResponse = {
  generatedAt: string
  count: number
  errors: string[]
  signals: Signal[]
}

type Filter = 'ALL' | 'MATCHED' | 'HN' | 'arXiv'
const FILTERS: Filter[] = ['ALL', 'MATCHED', 'HN', 'arXiv']

export function SignalFeed() {
  const [data, setData] = useState<SignalResponse | null>(null)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/content-signals')
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then(result => { if (active) setData(result) })
      .catch(fetchError => { if (active) setError(`> signal fetch failed: ${(fetchError as Error).message}`) })
    return () => { active = false }
  }, [])

  const visible = useMemo(() => {
    if (!data) return []
    const needle = query.trim().toLowerCase()
    return data.signals.filter(signal => {
      const inFilter = filter === 'ALL'
        || (filter === 'MATCHED' && signal.matched)
        || (filter === 'HN' && signal.source === 'HN')
        || (filter === 'arXiv' && signal.source.startsWith('arXiv:'))
      const inSearch = !needle || signal.title.toLowerCase().includes(needle)
      return inFilter && inSearch
    })
  }, [data, filter, query])

  if (!data && !error) return <SkeletonPanel label="signal feed" />

  return (
    <div className="mc-signal-feed">
      <div className="mc-signal-toolbar">
        <div className="mc-signal-filters" aria-label="Signal filters">
          {FILTERS.map(item => (
            <button
              type="button"
              key={item}
              className={`mc-signal-chip${filter === item ? ' active' : ''}`}
              onClick={() => setFilter(item)}
              aria-pressed={filter === item}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="mc-content-search mc-signal-search">
          <span className="mc-content-search-glyph">⌕</span>
          <input
            className="mc-content-search-input"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="search signal titles"
            aria-label="Search signal titles"
          />
        </label>
      </div>

      {error && <div className="mc-studio-error" role="alert">{error}</div>}
      {data && (
        <>
          <div className="mc-signal-resultline">
            {visible.length} signals · matched first · fetched {new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          {data.errors.length > 0 && <div className="mc-signal-warning">partial feed · {data.errors.join(' · ')}</div>}
          <div className="mc-signal-list">
            {visible.map((signal, index) => (
              <article className="mc-pipe-card mc-signal-card" key={signal.id}>
                <div className="mc-pipe-card-head mc-signal-head">
                  <span className="mc-signal-rank">#{String(index + 1).padStart(2, '0')}</span>
                  <span className={`mc-signal-src ${signal.source === 'HN' ? 'hn' : 'arxiv'}`}>
                    {signal.source === 'HN' ? 'HN' : 'ARXIV'}
                  </span>
                  {signal.ageDays < 1 && <span className="mc-signal-new">NEW</span>}
                </div>
                <a className="mc-signal-title" href={signal.url} target="_blank" rel="noreferrer">{signal.title}</a>
                <div className="mc-pipe-meta mc-signal-meta">
                  <span>age {signal.ageDays.toFixed(1)}d</span>
                  <span>· score {signal.score}</span>
                  {signal.author && <span>· by {signal.author}</span>}
                </div>
                {signal.summary && <p className="mc-signal-summary">{signal.summary}</p>}
                {signal.tags.length > 0 && (
                  <div className="mc-signal-tags">
                    {signal.tags.map(tag => <span className="mc-signal-tag" key={tag}>{tag}</span>)}
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
