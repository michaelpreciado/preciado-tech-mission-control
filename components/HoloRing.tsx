'use client'

import { useRef, type CSSProperties } from 'react'
import { useLiveData } from './LiveDataProvider'
import styles from './HomeWorkspace.module.css'

const CENTER = 100
const IDLE_FLOOR = 0.15

export const HOLO_EMOTES = ['idle', 'listening', 'thinking', 'scanning', 'building', 'alert', 'satisfied', 'sleeping'] as const
export type HoloEmote = typeof HOLO_EMOTES[number]

/** These cutoffs are shared by the renderer and the pure selector so the
 * orb's vocabulary remains explicit and easy to test. */
export const HOLO_EMOTE_THRESHOLDS = {
  mediumActivity: 0.3,
  highActivity: 0.65,
  satisfiedWindowMs: 12_000,
  sleepingThresholdMs: 120_000,
} as const

export type HoloEmoteInput = {
  activity: number
  attentionSignals: number
  calmForMs: number
  wasBusy: boolean
  tick: number
  listening: boolean
}

/** Deterministic priority: attention wins, then high activity, then the
 * medium-activity personality tick; calm transitions get a short wink before
 * idle/sleep. No random choice is involved. */
export function deriveHoloEmote({ activity, attentionSignals, calmForMs, wasBusy, tick, listening }: HoloEmoteInput): HoloEmote {
  if (attentionSignals > 0) return 'alert'
  if (activity >= HOLO_EMOTE_THRESHOLDS.highActivity) return 'building'
  if (activity >= HOLO_EMOTE_THRESHOLDS.mediumActivity) return tick % 2 === 0 ? 'thinking' : 'scanning'
  // No payload is a distinct live state: the orb is waiting for telemetry.
  if (listening) return 'listening'
  if (wasBusy && calmForMs < HOLO_EMOTE_THRESHOLDS.satisfiedWindowMs) return 'satisfied'
  if (calmForMs >= HOLO_EMOTE_THRESHOLDS.sleepingThresholdMs) return 'sleeping'
  return 'idle'
}

