'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Button, SkeletonPanel, Window } from './ui'
import { obsidianLink, type VaultData } from '@/lib/vault-links'
import './vault-documents.css'

const VaultContext = createContext<{ data: VaultData | null; error: string | null }>({ data: null, error: null })

export function VaultDocumentsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<VaultData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    async function refresh() {
      try {
        const response = await fetch('/api/vault', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        setData(await response.json())
        setError(null)
      } catch (err) {
        if (!controller.signal.aborted) setError((err as Error).message)
      }
    }
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 60_000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [])
  return <VaultContext.Provider value={{ data, error }}>{children}</VaultContext.Provider>
}

export function ClientDocsLink({ leadId }: { leadId: string }) {
  const { data } = useContext(VaultContext)
  const folder = data?.clientDocs.find(client => client.leadId === leadId)
  if (!data || !folder) return null
  return <div className="mc-pipe-row mc-vault-client">
    <Button href={obsidianLink(data.vaultDir, folder.path, true)} title={folder.path}
      aria-label={`Open client docs in Obsidian, ${folder.count} notes`}>Docs ↗</Button>
    <span>{folder.count} {folder.count === 1 ? 'note' : 'notes'}</span>
  </div>
}

export function VaultDocuments() {
  const { data, error } = useContext(VaultContext)
  return <Window title="DOCUMENTS" tag="VAULT" className="mc-vault-panel"
    meta={data ? `${data.docs.length} NOTES · SOURCE OF TRUTH` : 'SOURCE OF TRUTH'}>
    <div className="mc-vault-path">Vault · {data?.vaultDir ?? 'loading configuration…'}</div>
    {error && <div className="mc-pipe-error" role="alert">Vault documents unavailable · {error}{data ? ' · showing last snapshot' : ''}</div>}
    {!data && !error && <SkeletonPanel label="loading vault documents" />}
    {data && data.docs.length === 0 && <div className="mc-pipe-empty">No Markdown documents found in Web Dev Pipeline. Check the vault path above.</div>}
    {data && <div className="mc-vault-groups">
      {data.groups.map(group => {
        const docs = data.docs.filter(doc => doc.group === group)
        return <section className="mc-vault-group" key={group} aria-label={`${group} documents`}>
          <h3 className="mc-vault-group-head">{group}<span>{docs.length}</span></h3>
          <ul className="mc-vault-list">
            {docs.map(doc => <li key={doc.path}>
              <a className="mc-vault-doc" href={obsidianLink(data.vaultDir, doc.path)}>
                <span className="mc-vault-doc-head"><span className="mc-pipe-name">{doc.title}</span>
                  {doc.updated && <span className="mc-vault-updated">Updated {doc.updated}</span>}
                </span>
                <span className="mc-vault-folder">{doc.path.slice('0800 Preciado Tech/Web Dev Pipeline/'.length).split('/').slice(0, -1).join(' / ') || 'Root'}</span>
                <span className="mc-vault-file">{doc.path}</span>
              </a>
            </li>)}
          </ul>
        </section>
      })}
    </div>}
  </Window>
}
