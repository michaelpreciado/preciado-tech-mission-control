'use client'

/* Cross-domain view primitives. Kept dependency-free on purpose: every page
   pulls this, so anything heavy belongs in the domain file that needs it. */

export function StatusDot({ status }: { status?: string }) {
  const cls = status === 'active' ? 'green' : status === 'attention' ? 'amber' : ''
  return <span className={`mc-led ${cls}`} />
}

export function statusLabel(s?: string) {
  if (s === 'active') return 'ACTIVE'
  if (s === 'standby') return 'STANDBY'
  if (s === 'sleeping') return 'SLEEPING'
  if (s === 'on-demand') return 'ON-DEMAND'
  if (s === 'attention') return 'ATTENTION'
  return (s || 'STANDBY').toUpperCase()
}

/* ── Connect card — shown when an integration has no key/path yet ── */
export function ConnectCard({ name, hint }: { name: string; hint: string }) {
  return (
    <div className="mc-connect-card">
      <div className="mc-connect-title">◇ CONNECT {name.toUpperCase()}</div>
      <p>{hint}</p>
      <a href="/setup" className="mc-refresh-btn">🛠 OPEN SETUP</a>
    </div>
  )
}
