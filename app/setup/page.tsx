'use client'

/**
 * F.R.I.D.A.Y. setup — configure the harness from the browser.
 * Writes data/config.json via /api/setup (local-only, gitignored).
 * Bring-your-own keys: nothing here ever leaves this machine.
 */
import { useEffect, useState } from 'react'
import { Button, SectionHead } from '@/components/ui'
import { ACCENT_PRESETS, DEFAULT_ACCENT } from '@/lib/theme'
import { NAV_TABS, PINNED_TAB_IDS } from '@/lib/nav-tabs'
import '../vf/v3-lane.css'

type MotionSetting = 'full' | 'reduced' | 'off'
type Density = 'compact' | 'expanded'
type Elements3d = { coreOrb: boolean; memoryGraph: boolean; teamGraph: boolean }

type SetupConfig = {
  appName: string
  appTagline: string
  homeDir: string
  github: { username: string; projectRepo: string }
  paths: Record<string, string>
  services: Record<string, string>
  appearance: {
    accentColor: string
    motion: MotionSetting
    density: Density
    hiddenTabs: string[]
    tabOrder: string[]
    elements3d: Elements3d
  }
  keysSet: { openrouterApiKey: boolean; ticktickToken: boolean }
}

/** All known tab ids in their default relative order — the baseline that
 * hiddenTabs/tabOrder are patches on top of. */
const ALL_TAB_IDS = NAV_TABS.map(t => t.id)

/** The tab order a saved `tabOrder` patch resolves to: listed ids first (in
 * their saved order), everything else appended in its original default
 * position. Mirrors components/Shell.tsx's applyUiToNav sort exactly, just
 * flattened across sections so the reorder buttons can operate on one list. */
