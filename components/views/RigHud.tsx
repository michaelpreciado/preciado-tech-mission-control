'use client'

/**
 * RIG HUD — the "what is my machine actually doing" instrument panel on Home.
 *
 * Replaces the five flat gauges of the old SYSTEM CORE with a live readout of
 * everything the box will tell us: per-thread CPU, clocks, package temp, PSI
 * stall pressure, memory + swap, per-card GPU, disk and network throughput.
 *
 * Art direction — engineering HUD: thin-line radial dials with tick rings and
 * corner brackets, a core-die grid, and 120-second oscilloscope traces. The
 * traces are what make it feel alive between polls; everything else is a
 * number you can act on.
 *
 * Data comes from /api/telemetry (a 1 Hz server-side sampler), NOT from the
 * 30-second /api/mission-control aggregate — rates need a fixed cadence the
 * client can't provide. See lib/host-metrics.ts.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { SkeletonPanel } from '../ui'
import type { HostMetrics } from '@/lib/host-metrics'

const POLL_MS = 2_000

/* ── Formatters ─────────────────────────────────────────────────────── */

function fmtBytes(n: number, digits = 1): string {
  if (!Number.isFinite(n) || n <= 0) return '0B'
  const units = ['B', 'K', 'M', 'G', 'T']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / 1024 ** i
  return `${v.toFixed(i === 0 ? 0 : v >= 100 ? 0 : digits)}${units[i]}`
}

function fmtRate(bps: number): string {
  return `${fmtBytes(bps)}/s`
}

function fmtGbFromKb(kb: number): string {
  return `${(kb / 1024 / 1024).toFixed(1)}G`
}

function fmtUptime(sec: number | null): string {
  if (sec === null) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

function pctOf(part: number, whole: number): number {
  if (!whole) return 0
  return Math.min(100, Math.max(0, (part / whole) * 100))
}

/**
 * Capacity bands. Reserved for metrics where FULL IS A PROBLEM — memory, disk,
 * VRAM, swap. Utilization (CPU/GPU busy %) deliberately does NOT use this: a
 * pegged core is the machine doing its job, not a fault, and lib/tokens.ts
 * holds red to semantic use only.
 */
function bandColor(pct: number, base = 'var(--pt-neon-bright)'): string {
  if (pct >= 90) return 'var(--pt-error)'
  if (pct >= 70) return 'var(--pt-warn)'
  return base
}

/** Thermal bands — a genuinely semantic signal, unlike load. */
function tempTone(c: number | null | undefined): string | undefined {
  if (c == null) return undefined
  if (c >= 90) return 'var(--pt-error)'
  if (c >= 80) return 'var(--pt-warn)'
  return undefined
}

/* ── Radial dial ────────────────────────────────────────────────────── */

const DIAL = 128
const R_ARC = 46
const R_TICK = 55
const START_DEG = 135
const SWEEP_DEG = 270
const TICKS = 37

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, sweepDeg: number): string {
  // A full 360° sweep can't be expressed as one arc — nudge it just short.
  const sweep = Math.min(sweepDeg, 359.9)
  const [x1, y1] = polar(cx, cy, r, fromDeg)
  const [x2, y2] = polar(cx, cy, r, fromDeg + sweep)
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

function Dial({ label, pct, value, unit, sub, color, capacity, subTone }: {
  label: string
  pct: number
  value: string
  unit?: string
  sub: string
  color: string
  /** True when a full gauge means trouble (memory, disk). Utilization: false. */
  capacity?: boolean
  subTone?: string
}) {
  const c = DIAL / 2
  const clamped = Math.min(100, Math.max(0, pct))
  const tone = capacity ? bandColor(clamped, color) : color
  const bracket = 13

  return (
    <div className="mc-rig-dial" title={`${label} — ${value}${unit ?? ''} (${sub})`}>
      <div className="mc-rig-dial-face">
      <svg viewBox={`0 0 ${DIAL} ${DIAL}`} className="mc-rig-dial-svg" aria-hidden="true">
        {/* corner brackets — the HUD frame */}
        {[[2, 2, 1, 1], [DIAL - 2, 2, -1, 1], [2, DIAL - 2, 1, -1], [DIAL - 2, DIAL - 2, -1, -1]].map(([x, y, dx, dy], i) => (
          <path key={i} d={`M${x} ${y + dy * bracket} L${x} ${y} L${x + dx * bracket} ${y}`}
            fill="none" stroke="var(--pt-border-strong)" strokeWidth="1" />
        ))}

        {/* tick ring — every 6th tick is major */}
        {Array.from({ length: TICKS }, (_, i) => {
          const deg = START_DEG + (SWEEP_DEG * i) / (TICKS - 1)
          const major = i % 6 === 0
          const lit = (i / (TICKS - 1)) * 100 <= clamped
          const [x1, y1] = polar(c, c, R_TICK, deg)
          const [x2, y2] = polar(c, c, R_TICK - (major ? 7 : 4), deg)
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={lit ? tone : 'var(--pt-border)'}
              strokeWidth={major ? 1.4 : 1}
              opacity={lit ? 0.95 : 0.4} />
          )
        })}

        {/* track + value arc */}
        <path d={arcPath(c, c, R_ARC, START_DEG, SWEEP_DEG)} fill="none"
          stroke="var(--pt-border)" strokeWidth="5" strokeLinecap="butt" />
        {clamped > 0 && (
          <path className="mc-rig-dial-arc" d={arcPath(c, c, R_ARC, START_DEG, (SWEEP_DEG * clamped) / 100)}
            fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round" />
        )}
      </svg>
        <div className="mc-rig-dial-core">
          <span className="mc-rig-dial-value" style={{ color: tone }}>
            {value}{unit && <i>{unit}</i>}
          </span>
        </div>
      </div>

      <div className="mc-rig-dial-label">{label}</div>
      <div className="mc-rig-dial-sub" style={subTone ? { color: subTone } : undefined}>{sub}</div>
    </div>
  )
}

