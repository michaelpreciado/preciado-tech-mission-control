'use client'

import { useMemo, type ReactNode } from 'react'
import { ArtCanvas, artScene } from './ArtCanvas'
import { createPlate } from './plateScene'

export type ArtContainerProps = { children?: ReactNode }
export function ArtContainer({ children }: ArtContainerProps) {
  const build = useMemo(() => () => {
    const base = artScene(4.6)
    const plate = createPlate(3.7, 2.2, true)
    plate.group.rotation.set(-.12, -.16, -.015)
    base.scene.add(plate.group)
    return { ...base, update: (time: number) => { plate.uniforms.time.value = time } }
  }, [])
  return <div style={{ position: 'relative', containerType: 'inline-size', width: '100%', maxWidth: 490, height: 290, margin: 'auto' }}>
    <ArtCanvas build={build} label="Tilted holo-console with luminous corner brackets, fine grid, spinning emblem and scanning light" />
    <div style={{ position: 'absolute', left: '16%', right: '18%', top: '26%', bottom: '23%', transform: 'perspective(700px) rotateY(-9deg) rotateX(7deg)', color: '#a5d7e4', fontSize: 10 }}>
      {children ?? <>
        <div style={{ fontSize: 8, letterSpacing: 2, color: '#00d4ff' }}>LIVE TELEMETRY</div>
        <div style={{ fontSize: 'clamp(13px, 4.3cqi, 21px)', color: '#e0faff', marginTop: 9 }}>Mission overview</div>
        <div style={{ display: 'flex', gap: '4cqi', marginTop: '3cqi' }}><span><b style={{ fontSize: 'clamp(16px, 4.9cqi, 24px)', color: '#b9f4ff' }}>24</b><br />ACTIVE AGENTS</span><span><b style={{ fontSize: 'clamp(16px, 4.9cqi, 24px)', color: '#b9f4ff' }}>98.6<span style={{ fontSize: 12 }}>%</span></b><br />UPTIME</span></div>
        <div style={{ marginTop: '3cqi', height: 3, background: '#164456' }}><div style={{ width: '76%', height: '100%', background: '#00d4ff', boxShadow: '0 0 12px #00d4ff' }} /></div>
      </>}
    </div>
  </div>
}
