/** Shared, bounded file boundary for vault metadata and deliverable reads.
 * Linux uses a pinned fd and /proc to verify the opened object before reading.
 * No path from an HTTP query reaches this module. Symlinks are never followed.
 */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const MAX_ARTIFACT_BYTES = 256 * 1024
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export class ArtifactError extends Error {
  status: number
  constructor(code: string, status = 404) { super(code); this.status = status }
}
export function safeRelative(value: string): boolean {
  return !!value && !path.isAbsolute(value) && !/[\\\x00-\x1f\x7f]/.test(value) && !/%(?:2e|2f|5c|00)/i.test(value)
    && value.split('/').every(part => !!part && part !== '.' && part !== '..' && !part.startsWith('.'))
}
export function artifactPath(root: string, relative: string): string {
  if (!path.isAbsolute(root) || !safeRelative(relative)) throw new ArtifactError('unavailable')
  return path.join(root, relative)
}
export async function noSymlinkPath(absolute: string): Promise<void> {
  let current = path.parse(absolute).root
  for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if ((await fs.lstat(current)).isSymbolicLink()) throw new ArtifactError('unavailable')
  }
}
export async function readArtifactFile(root: string, relative: string, limit = MAX_ARTIFACT_BYTES) {
  const absolute = artifactPath(root, relative)
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    await noSymlinkPath(absolute)
    handle = await fs.open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const before = await handle.stat()
    if (!before.isFile()) throw new ArtifactError('unavailable')
    if (before.size > limit) throw new ArtifactError('too_large', 413)
    const canonical = await fs.realpath(absolute)
    if (canonical !== absolute || process.platform !== 'linux' || await fs.realpath(`/proc/self/fd/${handle.fd}`) !== absolute) throw new ArtifactError('unavailable')
    await noSymlinkPath(absolute)
    // Read at most limit+1, even if a writer grows the file after stat.
    const buffer = Buffer.alloc(limit + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > limit) throw new ArtifactError('too_large', 413)
    const after = await handle.stat()
    const named = await fs.lstat(absolute)
    await noSymlinkPath(absolute)
    if (await fs.realpath(`/proc/self/fd/${handle.fd}`) !== absolute || named.ino !== after.ino || named.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new ArtifactError('revision_mismatch', 409)
    const bytes = buffer.subarray(0, length)
    return { bytes, revision: sha256(bytes), modifiedAt: after.mtime.toISOString() }
  } catch (error) {
    if (error instanceof ArtifactError) throw error
    throw new ArtifactError('unavailable')
  } finally { await handle?.close() }
}

/** Bounded traversal, including directories. Excludes hidden paths and symlinks. */
export async function listArtifactFiles(root: string, maxEntries = 2000) {
  const paths: string[] = []
  let visited = 0, complete = true
  async function walk(relative: string, depth: number): Promise<void> {
    if (depth > 12) { complete = false; return }
    const absolute = relative ? artifactPath(root, relative) : root
    await noSymlinkPath(absolute)
    for await (const entry of await fs.opendir(absolute)) {
      if (++visited > maxEntries) { complete = false; return }
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      const next = relative ? `${relative}/${entry.name}` : entry.name
      if (!safeRelative(next)) continue
      if (entry.isDirectory()) await walk(next, depth + 1)
      else if (entry.isFile()) paths.push(next)
      if (visited > maxEntries) return
    }
  }
  await walk('', 0)
  return { paths, complete }
}