/* ── Oscilloscope trace ─────────────────────────────────────────────── */

const SCOPE_W = 600
const SCOPE_H = 46

/**
 * One 120-second channel. `series` is oldest→newest; the head of the line is
 * "now", so the trace scrolls right-to-left as samples arrive.
 */
function Trace({ label, series, color, readout, max }: {
  label: string
  series: number[]
  color: string
  readout: string
  /** Fixed ceiling (e.g. 100 for a percentage). Omit to autoscale. */
  max?: number
}) {
  const { line, area, head } = useMemo(() => {
    if (series.length < 2) return { line: '', area: '', head: null as [number, number] | null }
    const ceiling = max ?? Math.max(1, ...series)
    const stepX = SCOPE_W / (series.length - 1)
    const y = (v: number) => SCOPE_H - 2 - (Math.min(v, ceiling) / ceiling) * (SCOPE_H - 5)
    const pts = series.map((v, i) => [i * stepX, y(v)] as [number, number])
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')
    const area = `${line}L${SCOPE_W} ${SCOPE_H}L0 ${SCOPE_H}Z`
    return { line, area, head: pts[pts.length - 1] }
  }, [series, max])

  const id = label.replace(/\W+/g, '')

  return (
    <div className="mc-rig-trace">
      <div className="mc-rig-trace-label">{label}</div>
      <svg viewBox={`0 0 ${SCOPE_W} ${SCOPE_H}`} preserveAspectRatio="none" className="mc-rig-trace-svg" aria-hidden="true">
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* graticule */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1="0" y1={SCOPE_H * f} x2={SCOPE_W} y2={SCOPE_H * f}
            stroke="var(--pt-border)" strokeWidth="0.5" opacity="0.35" />
        ))}
        {line && <path d={area} fill={`url(#fill-${id})`} />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth="1.4"
          vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        {head && <circle className="mc-rig-trace-head" cx={head[0]} cy={head[1]} r="2.4" fill={color} />}
      </svg>
      <div className="mc-rig-trace-readout" style={{ color }}>{readout}</div>
    </div>
  )
}

/* ── Core die ───────────────────────────────────────────────────────── */

