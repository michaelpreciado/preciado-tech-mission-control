/** Shared metadata only; safe to import from client components. */
export type VaultDoc = {
  path: string
  title: string
  group: string
  updated?: string
  bytes: number
  isClientDoc: boolean
}

export type VaultClientDocs = { leadId: string; path: string; count: number }
export type VaultData = {
  vaultDir: string
  docs: VaultDoc[]
  groups: string[]
  clientDocs: VaultClientDocs[]
}

export function obsidianLink(vaultDir: string, relativePath: string, folder = false): string {
  const vault = vaultDir.replace(/\/+$/, '').split('/').pop() || 'Preciado Tech'
  const file = folder ? relativePath : relativePath.replace(/\.md$/i, '')
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`
}
