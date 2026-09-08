'use client'

import type { CSSProperties } from 'react'
import { AsciiTerminalArt } from '@/app/vf/Ascii'

const lines = [
  'PRECIAO TECH BIOS v7.2 ... OK',
  'CREW LINK ............ 4 ONLINE',
  'HERDR SOCKETS ........ LIVE',
  'KANBAN QUEUE ......... SYNCED',
  'ORBITAL RENDER ....... OK',
  'MISSION CONTROL READY',
]

export function BootSequence() {
  return (
    <div className="boot-console" role="status" aria-label="Loading Mission Control">
      <div aria-hidden="true">
        <AsciiTerminalArt />
        <div className="boot-eyebrow">MC / POWER-ON SELF TEST</div>
        <div className="boot-readout">
          {lines.map((line, index) => (
            <div className="boot-row" key={line} style={{ '--boot-delay': `${index * 180}ms`, '--boot-chars': line.length } as CSSProperties}>
              <span className="boot-line">{line}</span>
              <span className="boot-cursor">█</span>
            </div>
          ))}
        </div>
        <div className="boot-footer">└── SYSTEM HANDSHAKE / MC-072 ──┘</div>
      </div>
    </div>
  )
}