const polar = (radius: number, angle: number) => {
  const radians = (angle - 90) * Math.PI / 180
  return { x: CENTER + radius * Math.cos(radians), y: CENTER + radius * Math.sin(radians) }
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

// Fixed runs keep the signal crisp between renders; CSS controls their fall.
const BINARY_COLUMNS = [
  { x: 78, startY: 65, run: '10110101', duration: 5.8, delay: '-1.3s', opacity: 0.42 },
  { x: 89, startY: 58, run: '011011', duration: 4.6, delay: '-3.1s', opacity: 0.72 },
  { x: 101, startY: 68, run: '11001010', duration: 6.4, delay: '-2.2s', opacity: 0.52 },
  { x: 113, startY: 55, run: '0011011', duration: 4.9, delay: '-0.7s', opacity: 0.66 },
  { x: 123, startY: 72, run: '100110', duration: 5.5, delay: '-4.0s', opacity: 0.38 },
] as const

// One SVG unit is 0.6 CSS pixels at the 120px readability target. Six-unit
// cells therefore stay visibly square on both desktop and phone screens.
const PIXEL_CELL_SIZE = 6
type PixelGrid = readonly string[]
type PixelFrame = { readonly grid: PixelGrid; readonly x: number; readonly y: number }

const IDLE_MASCOT_FRAME_A: PixelGrid = [
  '.....#.......',
  '....###......',
  '...#####.....',
  '..#########..',
  '.##.#####.##.',
  '.############.',
  '..#########..',
  '...##...##...',
  '.............',
]
const IDLE_MASCOT_FRAME_B: PixelGrid = [
  '.....#.......',
  '....###......',
  '...#####.....',
  '..#########..',
  '.##.......##.',
  '.############.',
  '..#########..',
  '...##...##...',
  '.............',
]
const IDLE_MASCOT_FRAME_C: PixelGrid = IDLE_MASCOT_FRAME_A
const IDLE_MASCOT_FRAME_D: PixelGrid = IDLE_MASCOT_FRAME_B
const IDLE_PIXEL_FRAMES: readonly PixelFrame[] = [
  { grid: IDLE_MASCOT_FRAME_A, x: 61, y: 72 },
  { grid: IDLE_MASCOT_FRAME_B, x: 61, y: 78 },
  { grid: IDLE_MASCOT_FRAME_C, x: 61, y: 72 },
  { grid: IDLE_MASCOT_FRAME_D, x: 61, y: 78 },
]

const LISTENING_EQUALIZER_FRAME_A: PixelGrid = [
  '.............',
  '.............',
  '.............',
  '....##.......',
  '....##.......',
  '....##.##....',
  '.##.##.##....',
  '.##.##.##.##.',
  '.##.##.##.##.',
]
const LISTENING_EQUALIZER_FRAME_B: PixelGrid = [
  '.............',
  '.......##....',
  '.......##....',
  '.##....##....',
  '.##....##....',
  '.##....##.##.',
  '.##....##.##.',
  '.##.##.##.##.',
  '.##.##.##.##.',
]
const LISTENING_EQUALIZER_FRAME_C: PixelGrid = [
  '.##..........',
  '.##..........',
  '.##..........',
  '.##......##..',
  '.##......##..',
  '.##.##...##..',
  '.##.##.##.##.',
  '.##.##.##.##.',
  '.##.##.##.##.',
]
const LISTENING_EQUALIZER_FRAME_D: PixelGrid = [
  '.............',
  '.............',
  '....##.......',
  '....##.......',
  '....##.##....',
  '.##.##.##....',
  '.##.##.##.##.',
  '.##.##.##.##.',
  '.##.##.##.##.',
]
const LISTENING_PIXEL_FRAMES: readonly PixelFrame[] = [
  { grid: LISTENING_EQUALIZER_FRAME_A, x: 61, y: 73 },
  { grid: LISTENING_EQUALIZER_FRAME_B, x: 61, y: 73 },
  { grid: LISTENING_EQUALIZER_FRAME_C, x: 61, y: 73 },
  { grid: LISTENING_EQUALIZER_FRAME_D, x: 61, y: 73 },
]

const THINKING_DOTS_FRAME_A: PixelGrid = [
  '.............',
  '...##........',
  '...##........',
  '.............',
  '.............',
]
const THINKING_DOTS_FRAME_B: PixelGrid = [
  '.............',
  '...##.##.....',
  '...##.##.....',
  '.............',
  '.............',
]
const THINKING_DOTS_FRAME_C: PixelGrid = [
  '.............',
  '...##.##.##..',
  '...##.##.##..',
  '.............',
  '.............',
]
const THINKING_DOTS_FRAME_D: PixelGrid = [
  '.............',
  '......##.##..',
  '......##.##..',
  '.............',
  '.............',
]
const THINKING_PIXEL_FRAMES: readonly PixelFrame[] = [
  { grid: THINKING_DOTS_FRAME_A, x: 61, y: 82 },
  { grid: THINKING_DOTS_FRAME_B, x: 61, y: 82 },
  { grid: THINKING_DOTS_FRAME_C, x: 61, y: 82 },
  { grid: THINKING_DOTS_FRAME_D, x: 61, y: 82 },
]

const SCANNING_SWEEP_FRAME_A: PixelGrid = [
  '.#...........',
  '.#...........',
  '.#...........',
  '.#...........',
  '.#...........',
  '.#...........',
  '.#...........',
  '.#...........',
  '.#...........',
]
const SCANNING_SWEEP_FRAME_B: PixelGrid = [
  '....#........',
  '....#........',
  '....#........',
  '....#........',
  '....#........',
  '....#........',
  '....#........',
  '....#........',
  '....#........',
]
const SCANNING_SWEEP_FRAME_C: PixelGrid = [
  '.......#.....',
  '.......#.....',
  '.......#.....',
  '.......#.....',
  '.......#.....',
  '.......#.....',
  '.......#.....',
  '.......#.....',
  '.......#.....',
]
const SCANNING_SWEEP_FRAME_D: PixelGrid = [
  '..........#..',
  '..........#..',
  '..........#..',
  '..........#..',
  '..........#..',
  '..........#..',
  '..........#..',
  '..........#..',
  '..........#..',
]
const SCANNING_PIXEL_FRAMES: readonly PixelFrame[] = [
  { grid: SCANNING_SWEEP_FRAME_A, x: 64, y: 72 },
  { grid: SCANNING_SWEEP_FRAME_B, x: 64, y: 72 },
  { grid: SCANNING_SWEEP_FRAME_C, x: 64, y: 72 },
  { grid: SCANNING_SWEEP_FRAME_D, x: 64, y: 72 },
]

const BUILDING_PROGRESS_FRAME_A: PixelGrid = ['.............', '.#...........', '.............']
const BUILDING_PROGRESS_FRAME_B: PixelGrid = ['.............', '.#.#.........', '.............']
const BUILDING_PROGRESS_FRAME_C: PixelGrid = ['.............', '.#.#.#.......', '.............']
const BUILDING_PROGRESS_FRAME_D: PixelGrid = ['.............', '.#.#.#.#.....', '.............']
const BUILDING_PROGRESS_FRAME_E: PixelGrid = ['.............', '.#.#.#.#.#...', '.............']
const BUILDING_PIXEL_FRAMES: readonly PixelFrame[] = [
  { grid: BUILDING_PROGRESS_FRAME_A, x: 61, y: 86 },
  { grid: BUILDING_PROGRESS_FRAME_B, x: 61, y: 86 },
  { grid: BUILDING_PROGRESS_FRAME_C, x: 61, y: 86 },
  { grid: BUILDING_PROGRESS_FRAME_D, x: 61, y: 86 },
  { grid: BUILDING_PROGRESS_FRAME_E, x: 61, y: 86 },
]

const ALERT_MARK_FRAME_ON: PixelGrid = [
  '...##..',
  '...##..',
  '...##..',
  '...##..',
  '...##..',
  '.......',
  '...##..',
  '.......',
]
const ALERT_MARK_FRAME_OFF: PixelGrid = [
  '.......',
  '.......',
  '.......',
  '.......',
  '.......',
  '.......',
  '.......',
  '.......',
]
const ALERT_PIXEL_FRAMES: readonly PixelFrame[] = [
  { grid: ALERT_MARK_FRAME_ON, x: 66, y: 72 },
  { grid: ALERT_MARK_FRAME_OFF, x: 66, y: 72 },
]

const SATISFIED_SMILE_FRAME: PixelGrid = [
  '.............',
  '.............',
  '.............',
  '.............',
  '...#.....#...',
  '....#######..',
  '.....#####...',
  '.............',
]
const SATISFIED_BRIGHT_FRAME: PixelGrid = [
  '.#.........#.',
  '.............',
  '.............',
  '...#.....#...',
  '....#######..',
  '.....#####...',
  '.............',
  '.#.........#.',
  '.............',
]
const SATISFIED_PIXEL_FRAMES: readonly PixelFrame[] = [
  { grid: SATISFIED_SMILE_FRAME, x: 61, y: 74 },
  { grid: SATISFIED_BRIGHT_FRAME, x: 61, y: 74 },
]

const SLEEPING_Z_FRAME: PixelGrid = [
  '######.',
  '....##.',
  '...##..',
  '..##...',
  '######.',
]
const SLEEPING_PIXEL_FRAMES: readonly PixelFrame[] = [
  { grid: SLEEPING_Z_FRAME, x: 80, y: 88 },
  { grid: SLEEPING_Z_FRAME, x: 80, y: 82 },
  { grid: SLEEPING_Z_FRAME, x: 80, y: 76 },
]

const PIXEL_FRAMES: Record<HoloEmote, readonly PixelFrame[]> = {
  idle: IDLE_PIXEL_FRAMES,
  listening: LISTENING_PIXEL_FRAMES,
  thinking: THINKING_PIXEL_FRAMES,
  scanning: SCANNING_PIXEL_FRAMES,
  building: BUILDING_PIXEL_FRAMES,
  alert: ALERT_PIXEL_FRAMES,
  satisfied: SATISFIED_PIXEL_FRAMES,
  sleeping: SLEEPING_PIXEL_FRAMES,
}

function renderPixelCells(frame: PixelFrame, frameIndex: number) {
  return frame.grid.flatMap((row, rowIndex) => Array.from(row).map((cell, columnIndex) => {
    if (cell !== '#') return null
    return (
      <rect
        key={`${frameIndex}-${rowIndex}-${columnIndex}`}
        x={frame.x + columnIndex * PIXEL_CELL_SIZE}
        y={frame.y + rowIndex * PIXEL_CELL_SIZE}
        width={PIXEL_CELL_SIZE}
        height={PIXEL_CELL_SIZE}
      />
    )
  }))
}

export function HoloRing() {
  const { data } = useLiveData()
  const activityHistory = useRef<{ calmSince: number | null; lastBusyAt: number | null }>({
    calmSince: null, lastBusyAt: null,
  })

  // A missing payload should look calm rather than falsely report a quiet machine;
  // the weighted blend keeps host pressure primary while attention stays legible.
  const { activity, attentionSignals } = (() => {
    if (!data?.generatedAt) return { activity: IDLE_FLOOR, attentionSignals: 0 }

    const cpuPressure = data.telemetry.cpu
      ? Math.min(1, Math.max(0, data.telemetry.cpu.load1) / Math.max(1, data.telemetry.cpu.cores))
      : 0
    const activeCrew = data.crew.filter(member => member.status === 'active').length
    const activeTasks = data.tasks.filter(task => task.status === 'active').length
    const signals = data.tasks.filter(task => task.status === 'attention').length
      + data.warnings.length
      + Object.keys(data.collectorErrors ?? {}).length
    const blended = cpuPressure * 0.45
      + Math.min(1, activeCrew / 3) * 0.2
      + Math.min(1, activeTasks / 4) * 0.2
      + Math.min(1, signals / 4) * 0.15

    return { activity: clamp(Math.max(IDLE_FLOOR, blended)), attentionSignals: signals }
  })()

  const now = Date.now()
  const previous = activityHistory.current
  let calmSince = previous.calmSince
  let lastBusyAt = previous.lastBusyAt
  if (activity >= HOLO_EMOTE_THRESHOLDS.highActivity) {
    calmSince = null
    lastBusyAt = now
  } else if (activity < HOLO_EMOTE_THRESHOLDS.mediumActivity && calmSince === null) {
    calmSince = now
  }
  activityHistory.current = { calmSince, lastBusyAt }

  const calmForMs = calmSince == null ? 0 : Math.max(0, now - calmSince)
  const emote = deriveHoloEmote({
    activity,
    attentionSignals,
    calmForMs,
    wasBusy: lastBusyAt !== null,
    listening: !data?.generatedAt,
    // Ten-second slots alternate the medium state from the server snapshot,
    // giving the orb personality without random or timer-driven JS.
    tick: Math.floor((Date.parse(data?.generatedAt ?? '') || now) / 10_000),
  })
  const rate = 0.6 + activity * 1.9
  const duration = (baseSeconds: number) => `${baseSeconds / rate}s`
  const particleDuration = `${duration(60)}, ${duration(7)}`
  const opacity = (idle: number, busy: number) => idle + (busy - idle) * activity
  const binarySpeed = emote === 'building' ? 1.8 : emote === 'sleeping' ? 0.28 : 1

  return (
    <svg className={styles.holoRing} viewBox="0 0 200 200" role="img" aria-hidden="true" focusable="false">
      <defs>
        <filter id="holo-ring-blur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation={1.8 + activity * 1.8} />
        </filter>
        <clipPath id="holo-well-clip">
          <circle cx={CENTER} cy={CENTER} r="51" />
        </clipPath>
      </defs>
      <g className={styles.holoParticles} style={{ animationDuration: particleDuration, opacity: opacity(0.28, 0.72) }}>
        {Array.from({ length: 40 }, (_, index) => {
          const point = polar(94 + (index % 7) * 1.05, index * 9 + (index % 4) * 1.8)
          return <circle key={index} cx={point.x} cy={point.y} r={0.45 + (index % 3) * 0.16} opacity={0.1 + (index % 5) * 0.035} />
        })}
      </g>
      <g className={styles.holoOuterA} style={{ animationDuration: duration(28), opacity: opacity(0.38, 0.72) }}>
        <circle r="92" cx={CENTER} cy={CENTER} strokeDasharray="66 12 28 18 52 32" />
      </g>
      <g className={styles.holoOuterB} style={{ animationDuration: duration(44), opacity: opacity(0.28, 0.58) }}>
        <circle r="87" cx={CENTER} cy={CENTER} strokeDasharray="24 9 70 18 38 13" />
      </g>
      <g className={styles.holoOuterC} style={{ animationDuration: duration(36), opacity: opacity(0.22, 0.46) }}>
        <circle r="81" cx={CENTER} cy={CENTER} strokeDasharray="6 12 44 8 18 22" />
      </g>
      <g className={styles.holoTicks} style={{ opacity: opacity(0.56, 0.9) }}>
        {Array.from({ length: 60 }, (_, index) => {
          const major = index % 5 === 0
          const angle = index * 6
          const inner = polar(major ? 70 : 73.5, angle)
          const outer = polar(77, angle)
          return <line key={index} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} strokeWidth={major ? 1.15 : 0.55} opacity={major ? 0.85 : 0.48} />
        })}
      </g>
      <g className={styles.holoTrack} style={{ animationDuration: duration(22), opacity: opacity(0.3, 0.68) }}>
        {Array.from({ length: 24 }, (_, index) => {
          const point = polar(82.5, index * 15)
          const width = index % 4 === 0 ? 5 : 3
          return <rect key={index} x={point.x - width / 2} y={point.y - 0.9} width={width} height="1.8" rx="0.6" transform={`rotate(${index * 15} ${point.x} ${point.y})`} opacity={index % 4 === 0 ? 0.72 : 0.42} />
        })}
      </g>
      <g className={styles.holoSweepGroup} style={{ animationDuration: duration(9), opacity: opacity(0.56, 0.94) }}>
        <circle className={styles.holoSweepGlow} cx={CENTER} cy={CENTER} r="67" strokeWidth={2.2 + activity * 1.8} strokeDasharray="117 304" strokeDashoffset="-9" filter="url(#holo-ring-blur)" style={{ opacity: opacity(0.34, 0.82) }} />
        <circle className={styles.holoSweep} cx={CENTER} cy={CENTER} r="67" strokeWidth={1.15 + activity * 0.85} strokeDasharray="117 304" strokeDashoffset="-9" style={{ opacity: opacity(0.72, 1) }} />
      </g>
      <circle className={styles.holoInnerGlow} cx={CENTER} cy={CENTER} r="51" filter="url(#holo-ring-blur)" style={{ opacity: opacity(0.42, 0.82) }} />
      <circle className={styles.holoWell} cx={CENTER} cy={CENTER} r="51" />
      <g className={styles.holoBinary} clipPath="url(#holo-well-clip)" aria-hidden="true">
        {BINARY_COLUMNS.map(column => (
          <text
            className={styles.holoBinaryColumn}
            key={column.x}
            x={column.x}
            y={column.startY}
            style={{ animationDuration: `${column.duration / binarySpeed}s`, animationDelay: column.delay, opacity: column.opacity } as CSSProperties}
          >
            {column.run.split('').map((digit, index) => <tspan key={index} x={column.x} dy={index === 0 ? 0 : 6}>{digit}</tspan>)}
          </text>
        ))}
      </g>
      <g
        className={styles.holoPixels}
        data-emote={emote}
        clipPath="url(#holo-well-clip)"
        aria-hidden="true"
        style={{
          '--holo-pixel-cycle': duration(emote === 'alert' ? 1.4 : emote === 'sleeping' ? 4.8 : 2.8),
          '--holo-pixel-step': duration((emote === 'alert' ? 1.4 : emote === 'sleeping' ? 4.8 : 2.8) / PIXEL_FRAMES[emote].length),
        } as CSSProperties}
      >
        <g className={styles.holoPixelFrames}>
          {PIXEL_FRAMES[emote].map((frame, frameIndex) => (
            <g className={styles.holoPixelFrame} data-frame={frameIndex} key={frameIndex} shapeRendering="crispEdges">
              {renderPixelCells(frame, frameIndex)}
            </g>
          ))}
        </g>
        <g className={styles.holoPixelReduced} shapeRendering="crispEdges">
          {renderPixelCells(IDLE_PIXEL_FRAMES[0], 0)}
        </g>
      </g>
      <circle className={styles.holoInner} cx={CENTER} cy={CENTER} r="51" />
    </svg>
  )
}
