'use client'

import { useState } from 'react'
import { ArtOrb } from './ArtOrb'
import { ArtButton3D } from './ArtButton3D'
import { ArtContainer } from './ArtContainer'
import { ArtOrbCarousel } from './ArtOrbCarousel'

export function ThreedPreview() {
  const [intensity, setIntensity] = useState(1.25)
  const [highlighted, setHighlighted] = useState(0)
  return <main className="a2-gallery">
    <style>{`
      .a2-gallery { background:#05070d; color:#ddf5ff; min-height:100vh; padding:40px clamp(16px,4vw,64px); font-family:ui-monospace,SFMono-Regular,monospace; }
      .a2-gallery h1,.a2-gallery h2 { color:#ddf5ff !important; text-shadow:none !important; }
      .a2-gallery * { box-sizing:border-box; }
      .a2-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; max-width:1320px; margin:auto; }
      .a2-card { border:1px solid #18303f; background:linear-gradient(140deg,#0c1420,#060910 68%); border-radius:18px; overflow:hidden; min-width:0; }
      .a2-card header { padding:22px 24px 0; display:flex; justify-content:space-between; align-items:center; gap:12px; }
      .a2-card h2 { font-size:15px; font-weight:500; margin:0; letter-spacing:-.3px; }
      .a2-card header span { color:#00d4ff; font-size:9px; letter-spacing:1.5px; }
      .a2-stage { height:310px; display:flex; align-items:center; justify-content:center; padding:0 12px; }
      .a2-footer { min-height:59px; border-top:1px solid #14222e; padding:16px 24px; display:flex; align-items:center; justify-content:space-between; gap:12px; color:#789aaa; font-size:10px; }
      .a2-gallery button:focus-visible,.a2-gallery input:focus-visible { outline:2px solid #00d4ff; outline-offset:3px; }
      .a2-next { border:1px solid #23566a; border-radius:5px; padding:6px 9px; background:#0a1c28; color:#9aefff; cursor:pointer; font:inherit; }
      @media(min-width:1900px) { .a2-grid { grid-template-columns:repeat(4,minmax(0,1fr)); max-width:2000px; } }
      @media(max-width:760px) { .a2-grid { grid-template-columns:1fr; } .a2-gallery { padding:24px 12px; } .a2-card header { padding:18px 16px 0; } .a2-footer { padding:14px 16px; } }
    `}</style>
    <div style={{ maxWidth: 1320, margin: '0 auto 30px' }}>
      <div style={{ color: '#00d4ff', letterSpacing: 3, fontSize: 10 }}>MISSION CONTROL / ART LAB / A2</div>
      <h1 style={{ fontSize: 'clamp(28px,4vw,46px)', fontWeight: 500, letterSpacing: -2, margin: '14px 0 10px' }}>Interfaces with dimension.</h1>
      <p style={{ color: '#7993a7', fontSize: 12, lineHeight: 1.7, margin: 0 }}>Four living studies in light, glass, and orbital motion.</p>
    </div>
    <div className="a2-grid">
      <section className="a2-card"><header><h2>01 / Signature orb</h2><span>ENERGY CORE</span></header><div className="a2-stage"><ArtOrb intensity={intensity} /></div><footer className="a2-footer"><label htmlFor="a2-intensity">CORE INTENSITY / {intensity.toFixed(2)}</label><input id="a2-intensity" type="range" min="0.25" max="2.5" step="0.05" value={intensity} onChange={e => setIntensity(Number(e.target.value))} style={{ width: 100, accentColor: '#00d4ff' }} /></footer></section>
      <section className="a2-card"><header><h2>02 / Glass controls</h2><span>TACTILE LIGHT</span></header><div className="a2-stage"><ArtButton3D /></div><footer className="a2-footer"><span>THREE SIZES · POINTER + KEYBOARD</span><span>↗ INTERACTIVE</span></footer></section>
      <section className="a2-card"><header><h2>03 / Holo-console</h2><span>INFORMATION PLANE</span></header><div className="a2-stage"><ArtContainer /></div><footer className="a2-footer"><span>GLASS / GRID / SCAN SWEEP</span><span>DEMO DATA</span></footer></section>
      <section className="a2-card"><header><h2>04 / Orbital kanban</h2><span>STATUS IN MOTION</span></header><div className="a2-stage"><ArtOrbCarousel highlighted={highlighted} /></div><footer className="a2-footer"><span>07 NODES / FOCUS {highlighted + 1}</span><button className="a2-next" onClick={() => setHighlighted(v => (v + 1) % 7)}>Next focus →</button></footer></section>
    </div>
    <p style={{ maxWidth: 1320, margin: '22px auto 0', color: '#526e80', fontSize: 9, letterSpacing: 1.3 }}>PROCEDURAL GEOMETRY · REALTIME WEBGL · NO EXTERNAL ASSETS</p>
  </main>
}
