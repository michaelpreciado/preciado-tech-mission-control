type CacheEntry<T> = { value: T; collectedAt: number; inFlight: Promise<T> | null }

const entries = new Map<string, CacheEntry<unknown>>()

/** Process-local stale-while-revalidate cache shared by server collectors. */
export function getCachedCollector<T>(key: string, collect: () => Promise<T>, ttlMs = 5_000, force = false): Promise<T> {
  let entry = entries.get(key) as CacheEntry<T> | undefined
  if (!entry) {
    entry = { value: undefined as T, collectedAt: 0, inFlight: null }
    entries.set(key, entry)
  }
  const refresh = () => {
    if (!entry!.inFlight) {
      entry!.inFlight = collect().then(value => {
        entry!.value = value
        entry!.collectedAt = Date.now()
        return value
      }).finally(() => { entry!.inFlight = null })
    }
    return entry!.inFlight
  }
  if (force || entry.collectedAt === 0) return refresh()
  if (Date.now() - entry.collectedAt >= ttlMs) void refresh().catch(() => {})
  return Promise.resolve(entry.value)
}