/** One cell per hardware thread, lit by that thread's own load. */
function CoreDie({ cores }: { cores: number[] }) {
  if (!cores.length) return null
  const cols = cores.length > 12 ? Math.ceil(cores.length / 2) : cores.length
  return (
    <div className="mc-rig-die" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {cores.map((p, i) => (
        <span key={i} className="mc-rig-die-cell" title={`thread ${i} — ${p.toFixed(0)}%`}
          style={{
            // Intensity ramp on the accent only. A busy thread is not a fault,
            // so the die shows SHAPE (which threads are hot) without ever
            // borrowing the semantic warn/error colors.
            background: `color-mix(in srgb, var(--pt-neon-bright) ${Math.round(4 + p * 0.16)}%, transparent)`,
            borderColor: p > 55 ? 'var(--pt-neon)' : 'var(--pt-border)',
            boxShadow: p > 70 ? '0 0 7px var(--pt-neon-glow)' : 'none',
          }}>
          <i style={{ height: `${Math.max(3, p)}%`, background: 'var(--pt-neon-bright)' }} />
        </span>
      ))}
    </div>
  )
}

/* ── Vitals ─────────────────────────────────────────────────────────── */

function Vital({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="mc-rig-vital">
      <span className="mc-rig-vital-label">{label}</span>
      <span className="mc-rig-vital-value" style={tone ? { color: tone } : undefined}>{value}</span>
    </div>
  )
}

/* ── Polling hook ───────────────────────────────────────────────────── */

function useHostMetrics() {
  const [data, setData] = useState<HostMetrics | null>(null)
  const [error, setError] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    let alive = true

    const tick = async () => {
      // A backgrounded tab shouldn't keep the server's sampler awake.
      if (typeof document !== 'undefined' && document.hidden) return
      abort.current?.abort()
      const ctl = new AbortController()
      abort.current = ctl
      try {
        const res = await fetch('/api/telemetry', { cache: 'no-store', signal: ctl.signal })
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as HostMetrics
        if (!alive) return
        setData(json)
        setError(false)
      } catch (err) {
        // An aborted in-flight poll is us superseding ourselves, not a failure.
        if (!alive || (err as Error)?.name === 'AbortError') return
        setError(true)
      }
    }

    void tick()
    const timer = window.setInterval(() => { void tick() }, POLL_MS)
    const onVisible = () => { if (!document.hidden) void tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      abort.current?.abort()
    }
  }, [])

  return { data, error }
}

/* ── The HUD ────────────────────────────────────────────────────────── */

