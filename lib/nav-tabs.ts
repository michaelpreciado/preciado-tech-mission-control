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
  { section: 'Now', items: [
    { id: '/', label: 'Home', icon: 'deck' },
    { id: '/kanban', label: 'Kanban', icon: 'kanban' },
    { id: '/crew', label: 'Crew', icon: 'team' },
    { id: '/chat', label: 'Chat', icon: 'chat' },
  ]},
  { section: 'Operations', items: [
    { id: '/pipeline', label: 'Pipeline', icon: 'pipeline' },
    { id: '/projects', label: 'Clients', icon: 'projects' },
    { id: '/content-creation', label: 'Content Creation', icon: 'content' },
    { id: '/calendar', label: 'Calendar', icon: 'calendar' },
  ]},
  { section: 'Insight', items: [
    { id: '/github', label: 'GitHub', icon: 'github' },
    { id: '/costs', label: 'Costs', icon: 'costs' },
  ]},
  { section: 'Machine', items: [
    { id: '/system', label: 'System', icon: 'memory' },
    { id: '/memory', label: 'Memory', icon: 'memory' },
    { id: '/setup', label: 'Setup', icon: 'setup' },
  ]},
]

/** Home and Setup are always reachable — hiding either would be a self-lockout. */
export const PINNED_TAB_IDS = new Set(['/', '/setup'])

/** Flat id/label/section list, in default order. */
export const NAV_TABS: { id: string; label: string; section: string; pinned: boolean }[] =
  NAV.flatMap(sec => sec.items.map(it => ({ id: it.id, label: it.label, section: sec.section, pinned: PINNED_TAB_IDS.has(it.id) })))

export type NavUi = { hiddenTabs: string[]; tabOrder: string[] }

/** Hide non-pinned tabs the user turned off and reorder items within each
 *  section. Array.sort is stable, so ids missing from tabOrder keep their order. */
export function applyUiToNav(ui: NavUi): NavSection[] {
  return NAV
    .map(sec => ({
      section: sec.section,
      items: sec.items
        .filter(it => PINNED_TAB_IDS.has(it.id) || !ui.hiddenTabs.includes(it.id))
        .slice()
        .sort((a, b) => {
          const ia = ui.tabOrder.indexOf(a.id)
          const ib = ui.tabOrder.indexOf(b.id)
          if (ia === -1 && ib === -1) return 0
          if (ia === -1) return 1
          if (ib === -1) return -1
          return ia - ib
        }),
    }))
    .filter(sec => sec.items.length > 0)
}
