'use client'

/**
 * F.R.I.D.A.Y. setup — configure the harness from the browser.
 * Writes data/config.json via /api/setup (local-only, gitignored).
 * Bring-your-own keys: nothing here ever leaves this machine.
 */
import { useEffect, useState } from 'react'
import { SectionHead } from '@/components/ui'

type SetupConfig = {
  appName: string
  appTagline: string
  homeDir: string
  github: { username: string; projectRepo: string }
  paths: Record<string, string>
  services: Record<string, string>
  keysSet: { openrouterApiKey: boolean }
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
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/setup', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { setCfg(j.config); setConfigured(Boolean(j.configured)) })
      .catch(() => setFlash({ tone: 'err', text: 'Could not load current config.' }))
  }, [])

  const set = (section: keyof SetupConfig | 'root', key: string, value: string) => {
    setCfg(prev => {
      if (!prev) return prev
      if (section === 'root') return { ...prev, [key]: value }
      const branch = prev[section as 'github' | 'paths' | 'services'] as Record<string, string>
      return { ...prev, [section]: { ...branch, [key]: value } }
    })
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
    }
    if (openrouterKey.trim()) body.keys = { openrouterApiKey: openrouterKey.trim() }
    try {
      const res = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setOpenrouterKey('')
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
      <div className="mc-setup">
        <div className="mc-setup-intro">
          <p><strong>Local-first, bring-your-own-keys.</strong> Everything below is written to
          <code> data/config.json</code> — gitignored, never synced, never sent anywhere.
          Blank fields simply disable their panel; the dashboard degrades gracefully.</p>
          <div className="mc-setup-actions">
            <button className="mc-refresh-btn" onClick={seedDemo} disabled={busy}>
              ▶ LOAD DEMO DATA
            </button>
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
              <button className="mc-refresh-btn primary" onClick={save} disabled={busy}>
                {busy ? 'WORKING…' : '💾 SAVE CONFIG'}
              </button>
              <span className="mc-setup-hint">saves to data/config.json · data panels update immediately</span>
            </div>
          </>
        )}
      </div>
    </>
  )
}
