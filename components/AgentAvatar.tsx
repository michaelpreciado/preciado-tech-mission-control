'use client'

/**
 * Minimal glowing avatar block for an agent — replaces the old pixel-art
 * sprite sheets with a glanceable initial + tint treatment that matches the
 * neon glass theme.
 */
export interface AgentTint {
  fr: string
  glow: string
}

export function AgentAvatar({
  name,
  tint,
  size = 4,
  status,
}: {
  name: string
  tint: AgentTint
  size?: number
  status?: string
}) {
  const px = size * 10
  const initial = (name || '?').replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() || '?'
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: px,
          height: px,
          borderRadius: Math.max(6, px / 5),
          fontSize: px * 0.5,
          fontWeight: 700,
          lineHeight: 1,
          color: tint.fr,
          textShadow: `0 0 8px ${tint.glow}`,
          border: `1px solid ${tint.fr}55`,
          background: `radial-gradient(ellipse at 50% 70%, ${tint.glow}33, transparent 75%), rgba(3,8,20,0.6)`,
          boxShadow: `inset 0 0 ${Math.round(px / 4)}px ${tint.glow}22, 0 0 10px ${tint.glow}22`,
        }}
      >
        {initial}
      </span>
      {status ? (
        <span style={{ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: tint.fr, textShadow: `0 0 6px ${tint.glow}` }}>
          {status}
        </span>
      ) : null}
    </span>
  )
}
