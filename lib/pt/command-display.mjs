import { compatibleEnvelope, presentationState } from './presentation-state.mjs'

/** Only exact packaged ID/path/action tuples can be activated. API readiness may
 * restrict the local allowlist, but cannot enable an unfinished local feature. */
export function compatibleCommands(envelope, catalog) {
  if (!compatibleEnvelope(envelope)) return false
  if (envelope.data === null) return true
  const { commands, referencedSnapshots } = envelope.data
  return Array.isArray(commands) && commands.length === catalog.length
    && new Set(commands.map(c => c?.id)).size === catalog.length
    && commands.every(c => {
      const local = catalog.find(row => row.id === c?.id)
      return local && c.webPath === local.webPath && c.desktopActionId === local.desktopActionId
        && c.label === local.label && c.practiceArea === local.practiceArea
        && typeof c.enabled === 'boolean'
        && (c.enabled ? c.blockedReason === null : typeof c.blockedReason === 'string' && c.blockedReason.length > 0)
        && JSON.stringify(c.badgeRef) === JSON.stringify(local.badgeRef)
    }) && referencedSnapshots !== null && typeof referencedSnapshots === 'object' && !Array.isArray(referencedSnapshots)
    && Object.entries(referencedSnapshots).every(([id, value]) => catalog.some(c => c.badgeRef?.destination === id) && compatibleEnvelope(value))
}

export function commandDisplay(envelope, catalog, practiceAreas, now = Date.now(), failed = false, error = null) {
  const valid = compatibleCommands(envelope, catalog)
  const snapshot = valid ? envelope : null
  const state = presentationState(snapshot, now, failed, error === 'access_denied')
  const unavailable = state.blocked ? 'access_denied'
    : state.error ? state.error
    : !snapshot?.data ? (error || 'catalog_unavailable')
    : failed ? 'refresh_failed'
    : now >= Date.parse(snapshot.validUntil) ? 'snapshot_expired'
    : state.freshness !== 'fresh' ? 'catalog_unavailable' : null
  const commands = catalog.map(local => {
    const remote = snapshot?.data?.commands.find(c => c.id === local.id)
    const blockedReason = !local.enabled ? local.blockedReason
      : unavailable || (remote?.enabled === false ? remote.blockedReason : null)
    const ref = local.badgeRef
    const badgeSnapshot = ref && !state.error ? snapshot?.data?.referencedSnapshots[ref.destination] : null
    const badgeState = presentationState(badgeSnapshot, now, failed, error === 'access_denied')
    const value = ref && badgeSnapshot?.data?.facts?.[ref.fact]
    const badge = ref ? {
      value: !badgeState.error && typeof value === 'number' && Number.isFinite(value) ? value : null,
      snapshotId: badgeSnapshot?.snapshotId ?? null,
      ...badgeState,
    } : null
    return { ...local, enabled: blockedReason === null, blockedReason, badge }
  })
  return { ...state, error: state.error ?? error, snapshotId: snapshot?.snapshotId ?? null,
    dataRevision: snapshot?.dataRevision ?? null, generatedAt: snapshot?.generatedAt ?? null,
    validUntil: snapshot?.validUntil ?? null, commands,
    groups: practiceAreas.map(practiceArea => ({ practiceArea, commands: commands.filter(c => c.practiceArea === practiceArea) })),
  }
}
