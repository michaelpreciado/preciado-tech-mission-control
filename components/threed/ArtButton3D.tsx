'use client'

import { useMemo, useRef, useState } from 'react'
import { ArtCanvas, artScene } from './ArtCanvas'
import { createPlate } from './plateScene'

export type ArtButton3DProps = { onClick?: (size: 'S' | 'M' | 'L') => void }
function GlassButton({ label, width, onClick }: { label: 'S' | 'M' | 'L'; width: number; onClick?: ArtButton3DProps['onClick'] }) {
  const interaction = useRef({ hover: false, pressed: false })
  const build = useMemo(() => () => {
    const base = artScene(3)
    const plate = createPlate(width / 72, .74)
    base.scene.add(plate.group)
    plate.group.rotation.set(-.23, -.18, -.035)
    return { ...base, update: (_time: number, delta: number) => {
      const { hover, pressed } = interaction.current
      const blend = 1 - Math.exp(-delta * 16)
      plate.uniforms.energy.value += ((hover ? 2 : 1) - plate.uniforms.energy.value) * blend
      plate.group.rotation.x += ((hover ? -.38 : -.23) - plate.group.rotation.x) * blend
      plate.group.rotation.y += ((hover ? .08 : -.18) - plate.group.rotation.y) * blend
      plate.group.position.z += ((pressed ? -.24 : 0) - plate.group.position.z) * blend
    } }
  }, [width])
  return <button type="button" aria-label={`Activate ${label === 'S' ? 'small' : label === 'M' ? 'medium' : 'large'} glass button`} onClick={() => onClick?.(label)}
    onPointerEnter={() => { interaction.current.hover = true }} onPointerLeave={() => { interaction.current.hover = false; interaction.current.pressed = false }}
    onFocus={() => { interaction.current.hover = true }} onBlur={() => { interaction.current.hover = false; interaction.current.pressed = false }}
    onPointerDown={event => { interaction.current.pressed = true; event.currentTarget.setPointerCapture(event.pointerId) }}
    onPointerUp={() => { interaction.current.pressed = false }} onPointerCancel={() => { interaction.current.pressed = false }} onLostPointerCapture={() => { interaction.current.pressed = false }}
    onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') interaction.current.pressed = true }}
    onKeyUp={() => { interaction.current.pressed = false }}
    style={{ width, maxWidth: '100%', height: 108, position: 'relative', border: 0, padding: 0, background: 'transparent', color: '#f4f7fb', cursor: 'pointer', borderRadius: 12, flexShrink: 1 }}>
    <ArtCanvas build={build} label={`${label} extruded cyan glass plate`} />
    <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 10, letterSpacing: 2, pointerEvents: 'none' }}>LAUNCH</span>
    <span style={{ position: 'absolute', bottom: -6, left: 0, right: 0, fontSize: 9, color: '#6f7886', letterSpacing: 2 }}>{label} / {width}</span>
  </button>
}

/** Three native buttons, each with its own two-draw-call canvas. */
export function ArtButton3D({ onClick }: ArtButton3DProps) {
  const [last, setLast] = useState('HOVER TO ENERGIZE · CLICK TO ENGAGE')
  return <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 220 }}>
      {(['S', 'M', 'L'] as const).map((label, i) => <GlassButton key={label} label={label} width={100 + i * 32} onClick={size => { setLast(`${size} PLATE ENGAGED`); onClick?.(size) }} />)}
    </div>
    <p role="status" style={{ textAlign: 'center', fontSize: 9, letterSpacing: 1.5, color: '#99a3b2', minHeight: 16 }}>{last}</p>
  </div>
}
