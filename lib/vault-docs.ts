import path from 'node:path'
import { getConfig } from './config'
import { readPipelineStore } from './pt/pipeline'
import { listArtifactFiles, readArtifactFile } from './pt/artifact-files'
import type { VaultDoc, VaultClientDocs } from './vault-links'

export const PIPELINE_VAULT_PATH = '0800 Preciado Tech/Web Dev Pipeline'
const CACHE_MS = 60_000
type VaultScan = { docs: VaultDoc[]; revisions: Record<string, string>; paths: string[]; complete: boolean; reason: string | null }
type ScanOptions = { root?: string; vaultPrefix?: string; fresh?: boolean }
let cache: { root: string; prefix: string; expires: number; scan: Promise<VaultScan> } | undefined

export function vaultMetadata(source: string, fallback: string): { title: string; updated?: string } {
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

export function vaultDocFromText(vaultRelative: string, content: string, bytes: number): VaultDoc {
  const segments = vaultRelative.slice(PIPELINE_VAULT_PATH.length + 1).split('/')
  const group = segments.length > 1 ? segments[0] : 'Root'
  return { path: vaultRelative, ...vaultMetadata(content, path.basename(vaultRelative).replace(/\.md$/i, '')), group, bytes, isClientDoc: group === 'Clients' }
}

async function scan(root: string, prefix: string): Promise<VaultScan> {
  const result: VaultScan = { docs: [], revisions: {}, paths: [], complete: true, reason: null }
  try {
    const inventory = await listArtifactFiles(root)
    result.paths = inventory.paths.filter(p => /\.md$/i.test(p))
    result.complete = inventory.complete
    if (!inventory.complete) result.reason = 'inventory_truncated'
    for (const relative of result.paths) {
      try {
        const { bytes, revision } = await readArtifactFile(root, relative)
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
        if (text.includes('\0')) continue
        const doc = vaultDocFromText(`${prefix}/${relative}`, text, bytes.length)
        result.docs.push(doc)
        result.revisions[doc.path] = revision
      } catch { /* Unreadable, oversized or moved notes are omitted from legacy metadata. */ }
    }
  } catch { result.complete = false; result.reason = 'root_unavailable' }
  result.docs.sort((a, b) => a.path.localeCompare(b.path))
  return result
}

/** Cached metadata for legacy callers; fresh inventory for revision-bound shelves.
 * Inventory retains unreadable paths and scan quality without inventing metadata.
 * root/prefix are server-owned registrations, never request parameters. */
export function scanVaultDocs(options: ScanOptions & { inventory: true }): Promise<VaultScan>
export function scanVaultDocs(options?: ScanOptions & { inventory?: false }): Promise<VaultDoc[]>
export async function scanVaultDocs(options: ScanOptions & { inventory?: boolean } = {}): Promise<VaultDoc[] | VaultScan> {
  const prefix = options.vaultPrefix ?? PIPELINE_VAULT_PATH
  const root = options.root ?? path.join(getConfig().paths.vaultDir, PIPELINE_VAULT_PATH)
  if (options.fresh) {
    const result = await scan(root, prefix)
    return options.inventory ? result : result.docs
  }
  if (!cache || cache.root !== root || cache.prefix !== prefix || Date.now() >= cache.expires) {
    cache = { root, prefix, expires: Date.now() + CACHE_MS, scan: scan(root, prefix) }
  }
  const result = await cache.scan
  return options.inventory ? result : result.docs
}

/** Select docs_path from the shared normalized pipeline and its lossless evidence. */
export async function collectVaultClientDocs(docs: VaultDoc[]): Promise<VaultClientDocs[]> {
  try {
    const read = await readPipelineStore()
    if (!read.ok) return []
    const vaultDir = getConfig().paths.vaultDir
    return read.store.records.flatMap(lead => lead.evidence.flatMap(({ raw }) => {
      const id = lead.id
      const folder = raw.docs_path ?? (raw.extra_data as Record<string, unknown> | undefined)?.docs_path ?? (raw.extraData as Record<string, unknown> | undefined)?.docs_path
      if (!id || typeof folder !== 'string' || !folder.trim()) return []
      const relative = path.relative(vaultDir, path.resolve(vaultDir, folder)).split(path.sep).join('/')
      if (!relative.startsWith(`${PIPELINE_VAULT_PATH}/Clients/`)) return []
      return [{ leadId: String(id), path: relative, count: docs.filter(doc => doc.path.startsWith(`${relative}/`)).length }]
    })).filter((entry, index, entries) => entries.findIndex(other => other.leadId === entry.leadId && other.path === entry.path) === index)
  } catch { return [] }
}
