import fs from 'node:fs/promises'
import path from 'node:path'
import { getConfig } from './config'
import { pipelineStore } from './pipeline-data'
import type { VaultDoc, VaultClientDocs } from './vault-links'

export const PIPELINE_VAULT_PATH = '0800 Preciado Tech/Web Dev Pipeline'
const CACHE_MS = 60_000
let cache: { vaultDir: string; expires: number; docs: Promise<VaultDoc[]> } | undefined

function metadata(source: string, fallback: string): { title: string; updated?: string } {
  const frontmatter = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/)
  const value = frontmatter?.[1].match(/^updated:[ \t]*(.*)$/m)?.[1].trim()
  // Frontmatter dates can be plain or quoted YAML scalars, with a comment.
  const scalar = value?.match(/^(?:"((?:\\.|[^"\\])*)"|'((?:''|[^'])*)'|([^#]*?))(?:\s+#.*)?$/)
  const updated = (scalar?.[1] ?? scalar?.[2]?.replace(/''/g, "'") ?? scalar?.[3])?.trim()
  const lines = source.slice(frontmatter?.[0].length ?? 0).split(/\r?\n/)
  let fence: { char: string; length: number } | undefined
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length }
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined
      continue
    }
    if (fence) continue
    const heading = lines[i].match(/^ {0,3}#[ \t]+(.+?)[ \t]*$/)
    const title = heading?.[1].replace(/[ \t]+#+[ \t]*$/, '')
      ?? (lines[i].trim() && /^ {0,3}=+[ \t]*$/.test(lines[i + 1] ?? '') ? lines[i].trim() : undefined)
    if (title) return { title, updated: updated || undefined }
  }
  return { title: fallback, updated: updated || undefined }
}

async function scan(vaultDir: string): Promise<VaultDoc[]> {
  const docs: VaultDoc[] = []
  const root = path.join(vaultDir, PIPELINE_VAULT_PATH)
  async function walk(dir: string): Promise<void> {
    try {
      // Do not follow symlinks into unrelated vaults or directory cycles.
      if (!(await fs.lstat(dir)).isDirectory()) return
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const absolute = path.join(dir, entry.name)
        if (entry.isDirectory()) await walk(absolute)
        else if (entry.isFile() && /\.md$/i.test(entry.name)) {
          try {
            const content = await fs.readFile(absolute)
            const segments = path.relative(root, absolute).split(path.sep)
            const group = segments.length > 1 ? segments[0] : 'Root'
            docs.push({
              path: path.relative(vaultDir, absolute).split(path.sep).join('/'),
              ...metadata(content.toString('utf8'), entry.name.replace(/\.md$/i, '')),
              group,
              bytes: content.byteLength,
              isClientDoc: group === 'Clients',
            })
          } catch { /* Unreadable or removed note: keep the rest of the scan. */ }
        }
      }
    } catch { /* Missing or unreadable directory: return the readable notes. */ }
  }
  await walk(root)
  return docs.sort((a, b) => a.path.localeCompare(b.path))
}

/** Cached per vault, including in-flight scans and empty results. Never writes. */
export async function scanVaultDocs(): Promise<VaultDoc[]> {
  try {
    const vaultDir = getConfig().paths.vaultDir
    if (!cache || cache.vaultDir !== vaultDir || Date.now() >= cache.expires) {
      cache = { vaultDir, expires: Date.now() + CACHE_MS, docs: scan(vaultDir).catch(() => []) }
    }
    return await cache.docs
  } catch { return [] }
}

/** Read docs_path separately: the existing pipeline normalization/schema stays intact. */
export async function collectVaultClientDocs(docs: VaultDoc[]): Promise<VaultClientDocs[]> {
  try {
    const store = JSON.parse(await fs.readFile(pipelineStore(), 'utf8'))
    const leads = Array.isArray(store) ? store : store?.leads
    if (!Array.isArray(leads)) return []
    const vaultDir = getConfig().paths.vaultDir
    return leads.flatMap(lead => {
      const id = lead?.id || lead?.lead_id
      const folder = lead?.docs_path ?? lead?.extra_data?.docs_path ?? lead?.extraData?.docs_path
      if (!id || typeof folder !== 'string' || !folder.trim()) return []
      const relative = path.relative(vaultDir, path.resolve(vaultDir, folder)).split(path.sep).join('/')
      if (!relative.startsWith(`${PIPELINE_VAULT_PATH}/Clients/`)) return []
      return [{ leadId: String(id), path: relative, count: docs.filter(doc => doc.path.startsWith(`${relative}/`)).length }]
    })
  } catch { return [] }
}
