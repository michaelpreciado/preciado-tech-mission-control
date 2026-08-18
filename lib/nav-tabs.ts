/**
 * Canonical sidebar/mobile-nav tab list — the single source components/Shell.tsx
 * builds its nav from, and app/setup/page.tsx's UI CUSTOMIZATION group reads
 * to build tab-visibility/reorder controls. Split out of Shell.tsx (a heavy
 * 'use client' module pulling in LiveDataProvider/CommandPalette/AmbientNeuralField)
 * so the Setup page doesn't drag that whole chunk in just to list tab ids/labels.
 *
 * `icon` is typed as the real IconName union — `import type` is erased
 * entirely at compile time, so this doesn't pull components/icons's runtime
 * code (or anything else) into the Setup page's bundle.
 */
import type { IconName } from '@/components/icons'

export type NavItem = { id: string; label: string; icon: IconName }
export type NavSection = { section: string; items: NavItem[] }

export const NAV: NavSection[] = [
  { section: 'Overview', items: [
    { id: '/', label: 'Home', icon: 'deck' },
    { id: '/kanban', label: 'Kanban', icon: 'kanban' },
    { id: '/calendar', label: 'Calendar', icon: 'calendar' },
  ]},
  { section: 'Intelligence', items: [
    { id: '/chat', label: 'Chat', icon: 'chat' },
    { id: '/github', label: 'GitHub', icon: 'github' },
    { id: '/costs', label: 'Costs', icon: 'costs' },
  ]},
  { section: 'Operations', items: [
    { id: '/projects', label: 'Projects', icon: 'projects' },
    { id: '/pipeline', label: 'Web Dev Pipeline', icon: 'pipeline' },
    { id: '/content-creation', label: 'Content Creation', icon: 'content' },
  ]},
  { section: 'System', items: [
    { id: '/memory', label: 'Memory', icon: 'memory' },
    { id: '/team', label: 'Team', icon: 'team' },
    { id: '/setup', label: 'Setup', icon: 'setup' },
  ]},
]

/** Home and Setup are always reachable — hiding either would be a self-lockout. */
export const PINNED_TAB_IDS = new Set(['/', '/setup'])

/** Flat id/label/section list, in default order. */
export const NAV_TABS: { id: string; label: string; section: string; pinned: boolean }[] =
  NAV.flatMap(sec => sec.items.map(it => ({ id: it.id, label: it.label, section: sec.section, pinned: PINNED_TAB_IDS.has(it.id) })))
