/** Human copy for machine block reasons. Shared by the TS catalog, the palette
 * collector (command-display.mjs) and the desktop packaging so the raw enum can
 * never reach an operator-facing string. Keep this module dependency-free: it is
 * copied verbatim into the native desktop package. */

export const BLOCKED_REASON_LABELS = Object.freeze({
  destination_not_implemented: 'Not shipped yet',
  catalog_unavailable: 'Catalog unavailable',
  refresh_failed: 'Refresh failed',
  snapshot_expired: 'Snapshot expired',
  access_denied: 'Access denied',
})

/** Map a machine reason to operator copy. Falls back to a de-underscored string
 *  so the raw enum is never rendered, even for an unrecognised reason. */
export function blockedLabelFor(reason) {
  if (!reason) return null
  return BLOCKED_REASON_LABELS[reason] ?? String(reason).replace(/_/g, ' ')
}
