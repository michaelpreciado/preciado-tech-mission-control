'use client'

import { useMemo } from 'react'
import { ArtCanvas, artScene } from './ArtCanvas'
import { createOrbArt } from './orbScene'

export type ArtOrbCarouselProps = { count?: number; highlighted?: number }
export function ArtOrbCarousel({ count = 7, highlighted = 0 }: ArtOrbCarouselProps) {
  const total = Math.max(6, Math.min(8, Math.round(count) || 7))
  const selected = ((Math.round(highlighted) % total) + total) % total
  const build = useMemo(() => () => {
    const base = artScene(7.8)
    const art = createOrbArt(Array.from({ length: total }, (_, i) => ({ hue: i % 3 === 0 ? 205 : i % 3 === 1 ? 38 : 2, phase: i / total * Math.PI * 2, scale: i === selected ? .53 : .36, selected: i === selected })), true, 1.25)
    base.scene.add(art.group)
    return { ...base, update: art.update }
  }, [total, selected])
  return <div style={{ width: '100%' }}>
    <ArtCanvas build={build} label={`${total} orbiting task orbs; node ${selected + 1} highlighted. Blue running, amber queued, red attention.`} style={{ height: 270, background: 'radial-gradient(ellipse, #003b5528, transparent 68%)' }} />
    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, letterSpacing: 1 }}>
      <span style={{ color: '#48aaff' }}>● RUNNING</span><span style={{ color: '#ffb747' }}>● QUEUED</span><span style={{ color: '#ff6461' }}>● ATTENTION</span>
    </div>
  </div>
}
