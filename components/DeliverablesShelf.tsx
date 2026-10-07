'use client'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { E } from '@/lib/pt/contract'
import { CADENCE } from '@/lib/pt/contract'
import type { Deliverable, DeliverablesIndex, DeliverableContent } from '@/lib/pt/deliverables'
import { compatibleDeliverables, deliverablesDisplay, contentPath, matchingContent } from '@/lib/pt/deliverables-display.mjs'
import { obsidianLink } from '@/lib/vault-links'
import { THEME_CSS_VARIABLES } from '@/lib/pt/theme'
import './deliverables.css'

export function DeliverablesShelf() {
  const [snapshot, setSnapshot] = useState<E<DeliverablesIndex> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<DeliverableContent | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const sequence = useRef(0)
  useEffect(() => {
    setSelected(new URL(window.location.href).searchParams.get('id'))
    let alive = true, busy = false
    const abort = new AbortController()
    const poll = async () => {
      if (busy) return
      busy = true
      try {
        const res = await fetch('/api/deliverables', { cache: 'no-store', signal: abort.signal })
        if (!res.ok) throw Error(res.status === 401 || res.status === 403 ? 'access_denied' : 'refresh_failed')
        const value = await res.json()
        if (!compatibleDeliverables(value) || value.data === null) throw Error('invalid_snapshot')
        if (alive) { setSnapshot(value); setError(null); setNow(Date.now()) }
      } catch (err) { if (alive) setError(err instanceof Error ? err.message : 'refresh_failed') }
      finally { busy = false }
    }
    void poll()
    const refresh = setInterval(poll, CADENCE.deliverables.pollMs), tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { alive = false; abort.abort(); clearInterval(refresh); clearInterval(tick) }
  }, [])
  const view = deliverablesDisplay(snapshot, now, !!error, error)
  const rows = view.rows as Deliverable[]
  const selectedItem = rows.find(row => row.id === selected)
  useEffect(() => {
    const ticket = ++sequence.current
    setContent(null); setContentError(null)
    if (!selectedItem || !view.canRead || !selectedItem.available) return
    const url = contentPath(selectedItem)
    if (!url) return
    const abort = new AbortController()
    void fetch(url, { cache: 'no-store', signal: abort.signal }).then(async res => {
      if (!res.ok) throw Error(res.status === 409 ? 'Revision changed. Refresh the shelf before reviewing.' : res.status === 404 ? 'File moved or unavailable.' : res.status === 415 ? 'Unsupported format.' : res.status === 413 ? 'File exceeds the content limit.' : 'Content unavailable.')
      const result = await res.json()
      if (!matchingContent(result, selectedItem)) throw Error('Revision changed. Refresh the shelf before reviewing.')
      if (sequence.current === ticket) setContent(result.data)
    }).catch(err => { if (!abort.signal.aborted && sequence.current === ticket) setContentError(err.message) })
    return () => abort.abort()
  }, [selectedItem?.id, selectedItem?.artifactRevision, selectedItem?.evidenceRevision, view.canRead]) // eslint-disable-line react-hooks/exhaustive-deps
  function select(row: Deliverable) {
    setSelected(row.id)
    window.history.replaceState(null, '', row.webPath)
  }
  return <main className="pt-deliverables" style={THEME_CSS_VARIABLES as CSSProperties}>
    <header><p className="pt-eyebrow">PRECIADO TECH · REVIEW SHELF</p><h1>Deliverables</h1><p>Reports, client notes, and review evidence.</p></header>
    <div className="pt-shelf-tools"><p role="status">{view.count ?? '—'} items · {view.lastKnown ? 'last known · ' : ''}{view.label}{!view.complete ? ' · partial coverage' : ''}</p><label>Find an artifact<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, client, or state" /></label></div>
    {error && <p role="alert">{error === 'access_denied' ? 'Sign in to view deliverables.' : 'Refresh failed. Displayed rows are last known.'}</p>}
    <div className="pt-shelf-layout"><section aria-label="Artifacts" className="pt-shelf-list">
      {rows.filter(row => `${row.title} ${row.leadIds.join(' ')} ${row.reviewState}`.toLowerCase().includes(query.toLowerCase())).map(row => <button type="button" key={row.id} className="pt-artifact" data-artifact-id={row.id} aria-pressed={selected === row.id} onClick={() => select(row)}>
        <span className="pt-state" data-state={row.reviewState}>{row.reviewState}</span><strong>{row.title}</strong>
        <span>{row.kind} · {row.available ? `${row.bytes?.toLocaleString()} bytes` : row.unavailableReason}</span>
        {row.gateIds.length > 0 && <span>Gates: {row.gateIds.join(', ')}</span>}
      </button>)}
      {view.count === 0 && <p>No registered artifacts found.</p>}
    </section><section className="pt-shelf-detail" aria-label="Artifact review" aria-live="polite">
      {selectedItem ? <><h2>{selectedItem.title}</h2><span className="pt-state" data-state={selectedItem.reviewState}>{selectedItem.reviewState}</span><p>{selectedItem.reviewReason.replaceAll('_', ' ')}</p>
        {selectedItem.trackerStates.map(task => <p key={task.id}>{task.id}: {task.status}{task.gate ? ` · ${task.gate}` : ''}</p>)}
        <p className="pt-hash">SHA-256: {selectedItem.artifactRevision ?? 'unavailable'}</p>
        {selectedItem.vault && view.canRead && <a href={obsidianLink(selectedItem.vault.name, selectedItem.vault.path)}>Open in Obsidian</a>}
        <p>{contentError ?? (!view.canRead ? 'Refresh required before content review.' : !selectedItem.available ? selectedItem.unavailableReason : content ? `${content.mediaType} · source view` : 'Loading source…')}</p>
        {content && content.id === selectedItem.id && content.artifactRevision === selectedItem.artifactRevision && content.evidenceRevision === selectedItem.evidenceRevision && view.canRead && <pre data-artifact-hash={content.artifactRevision}>{content.text}</pre>}
      </> : <p>{selected ? 'Artifact moved or unavailable.' : 'Select an artifact to review its source and acceptance evidence.'}</p>}
    </section></div>
  </main>
}
