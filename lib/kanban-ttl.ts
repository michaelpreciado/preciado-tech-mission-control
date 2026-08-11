// Pure TTL decision for the remote (SSH) kanban pull cache. Import-free so it
// is unit-testable under Node's ESM loader. Default 30s.
export function isRemoteCacheFresh(fetchedAt: number, now: number, cacheMs?: number): boolean {
  return now - fetchedAt < (cacheMs ?? 30_000)
}
