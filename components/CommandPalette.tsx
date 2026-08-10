'use client'

/**
 * CommandPalette — ⌘K / Ctrl-K fuzzy finder.
 * Jump anywhere in one keystroke: routes, crew agents, kanban tasks, and
 * open conversations. Cross-route "this is a real product" signal + real
 * utility. Mounted once inside <Shell> so it's available on every page.
 *
 *   KEYBOARD:  Ctrl/⌘+K (or `/` when not typing in a field) → open
 *              Esc → close        ↑/↓ → move      Enter → go
 * Modes are inferred from the query:
 *   plain text        → fuzzy-match route labels + agent names + task titles
 *   "> <query>"       → force route search
 *   "g <name>"        → force agent search
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useLiveData } from './LiveDataProvider'
import { Icon, type IconName } from './icons'

type Item = { id: string; label: string; sub?: string; href: string; icon: IconName; group: string }

const ROUTES: Item[] = [
  { id: '/', label: 'Home', sub: 'command center', href: '/', icon: 'deck', group: 'Routes' },
  { id: '/kanban', label: 'Kanban', sub: 'task board', href: '/kanban', icon: 'kanban', group: 'Routes' },
  { id: '/approvals', label: 'Approvals', sub: 'needs your call', href: '/approvals', icon: 'approvals', group: 'Routes' },
  { id: '/calendar', label: 'Calendar', sub: 'scheduler / today', href: '/calendar', icon: 'calendar', group: 'Routes' },
  { id: '/chat', label: 'Chat', sub: 'conversation console', href: '/chat', icon: 'chat', group: 'Routes' },
  { id: '/github', label: 'GitHub', sub: 'repos & activity', href: '/github', icon: 'github', group: 'Routes' },
  { id: '/costs', label: 'Costs', sub: 'billing & burn', href: '/costs', icon: 'costs', group: 'Routes' },
  { id: '/projects', label: 'Projects', sub: 'workspace', href: '/projects', icon: 'projects', group: 'Routes' },
  { id: '/pipeline', label: 'Web Dev Pipeline', sub: 'client delivery', href: '/pipeline', icon: 'pipeline', group: 'Routes' },
  { id: '/ml-content', label: 'ML Content', sub: 'content engine', href: '/ml-content', icon: 'ml', group: 'Routes' },
  { id: '/memory', label: 'Memory', sub: 'vault & notes', href: '/memory', icon: 'memory', group: 'Routes' },
  { id: '/team', label: 'Team', sub: 'agent command mesh', href: '/team', icon: 'team', group: 'Routes' },
  { id: '/setup', label: 'Setup', sub: 'configuration', href: '/setup', icon: 'setup', group: 'Routes' },
]

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Subsequence fuzzy match: does every char of needle appear in order in hay? */
function fuzzy(hay: string, needle: string): boolean {
  const h = normalize(hay)
  const n = normalize(needle)
  if (!n) return true
  let i = 0
  for (const ch of h) if (ch === n[i]) i++
  return i === n.length
}

export function CommandPalette() {
  const router = useRouter()
  const pathname = usePathname()
  const { data } = useLiveData()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback(() => {
    setOpen(o => {
      const next = !o
      if (next) { setQuery(''); setCursor(0) }
      return next
    })
  }, [])

  // Global keyboard trigger + visible-trigger event (headers/nav can open it)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); toggle()
      } else if (!typing && (e.key === '/' || e.key === '>')) {
        // only '/' triggers; '>' is captured as a query char when open
        if (e.key === '/' && !open) { e.preventDefault(); toggle(); setQuery('') }
      }
    }
    const onOpen = () => toggle()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mc:open-cmdp', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mc:open-cmdp', onOpen)
    }
  }, [toggle, open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    // focus the input on open (after render)
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    // reset cursor when results change
    setCursor(0)
    return () => { window.removeEventListener('keydown', onKey); cancelAnimationFrame(raf) }
  }, [open])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const q = query.trim().startsWith('>') ? query.trim().slice(1).trim() : query.trim()
    const forceGroup = query.trim().startsWith('>') ? 'Routes' : query.trim().startsWith('g ') ? 'Agents' : null

    const agents: Item[] = (data?.crew ?? []).map(a => ({
      id: `agent-${a.id}`, label: a.name, sub: `${a.status} · ${a.role ?? 'agent'}`, href: '/team', icon: 'team', group: 'Agents',
    }))
    const tasks: Item[] = (data?.tasks ?? []).slice(0, 40).map(t => ({
      id: `task-${t.id}`, label: t.title, sub: `task · ${t.ownerName ?? t.status ?? ''}`, href: '/kanban', icon: 'kanban', group: 'Tasks',
    }))

    const all = [...ROUTES, ...agents, ...tasks]
    const filtered = all.filter(it =>
      (!forceGroup || it.group === forceGroup) &&
      (q === '' || fuzzy(`${it.label} ${it.group} ${it.sub ?? ''}`, q))
    )
    // Stable ordering: groups in fixed order, then alpha within group
    const groupOrder = ['Routes', 'Agents', 'Tasks']
    return filtered.sort((a, b) => {
      const ga = groupOrder.indexOf(a.group); const gb = groupOrder.indexOf(b.group)
      return ga === gb ? a.label.localeCompare(b.label) : ga - gb
    }).slice(0, 24)
  }, [query, data])

  useEffect(() => { if (cursor >= items.length) setCursor(0) }, [items.length, cursor])

  const go = useCallback((it: Item) => {
    setOpen(false)
    if (pathname !== it.href) router.push(it.href)
  }, [router, pathname])

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[cursor]; if (it) go(it) }
  }

  // keep the active row in view
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  let lastGroup = ''
  return (
    <div className="cmdp-layer" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="cmdp-backdrop" onClick={() => setOpen(false)} />
      <div className="cmdp" onClick={e => e.stopPropagation()}>
        <div className="cmdp-inputrow">
          <span className="cmdp-prompt">&gt;_</span>
          <input
            ref={inputRef}
            className="cmdp-input"
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={onInputKey}
            placeholder="Jump to a page, agent, task…  (try  g forge  or  > costs)"
            aria-label="Command palette search"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmdp-kbd">esc</kbd>
        </div>
        {items.length === 0 ? (
          <div className="cmdp-empty">— no matches —</div>
        ) : (
          <div className="cmdp-list" ref={listRef}>
            {items.map((it, i) => {
              const showGroup = it.group !== lastGroup
              lastGroup = it.group
              return (
                <div key={it.id}>
                  {showGroup && <div className="cmdp-group">{it.group}</div>}
                  <div
                    role="option"
                    aria-selected={i === cursor}
                    className={`cmdp-item ${i === cursor ? 'is-active' : ''}`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(it)}
                  >
                    <span className="cmdp-ic"><Icon name={it.icon} size={15} /></span>
                    <span className="cmdp-label">{it.label}</span>
                    <span className="cmdp-sub">{it.sub}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div className="cmdp-foot">
          <span>↑↓ navigate</span><span>↵ go</span><span>esc close</span>
        </div>
      </div>
    </div>
  )
}
