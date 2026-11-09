'use client'

/* Cross-domain view primitives. Kept dependency-free on purpose: every page
   pulls this, so anything heavy belongs in the domain file that needs it. */
import { Button, Glyph } from '../ui'

/** Agent status as a widget glyph: `▶` active, amber `×` attention, `·` otherwise. LEDs are gone. */
export function StatusDot({ status }: { status?: string }) {
  return <Glyph g={status === 'active' ? 'run' : status === 'attention' ? 'fail' : 'idle'} label={statusLabel(status).toLowerCase()} />
}

export function statusLabel(s?: string) {
  if (s === 'active') return 'ACTIVE'
  if (s === 'standby') return 'STANDBY'
  if (s === 'sleeping') return 'SLEEPING'
  if (s === 'on-demand') return 'ON-DEMAND'
  if (s === 'attention') return 'ATTENTION'
  if (s === 'offline') return 'OFFLINE'
  return (s || 'STANDBY').toUpperCase()
}

/* ── Connect card — shown when an integration has no key/path yet ── */
export function ConnectCard({ name, hint }: { name: string; hint: string }) {
  return (
    <div className="mc-connect-card">
      <div className="mc-connect-title">connect {name.toLowerCase()}</div>
      <p>{hint}</p>
      <Button variant="ghost" href="/setup">&gt; open setup</Button>
    </div>
  )
}