function effectiveTabOrder(tabOrder: string[]): string[] {
  return [...ALL_TAB_IDS].sort((a, b) => {
    const ia = tabOrder.indexOf(a)
    const ib = tabOrder.indexOf(b)
    if (ia === -1 && ib === -1) return 0
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

type Field = { section: 'github' | 'paths' | 'services'; key: string; label: string; hint?: string }

const FIELD_GROUPS: { title: string; sub: string; fields: Field[] }[] = [
  {
    title: 'GITHUB',
    sub: 'contributions heatmap, repo grid, pinned project',
    fields: [
      { section: 'github', key: 'username', label: 'GitHub username', hint: 'blank = GitHub panel disabled' },
      { section: 'github', key: 'projectRepo', label: 'Pinned repo (owner/name)', hint: 'shown on top of Projects' },
    ],
  },
  {
    title: 'AGENT RUNTIME',
    sub: 'where your agents keep their state',
    fields: [
      { section: 'paths', key: 'agentsDir', label: 'Agent sessions dir', hint: 'per-agent session stores + usage JSONL (costs)' },
      { section: 'paths', key: 'workspaceDir', label: 'Agent workspace dir', hint: 'MEMORY.md, ideas.json, task checklists' },
      { section: 'paths', key: 'kanbanDbFile', label: 'Kanban SQLite DB', hint: 'read-only multi-agent task store' },
      { section: 'paths', key: 'cronJobsFile', label: 'Cron jobs.json', hint: 'scheduler state file' },
      { section: 'paths', key: 'gatewayStateFile', label: 'Gateway state file', hint: 'probed for system health' },
    ],
  },
  {
    title: 'KNOWLEDGE & FILES',
    sub: 'notes, logs, inbox — all optional',
    fields: [
      { section: 'paths', key: 'vaultDir', label: 'Notes vault dir', hint: 'e.g. an Obsidian vault; blank = disabled' },
      { section: 'paths', key: 'projectVaultDir', label: 'Project sub-vault dir' },
      { section: 'paths', key: 'projectWorkspaceDir', label: 'Project workspace dir' },
      { section: 'paths', key: 'repoDir', label: 'Local repo to watch' },
      { section: 'paths', key: 'inboxDir', label: 'Inbox dir' },
      { section: 'paths', key: 'usageLogsDir', label: 'Usage logs dir' },
      { section: 'paths', key: 'googleCalendarCredsFile', label: 'Google Calendar service-account JSON', hint: 'blank = calendar disabled' },
    ],
  },
  {
    title: 'PIPELINES',
    sub: 'kanban boards fed by external skills/agents',
    fields: [
      { section: 'paths', key: 'pipelineDir', label: 'Web-dev pipeline dir', hint: 'pipeline.json + events.jsonl' },
      { section: 'paths', key: 'mlContentIdeasDir', label: 'ML content ideas dir', hint: 'week-N.json files' },
    ],
  },
  {
    title: 'LOCAL SERVICES',
    sub: 'liveness probes on the Ops page',
    fields: [
      { section: 'services', key: 'eventbusUrl', label: 'Event bus SSE URL' },
      { section: 'services', key: 'openclawGatewayUrl', label: 'Agent gateway URL' },
      { section: 'services', key: 'ollamaUrl', label: 'Ollama URL' },
      { section: 'services', key: 'llmsterUrl', label: 'Local LLM server URL' },
    ],
  },
]

export default function SetupPage() {
  const [cfg, setCfg] = useState<SetupConfig | null>(null)
  const [configured, setConfigured] = useState(false)
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [ticktickKey, setTicktickKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [dragTabId, setDragTabId] = useState<string | null>(null)
  const [overTabId, setOverTabId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/setup', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { setCfg(j.config); setConfigured(Boolean(j.configured)) })
      .catch(() => setFlash({ tone: 'err', text: 'Could not load current config.' }))
  }, [])

  const set = (section: keyof SetupConfig | 'root' | 'appearance', key: string, value: string) => {
    setCfg(prev => {
      if (!prev) return prev
      if (section === 'root') return { ...prev, [key]: value }
      const branch = prev[section as 'github' | 'paths' | 'services' | 'appearance'] as Record<string, string>
      return { ...prev, [section]: { ...branch, [key]: value } }
    })
  }

  // appearance now carries non-string fields (enums/arrays/nested booleans),
  // so it gets its own typed setter instead of overloading set()'s string-only cast.
  const setAppearance = <K extends keyof SetupConfig['appearance']>(key: K, value: SetupConfig['appearance'][K]) => {
    setCfg(prev => prev ? { ...prev, appearance: { ...prev.appearance, [key]: value } } : prev)
  }

  const toggleHiddenTab = (id: string) => {
    if (PINNED_TAB_IDS.has(id) || !cfg) return
    const hidden = cfg.appearance.hiddenTabs.includes(id)
      ? cfg.appearance.hiddenTabs.filter(t => t !== id)
      : [...cfg.appearance.hiddenTabs, id]
    setAppearance('hiddenTabs', hidden)
  }

  // Native drag reorder — drop `draggedId` onto `targetId`'s slot within the
  // same section. Writes a fully-flattened order so effectiveTabOrder resolves
  // it verbatim. The ↑/↓ buttons stay as a touch/keyboard fallback.
  const reorderTab = (draggedId: string, targetId: string) => {
    if (!cfg || draggedId === targetId) return
    const dSection = NAV_TABS.find(t => t.id === draggedId)?.section
    const tSection = NAV_TABS.find(t => t.id === targetId)?.section
    if (!dSection || dSection !== tSection) return
    const order = effectiveTabOrder(cfg.appearance.tabOrder).filter(id => id !== draggedId)
    const at = order.indexOf(targetId)
    if (at === -1) return
    order.splice(at, 0, draggedId)
    setAppearance('tabOrder', order)
  }

  const moveTab = (id: string, dir: -1 | 1) => {
    if (!cfg) return
    const order = effectiveTabOrder(cfg.appearance.tabOrder)
    const section = NAV_TABS.find(t => t.id === id)?.section
    const sectionIds = order.filter(x => NAV_TABS.find(t => t.id === x)?.section === section)
    const idx = sectionIds.indexOf(id)
    const otherId = sectionIds[idx + dir]
    if (!otherId) return // already at that edge of its section
    const next = [...order]
    const posA = next.indexOf(id)
    const posB = next.indexOf(otherId)
    ;[next[posA], next[posB]] = [next[posB], next[posA]]
    setAppearance('tabOrder', next)
  }

  const toggleElement3d = (key: keyof Elements3d) => {
    if (!cfg) return
    setAppearance('elements3d', { ...cfg.appearance.elements3d, [key]: !cfg.appearance.elements3d[key] })
  }

  async function save() {
    if (!cfg) return
    setBusy(true)
    setFlash(null)
    const body: Record<string, unknown> = {
      appName: cfg.appName,
      appTagline: cfg.appTagline,
      github: cfg.github,
      paths: cfg.paths,
      services: cfg.services,
      appearance: cfg.appearance,
    }
    const keys: Record<string, string> = {}
    if (openrouterKey.trim()) keys.openrouterApiKey = openrouterKey.trim()
    if (ticktickKey.trim()) keys.ticktickToken = ticktickKey.trim()
    if (Object.keys(keys).length) body.keys = keys
    try {
      const res = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setOpenrouterKey('')
      setTicktickKey('')
      setConfigured(true)
      setFlash({ tone: 'ok', text: j.note || 'Saved.' })
    } catch (err) {
      setFlash({ tone: 'err', text: `Save failed: ${(err as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  async function seedDemo() {
    const force = configured
      ? window.confirm('data/config.json already exists. Point it at the demo dataset? (a .bak backup is kept)')
      : false
    if (configured && !force) return
    setBusy(true)
    setFlash(null)
    try {
      const res = await fetch(`/api/setup/demo${force ? '?force=1' : ''}`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setFlash({ tone: 'ok', text: 'Demo data seeded — open the Deck to see it live.' })
      const fresh = await fetch('/api/setup', { cache: 'no-store' }).then(r => r.json())
      setCfg(fresh.config)
      setConfigured(Boolean(fresh.configured))
    } catch (err) {
      setFlash({ tone: 'err', text: `Demo seeding failed: ${(err as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionHead label="SETUP / CONFIGURE F.R.I.D.A.Y." />
      <div className="v3-kicker"><span className="jp">設定</span> configure</div>
      <div className="mc-setup">
        <div className="mc-setup-intro">
          <p><strong>Local-first, bring-your-own-keys.</strong> Everything below is written to
          <code> data/config.json</code> — gitignored, never synced, never sent anywhere.
          Blank fields simply disable their panel; the dashboard degrades gracefully.</p>
          <div className="mc-setup-actions">
            <Button variant="ghost" onClick={seedDemo} disabled={busy}>
              ▶ LOAD DEMO DATA
            </Button>
            <span className="mc-setup-hint">New here? Seed a realistic demo dataset first, explore, then point the paths at your own agents.</span>
          </div>
        </div>

        {flash && (
          <div className={`mc-setup-flash ${flash.tone}`}>{flash.tone === 'ok' ? '✓' : '⚠'} {flash.text}</div>
        )}

        {!cfg ? (
          <div className="mc-setup-loading">loading current config…</div>
        ) : (
          <>
            <div className="mc-setup-group">
              <div className="mc-setup-group-head">IDENTITY</div>
              <label className="mc-setup-field">
                <span>App name (brand)</span>
                <input value={cfg.appName} onChange={e => set('root', 'appName', e.target.value)} maxLength={40} />
                <em>shown in the sidebar + header · restart to update page metadata</em>
              </label>
              <label className="mc-setup-field">
                <span>Tagline</span>
                <input value={cfg.appTagline} onChange={e => set('root', 'appTagline', e.target.value)} maxLength={80} />
              </label>
              <div className="mc-setup-field">
                <span>Accent color</span>
                <div className="mc-setup-swatches">
                  {ACCENT_PRESETS.map(p => (
                    <button
                      key={p.hex}
                      type="button"
                      title={p.name}
                      className={`mc-swatch ${cfg.appearance.accentColor.toLowerCase() === p.hex ? 'is-active' : ''}`}
                      style={{ background: p.hex, boxShadow: `0 0 10px ${p.hex}88` }}
                      onClick={() => set('appearance', 'accentColor', p.hex)}
                    />
                  ))}
                  <input
                    type="color"
                    aria-label="Custom accent color"
                    value={/^#[0-9a-fA-F]{6}$/.test(cfg.appearance.accentColor) ? cfg.appearance.accentColor : DEFAULT_ACCENT}
                    onChange={e => set('appearance', 'accentColor', e.target.value)}
                  />
                </div>
                <em>recolors the entire neon token system · applies on next page load, no restart needed</em>
              </div>
            </div>

            <div className="mc-setup-group">
              <div className="mc-setup-group-head">UI CUSTOMIZATION <span>motion, density, nav, 3D elements · applies on next page load, no restart needed (like accent color)</span></div>

              <div className="mc-setup-field">
                <span>Motion</span>
                <div className="mc-setup-swatches">
                  {(['full', 'reduced', 'off'] as const).map(m => (
                    <Button key={m} variant="ghost" active={cfg.appearance.motion === m} onClick={() => setAppearance('motion', m)}>
                      {m.toUpperCase()}
                    </Button>
                  ))}
                </div>
                <em>full = defer to OS reduced-motion/battery only · reduced &amp; off both freeze every ambient/3D element to a static frame</em>
              </div>

              <div className="mc-setup-field">
                <span>Card density</span>
                <div className="mc-setup-swatches">
                  {(['compact', 'expanded'] as const).map(d => (
                    <Button key={d} variant="ghost" active={cfg.appearance.density === d} onClick={() => setAppearance('density', d)}>
                      {d.toUpperCase()}
                    </Button>
                  ))}
                </div>
                <em>card padding/gap across the dashboard</em>
              </div>

              <div className="mc-setup-field">
                <span>3D / ambient elements</span>
                <div className="mc-setup-swatches">
                  <Button variant="ghost" active={cfg.appearance.elements3d.coreOrb} onClick={() => toggleElement3d('coreOrb')}>
                    GLOBAL CORE ORB · {cfg.appearance.elements3d.coreOrb ? 'ON' : 'OFF'}
                  </Button>
                  <Button variant="ghost" active={cfg.appearance.elements3d.memoryGraph} onClick={() => toggleElement3d('memoryGraph')}>
                    MEMORY GRAPH · {cfg.appearance.elements3d.memoryGraph ? 'ON' : 'OFF'}
                  </Button>
                  <Button variant="ghost" active={cfg.appearance.elements3d.teamGraph} onClick={() => toggleElement3d('teamGraph')}>
                    TEAM GRAPH · {cfg.appearance.elements3d.teamGraph ? 'ON' : 'OFF'}
                  </Button>
                </div>
                <em>turn off the heavier WebGL/graph views on lower-power machines · Memory/Team graph fall back to their existing list views · Core orb controls the global navigation heartbeat</em>
              </div>

              <div className="mc-setup-field mc-setup-tabs">
                <span>Sidebar / mobile-nav tabs</span>
                <div className="mc-setup-tablist">
                  {Object.entries(
                    effectiveTabOrder(cfg.appearance.tabOrder).reduce<Record<string, typeof NAV_TABS>>((acc, id) => {
                      const t = NAV_TABS.find(x => x.id === id)
                      if (!t) return acc
                      ;(acc[t.section] ??= []).push(t)
                      return acc
                    }, {}),
                  ).map(([section, tabs]) => (
                    <div key={section} className="mc-setup-tabsection">
                      <div className="mc-setup-tabsection-head">{section}</div>
                      {tabs.map((t, i) => {
                        const hidden = cfg.appearance.hiddenTabs.includes(t.id)
                        return (
                          <div
                            key={t.id}
                            className={`mc-setup-tabrow${dragTabId === t.id ? ' setup-tabrow--dragging' : ''}${overTabId === t.id && dragTabId && dragTabId !== t.id ? ' setup-tabrow--over' : ''}`}
                            draggable
                            onDragStart={e => { setDragTabId(t.id); e.dataTransfer.effectAllowed = 'move' }}
                            onDragEnd={() => { setDragTabId(null); setOverTabId(null) }}
                            onDragOver={e => { if (dragTabId && dragTabId !== t.id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverTabId(t.id) } }}
                            onDragLeave={() => setOverTabId(prev => (prev === t.id ? null : prev))}
                            onDrop={e => { e.preventDefault(); if (dragTabId) reorderTab(dragTabId, t.id); setDragTabId(null); setOverTabId(null) }}
                          >
                            <span className="setup-tabrow-grip" aria-hidden="true" title="Drag to reorder">⠿</span>
                            <span className="mc-setup-tabrow-label">
                              {t.label}{t.pinned && <em> · pinned</em>}
                            </span>
                            <div className="mc-setup-tabrow-actions">
                              <Button variant="ghost" disabled={i === 0} onClick={() => moveTab(t.id, -1)} aria-label={`Move ${t.label} up`}>↑</Button>
                              <Button variant="ghost" disabled={i === tabs.length - 1} onClick={() => moveTab(t.id, 1)} aria-label={`Move ${t.label} down`}>↓</Button>
                              <Button
                                variant="ghost"
                                active={!hidden}
                                disabled={t.pinned}
                                onClick={() => toggleHiddenTab(t.id)}
                              >
                                {hidden ? 'HIDDEN' : 'VISIBLE'}
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                <em>hide tabs you don&apos;t use, reorder within a section · Home and Setup can&apos;t be hidden</em>
              </div>
            </div>

            <div className="mc-setup-group">
              <div className="mc-setup-group-head">API KEYS</div>
              <label className="mc-setup-field">
                <span>OpenRouter API key {cfg.keysSet.openrouterApiKey && <b className="is-set">· configured ✓</b>}</span>
                <input
                  type="password"
                  value={openrouterKey}
                  onChange={e => setOpenrouterKey(e.target.value)}
                  placeholder={cfg.keysSet.openrouterApiKey ? '•••••••• (leave blank to keep)' : 'sk-or-…'}
                  autoComplete="off"
                />
                <em>used server-side for live billing on the Costs tab · never returned by any API</em>
              </label>
              <label className="mc-setup-field">
                <span>TickTick API token {cfg.keysSet.ticktickToken && <b className="is-set">· configured ✓</b>}</span>
                <input
                  type="password"
                  value={ticktickKey}
                  onChange={e => setTicktickKey(e.target.value)}
                  placeholder={cfg.keysSet.ticktickToken ? '•••••••• (leave blank to keep)' : 'OAuth bearer token'}
                  autoComplete="off"
                />
                <em>used server-side for the weekly ASCII calendar on the Calendar tab · never returned by any API</em>
              </label>
            </div>

            {FIELD_GROUPS.map(group => (
              <div className="mc-setup-group" key={group.title}>
                <div className="mc-setup-group-head">{group.title} <span>{group.sub}</span></div>
                {group.fields.map(f => {
                  const branch = cfg[f.section] as Record<string, string>
                  return (
                    <label className="mc-setup-field" key={`${f.section}.${f.key}`}>
                      <span>{f.label}</span>
                      <input value={branch[f.key] ?? ''} onChange={e => set(f.section, f.key, e.target.value)} spellCheck={false} />
                      {f.hint && <em>{f.hint}</em>}
                    </label>
                  )
                })}
              </div>
            ))}

            <div className="mc-setup-actions sticky">
              <Button variant="primary" loading={busy} onClick={save}>
                {busy ? 'WORKING…' : '💾 SAVE CONFIG'}
              </Button>
              <span className="mc-setup-hint">saves to data/config.json · data panels update immediately</span>
            </div>
          </>
        )}
      </div>
    </>
  )
}
