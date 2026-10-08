'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Icon } from './icons'
import { apiFetch } from '@/lib/api-base'
import { COMMAND_CATALOG, paletteSnapshot } from '@/lib/pt/catalog'
import { compatibleCommands } from '@/lib/pt/command-display.mjs'
import { blockedLabelFor } from '@/lib/pt/blocked-labels.mjs'
import { COMMAND_ICONS } from '@/lib/nav-tabs'
import { CADENCE } from '@/lib/pt/contract'
import type { DestinationId } from '@/lib/pt/catalog'

/** Four business destinations, shared with the native launcher. */
export function CommandPalette() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [envelope, setEnvelope] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const focusInput = useRef(true)
  const view = useMemo(() => paletteSnapshot(envelope, now, error !== null, error), [envelope, now, error])
  const items = useMemo(() => {
    const needle = query.trim().replace(/^>\s*/, '').toLowerCase()
    return view.groups.flatMap(group => group.commands).filter(command =>
      `${command.label} ${command.practiceArea}`.toLowerCase().includes(needle))
  }, [query, view])
  const close = useCallback(() => setOpen(false), [])
  const show = useCallback((focus = true) => {
    previousFocus.current = document.activeElement as HTMLElement | null
    focusInput.current = focus
    setQuery(''); setCursor(0); setOpen(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); if (open) close(); else show()
      } else if (open && e.key === 'Escape') {
        // Also cover the frame before focus transfers from the mobile trigger.
        e.preventDefault(); close()
      } else if (!typing && e.key === '/' && !open) { e.preventDefault(); show() }
    }
    const onOpen = (e: Event) => show((e as CustomEvent).detail?.focus ?? !window.matchMedia('(pointer: coarse)').matches)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mc:open-cmdp', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mc:open-cmdp', onOpen) }
  }, [open, show, close])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    let busy = false
    const refresh = async () => {
      if (busy) return
      busy = true
      try {
        const response = await apiFetch('/api/commands', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? 'access_denied' : 'refresh_failed')
        const value = await response.json()
        if (!compatibleCommands(value, COMMAND_CATALOG) || value.data === null) throw Error('invalid_snapshot')
        if (!controller.signal.aborted) { setEnvelope(value); setError(null); setNow(Date.now()) }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error && ['access_denied', 'invalid_snapshot'].includes(err.message) ? err.message : 'refresh_failed')
      } finally { busy = false }
    }
    void refresh()
    const poll = setInterval(refresh, CADENCE.command.pollMs)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { controller.abort(); clearInterval(poll); clearInterval(tick) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Defer past the mobile More sheet's focus restoration.
    const focus = requestAnimationFrame(() => (focusInput.current ? inputRef.current : dialogRef.current)?.focus())
    return () => {
      cancelAnimationFrame(focus)
      document.body.style.overflow = overflow
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
      else document.querySelector<HTMLElement>('[data-mobile-nav] button')?.focus({ preventScroll: true })
    }
  }, [open])

  useEffect(() => { setCursor(0) }, [query])
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>(`#cmdp-option-${items[cursor]?.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }, [cursor, items])

  const go = (id: string) => {
    // Recheck expiration at activation, even between display-clock ticks.
    const command = paletteSnapshot(envelope, Date.now(), error !== null, error).commands.find(row => row.id === id)
    if (!command?.enabled) return
    close()
    if (pathname !== command.webPath) router.push(command.webPath)
  }
  if (!open) return null
  let lastGroup = ''
  return (
    <div className="cmdp-layer" role="dialog" aria-modal="true" aria-label="Command palette" ref={dialogRef} tabIndex={-1}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setCursor(i => items.length ? (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length : 0) }
        else if (e.key === 'Enter' && e.target !== dialogRef.current?.querySelector('button')) { e.preventDefault(); if (items[cursor]) go(items[cursor].id) }
        else if (e.key === 'Tab') {
          const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input, button') ?? [])
          const index = controls.indexOf(document.activeElement as HTMLElement)
          e.preventDefault(); controls[(index + (e.shiftKey ? controls.length - 1 : 1)) % controls.length]?.focus()
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && e.target === dialogRef.current) {
          e.preventDefault(); setQuery(q => q + e.key); inputRef.current?.focus()
        }
      }}>
      <div className="cmdp-backdrop" onClick={close} />
      <div className="cmdp">
        <div className="cmdp-inputrow">
          <span className="cmdp-prompt">&gt;_</span>
          <input ref={inputRef} className="cmdp-input" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search practice areas or destinations…" aria-label="Command palette search" autoComplete="off" spellCheck={false}
            role="combobox" aria-expanded="true" aria-controls="cmdp-list" aria-autocomplete="list" aria-activedescendant={items[cursor] ? `cmdp-option-${items[cursor].id}` : undefined} />
          <button type="button" className="cmdp-kbd" onClick={close} aria-label="Close command palette">esc</button>
        </div>
        <div className="cmdp-status" role="status">{view.label}{error ? ` · ${error}` : ''}</div>
        <div className="cmdp-list" id="cmdp-list" role="listbox" aria-label="Destinations">
          {items.length === 0 && <div className="cmdp-empty">— no matches —</div>}
          {items.map((command, i) => {
            const showGroup = command.practiceArea !== lastGroup
            lastGroup = command.practiceArea
            return <div key={command.id} role="presentation">
              {showGroup && <div className="cmdp-group" role="presentation">{command.practiceArea}</div>}
              <div id={`cmdp-option-${command.id}`} data-command-id={command.id} role="option" aria-selected={i === cursor} aria-disabled={!command.enabled}
                className={`cmdp-item ${i === cursor ? 'is-active' : ''}`} onMouseEnter={() => setCursor(i)} onClick={() => { setCursor(i); go(command.id) }}>
                <span className="cmdp-ic"><Icon name={COMMAND_ICONS[command.id as DestinationId]} size={15} /></span>
                <span className="cmdp-copy"><span className="cmdp-label">{command.label}</span>
                  {!command.enabled && <span className="cmdp-reason">Disabled · {blockedLabelFor(command.blockedReason)}</span>}</span>
                {command.badge && <span className="cmdp-sub">{command.badge.value ?? '—'} · {command.badge.label}</span>}
              </div>
            </div>
          })}
        </div>
        <div className="cmdp-foot"><span>↑↓ navigate</span><span>↵ open</span><span>esc close</span></div>
      </div>
    </div>
  )
}
