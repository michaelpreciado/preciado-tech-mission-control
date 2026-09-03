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
 *   "c <query>"       → search the conversation archive, jump into a thread
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useLiveData } from './LiveDataProvider'
import { Icon, type IconName } from './icons'

type Item = { id: string; label: string; sub?: string; href: string; icon: IconName; group: string }

const ROUTES: Item[] = [
  { id: '/', label: 'Home', sub: 'command center', href: '/', icon: 'deck', group: 'Routes' },
  { id: '/kanban', label: 'Kanban', sub: 'task board', href: '/kanban', icon: 'kanban', group: 'Routes' },
  { id: '/calendar', label: 'Calendar', sub: 'scheduler / today', href: '/calendar', icon: 'calendar', group: 'Routes' },
  { id: '/chat', label: 'Chat', sub: 'conversation console', href: '/chat', icon: 'chat', group: 'Routes' },
  { id: '/github', label: 'GitHub', sub: 'repos & activity', href: '/github', icon: 'github', group: 'Routes' },
  { id: '/costs', label: 'Costs', sub: 'billing & burn', href: '/costs', icon: 'costs', group: 'Routes' },
  { id: '/projects', label: 'Projects', sub: 'workspace', href: '/projects', icon: 'projects', group: 'Routes' },
  { id: '/pipeline', label: 'Web Dev Pipeline', sub: 'client delivery', href: '/pipeline', icon: 'pipeline', group: 'Routes' },
  { id: '/content-creation', label: 'Content Creation', sub: 'content engine', href: '/content-creation', icon: 'content', group: 'Routes' },
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
  const [convItems, setConvItems] = useState<Item[]>([])
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

  // Escape to close. Reset cursor on open — deliberately no autofocus here:
  // focusing the input immediately pops the on-screen keyboard on touch
  // devices, covering the list before the user can tap or arrow through it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    setCursor(0)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // "c <query>" → search the conversation archive. Reuses the existing
  // /api/conversations list endpoint (q + limit); jumps into /chat pre-filtered
  // to the owning agent. Debounced; aborts the in-flight request on each keystroke.
  const convMatch = query.trim().match(/^c\s+(.*)$/i)
  const convQuery = convMatch ? convMatch[1].trim() : null
  useEffect(() => {
    if (!open || convQuery === null) { setConvItems([]); return }
    if (!convQuery) { setConvItems([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/conversations?q=${encodeURIComponent(convQuery)}&limit=8`, { cache: 'no-store', signal: ctrl.signal })
        .then(r => (r.ok ? r.json() : null))
        .then((j: { conversations?: Array<{ id: string; title: string; profile: string; device: string; source?: string }> } | null) => {
          if (!j) return
          setConvItems((j.conversations ?? []).map(c => ({
            id: `conv-${c.device}-${c.profile}-${c.id}`,
            label: c.title || '(untitled)',
            sub: `chat · ${c.profile}${c.device ? ` · ${c.device}` : ''}`,
            href: `/chat?profile=${encodeURIComponent(c.profile)}&session=${encodeURIComponent(c.id)}`,
            icon: 'chat' as IconName,
            group: 'Conversations',
          })))
        })
        .catch(() => { /* aborted / offline */ })
    }, 200)
    return () => { ctrl.abort(); clearTimeout(t) }
  }, [open, convQuery])

  const items = useMemo<Item[]>(() => {
    if (convQuery !== null) return convItems.slice(0, 16)
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
  }, [query, data, convQuery, convItems])

  useEffect(() => { if (cursor >= items.length) setCursor(0) }, [items.length, cursor])

  const go = useCallback((it: Item) => {
    setOpen(false)
    if (pathname !== it.href) router.push(it.href)
  }, [router, pathname])

  // Arrow-key / Enter navigation lives on a window-level listener (not the
  // input's onKeyDown) so it keeps working whether or not the input has
  // focus — the palette opens with focus intentionally left on nothing,
  // so touch users can arrow/tap through the list without the on-screen
  // keyboard covering it. The first printable keystroke focuses the input
  // so desktop keyboard users can still just start typing.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); setCursor(c => Math.max(c - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault(); const it = items[cursor]; if (it) go(it)
      } else if (
        document.activeElement !== inputRef.current &&
        e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey
      ) {
        // first printable keystroke while the input isn't focused: focus it
        // and forward the character (browser default text-insertion only
        // applies to whatever element already had focus at keydown time).
        e.preventDefault()
        inputRef.current?.focus()
        setQuery(q => q + e.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items, cursor, go])

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
        <div className="cmdp-inputrow" onClick={() => inputRef.current?.focus()}>
          <span className="cmdp-prompt">&gt;_</span>
          <input
            ref={inputRef}
            className="cmdp-input"
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0) }}
            placeholder="Jump to a page, agent, task…  (try  g forge  ·  > costs  ·  c <chat>)"
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