export function RigHud() {
  const { data, error } = useHostMetrics()

  if (!data) {
    return error
      ? <div className="mc-rig-offline">TELEMETRY OFFLINE · /api/telemetry unreachable</div>
      : <SkeletonPanel label="loading rig telemetry" />
  }

  const s = data.current
  const h = data.history
  const gpus = s?.gpus ?? []

  const memPct = s ? pctOf(s.memUsedKb, s.memTotalKb) : 0
  const swapPct = s ? pctOf(s.swapUsedKb, s.swapTotalKb) : 0
  const rootMount = data.mounts[0]
  const diskPct = rootMount ? pctOf(rootMount.usedBytes, rootMount.totalBytes) : 0
  const netTotal = s ? s.netRxBps + s.netTxBps : 0
  const ioTotal = s ? s.diskReadBps + s.diskWriteBps : 0

  return (
    <div className="mc-rig">
      {/* ── identity bar ── */}
      <div className="mc-rig-head">
        <span className={`mc-led ${error ? 'red' : 'green'}`} aria-hidden="true" />
        <span className="mc-rig-host">{data.static.hostname}</span>
        <span className="mc-rig-spec is-long">{data.static.cpuModel ?? 'unknown CPU'}</span>
        <span className="mc-rig-spec">{data.static.threads}T</span>
        {data.static.kernel && <span className="mc-rig-spec is-long">kernel {data.static.kernel}</span>}
        <span className="mc-rig-spec">up {fmtUptime(data.uptimeSec)}</span>
        <span className="mc-rig-stamp">{error ? 'STALE' : `${h.cpu.length}s TRACE`}</span>
      </div>

      {/* ── dial row ── */}
      <div className="mc-rig-dials">
        <Dial
          label="CPU"
          pct={s?.cpuPct ?? 0}
          value={(s?.cpuPct ?? 0).toFixed(0)}
          unit="%"
          sub={[
            s?.cpuMhzMax ? `${(s.cpuMhzMax / 1000).toFixed(2)}GHz` : null,
            s?.cpuTempC != null ? `${s.cpuTempC.toFixed(0)}°C` : null,
          ].filter(Boolean).join(' · ') || 'n/a'}
          color="var(--pt-neon-bright)"
          subTone={tempTone(s?.cpuTempC)}
        />
        <Dial
          label="MEMORY"
          pct={memPct}
          value={s ? fmtGbFromKb(s.memUsedKb) : '—'}
          sub={s ? `of ${fmtGbFromKb(s.memTotalKb)} · ${fmtGbFromKb(s.memCachedKb)} cached` : 'n/a'}
          color="var(--pt-info)"
          capacity
        />
        {gpus.map(g => (
          <Dial
            key={g.index}
            label={`GPU·${g.index}`}
            pct={g.utilPct}
            value={String(g.utilPct)}
            unit="%"
            sub={`${g.name} · ${g.tempC}°C${g.powerW != null ? ` · ${g.powerW.toFixed(0)}W` : ''}`}
            color="var(--pt-neon)"
            subTone={tempTone(g.tempC)}
          />
        ))}
        <Dial
          label="DISK"
          pct={diskPct}
          value={rootMount ? fmtBytes(rootMount.usedBytes, 0) : '—'}
          sub={rootMount ? `of ${fmtBytes(rootMount.totalBytes, 0)} on ${rootMount.mount}` : 'n/a'}
          color="var(--pt-ok)"
          capacity
        />
      </div>

      {/* ── core die + VRAM ── */}
      <div className="mc-rig-silicon">
        <div className="mc-rig-block">
          <div className="mc-rig-block-head">
            <span>CORE DIE</span>
            <span className="mc-rig-block-meta">{s?.cores.length ?? 0} THREADS</span>
          </div>
          <CoreDie cores={s?.cores ?? []} />
        </div>
        <div className="mc-rig-block">
          <div className="mc-rig-block-head">
            <span>VRAM</span>
            <span className="mc-rig-block-meta">{gpus.length} CARD{gpus.length === 1 ? '' : 'S'}</span>
          </div>
          <div className="mc-rig-vram">
            {gpus.length === 0 && <div className="mc-rig-none">no NVIDIA cards detected</div>}
            {gpus.map(g => {
              const p = pctOf(g.memUsedMb, g.memTotalMb)
              return (
                <div key={g.index} className="mc-rig-vram-row" title={`${g.name} — ${g.memUsedMb}MB of ${g.memTotalMb}MB`}>
                  <span className="mc-rig-vram-name">{g.name}</span>
                  <span className="mc-rig-vram-track">
                    <i style={{ width: `${p}%`, background: bandColor(p, 'var(--pt-neon)') }} />
                  </span>
                  <span className="mc-rig-vram-val">
                    {(g.memUsedMb / 1024).toFixed(1)}/{(g.memTotalMb / 1024).toFixed(1)}G
                  </span>
                  <span className="mc-rig-vram-fan">{g.fanPct != null ? `fan ${g.fanPct}%` : '—'}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── scope ── */}
      <div className="mc-rig-scope">
        <div className="mc-rig-block-head">
          <span>SCOPE</span>
          <span className="mc-rig-block-meta">{h.cpu.length}s WINDOW · 1Hz</span>
        </div>
        {h.cpu.length < 2 ? (
          <div className="mc-rig-none">calibrating — traces appear after a few samples</div>
        ) : (
          <>
            <Trace label="CPU" series={h.cpu} max={100} color="var(--pt-neon-bright)" readout={`${(s?.cpuPct ?? 0).toFixed(0)}%`} />
            <Trace label="MEM" series={h.mem} max={100} color="var(--pt-info)" readout={`${memPct.toFixed(0)}%`} />
            {h.gpu.map((series, i) => (
              <Trace key={i} label={`GPU${i}`} series={series} max={100} color="var(--pt-neon)" readout={`${gpus[i]?.utilPct ?? 0}%`} />
            ))}
            <Trace label="NET" series={h.netRx.map((v, i) => v + (h.netTx[i] ?? 0))} color="var(--pt-ok)" readout={fmtRate(netTotal)} />
            <Trace label="DISK" series={h.diskRead.map((v, i) => v + (h.diskWrite[i] ?? 0))} color="var(--pt-warn)" readout={fmtRate(ioTotal)} />
          </>
        )}
      </div>

      {/* ── vitals ── */}
      <div className="mc-rig-vitals">
        <Vital label="STALL · CPU" value={s?.psiCpu != null ? `${s.psiCpu.toFixed(2)}%` : '—'} tone={(s?.psiCpu ?? 0) > 5 ? 'var(--pt-warn)' : undefined} />
        <Vital label="STALL · MEM" value={s?.psiMem != null ? `${s.psiMem.toFixed(2)}%` : '—'} tone={(s?.psiMem ?? 0) > 5 ? 'var(--pt-warn)' : undefined} />
        <Vital label="STALL · IO" value={s?.psiIo != null ? `${s.psiIo.toFixed(2)}%` : '—'} tone={(s?.psiIo ?? 0) > 5 ? 'var(--pt-warn)' : undefined} />
        <Vital label="RUNNING" value={String(s?.procsRunning ?? 0)} />
        <Vital label="CTX SWITCH" value={`${((s?.ctxPerSec ?? 0) / 1000).toFixed(1)}k/s`} />
        <Vital label="SWAP" value={s && s.swapTotalKb ? `${fmtGbFromKb(s.swapUsedKb)} · ${swapPct.toFixed(0)}%` : 'none'} tone={swapPct > 20 ? 'var(--pt-warn)' : undefined} />
        <Vital label="NVME" value={s?.nvmeTempC != null ? `${s.nvmeTempC.toFixed(0)}°C` : '—'} tone={(s?.nvmeTempC ?? 0) > 65 ? 'var(--pt-warn)' : undefined} />
        <Vital label="DISK I/O" value={`↓${fmtRate(s?.diskReadBps ?? 0)} ↑${fmtRate(s?.diskWriteBps ?? 0)}`} />
      </div>

      {/* ── links: interfaces + mounts ── */}
      <div className="mc-rig-links">
        <div className="mc-rig-block">
          <div className="mc-rig-block-head"><span>NETWORK</span><span className="mc-rig-block-meta">{data.interfaces.length} LINKS</span></div>
          {data.interfaces.length === 0 && <div className="mc-rig-none">no active interfaces</div>}
          {data.interfaces.map(i => (
            <div key={i.iface} className="mc-rig-link">
              <span className="mc-rig-link-name">{i.iface}</span>
              <span className="mc-rig-link-rate">↓ {fmtRate(i.rxBps)}</span>
              <span className="mc-rig-link-rate">↑ {fmtRate(i.txBps)}</span>
              <span className="mc-rig-link-total">{fmtBytes(i.rxTotalBytes + i.txTotalBytes, 0)} total</span>
            </div>
          ))}
        </div>
        <div className="mc-rig-block">
          <div className="mc-rig-block-head"><span>VOLUMES</span><span className="mc-rig-block-meta">{data.mounts.length} MOUNTED</span></div>
          {data.mounts.length === 0 && <div className="mc-rig-none">no volumes reported</div>}
          {data.mounts.map(m => {
            const p = pctOf(m.usedBytes, m.totalBytes)
            return (
              <div key={m.mount} className="mc-rig-mount" title={`${m.device} on ${m.mount}`}>
                <span className="mc-rig-mount-name">{m.mount}</span>
                <span className="mc-rig-vram-track"><i style={{ width: `${p}%`, background: bandColor(p, 'var(--pt-ok)') }} /></span>
                <span className="mc-rig-mount-val">{fmtBytes(m.totalBytes - m.usedBytes, 0)} free</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
