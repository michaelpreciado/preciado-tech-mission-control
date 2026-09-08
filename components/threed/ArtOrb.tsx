'use client'

import { useMemo } from 'react'
import { ArtCanvas, artScene } from './ArtCanvas'
import { createOrbArt } from './orbScene'

export type ArtOrbProps = { size?: number; intensity?: number; /** HSL hue in degrees. */ hue?: number }
export function ArtOrb({ size = 300, intensity = 1.25, hue = 190 }: ArtOrbProps) {
  const build = useMemo(() => () => {
    const base = artScene(4.6)
    const art = createOrbArt([{ hue, phase: 0, scale: 1 }], false, intensity)
    base.scene.add(art.group)
    return { ...base, update: art.update }
  }, [hue, intensity])
  return <ArtCanvas build={build} label="Cyan signature orb with a faceted luminous core, wire shell, and three rotating halos" style={{ width: size, maxWidth: '100%', height: size, filter: `drop-shadow(0 0 9px hsl(${hue} 100% 50% / 0.35))`, background: 'radial-gradient(ellipse, #003b5540, transparent 68%)' }} />
}
