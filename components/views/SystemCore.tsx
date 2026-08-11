'use client'

/**
 * SYSTEM CORE — the "what is my computer actually doing" strip.
 *
 * Real host telemetry (CPU load, RAM, disk, both GPUs, Ollama VRAM) rendered
 * as compact live gauge tiles. It answers the question "is my rig idle or
 * pegged" at a glance. Every tile labels its own % so nothing floats
 * unexplained — no unit ambiguity.
 */
import { useLiveData } from '../LiveDataProvider'
import { SkeletonPanel } from '../ui'

function pct(part: number, whole: number): number {
  if (!whole) return 0
  return Math.min(100, Math.max(0, (part / whole) * 100))
}

function fmtGb(kb: number): string {
  return `${(kb / 1024 / 1024).toFixed(1)}G`
}

function fmtBytes(n: number): string {
  const gb = n / 1024 ** 3
  return gb >= 100 ? `${Math.round(gb)}G` : `${gb.toFixed(1)}G`
}

function Gauge({ label, value, sub, pct: p, tone = 'var(--pt-neon-bright)' }: {
  label: string; value: string; sub: string; pct: number; tone?: string
}) {
  const hue = p >= 85 ? 'var(--pt-danger,#ff5f57)' : p >= 60 ? 'var(--pt-warn,#ffb020)' : tone
  return (
    <div className="mc-core-gauge" title={`${label} — ${value} (${sub})`}>
      <div className="mc-core-label">{label}</div>
      <div className="mc-core-value">{value}</div>
      <div className="mc-core-sub">{sub}</div>
      <div className="mc-core-track" aria-hidden="true">
        <div className="mc-core-fill" style={{ width: `${p}%`, background: hue, boxShadow: `0 0 8px ${hue}` }} />
      </div>
    </div>
  )
}

export function SystemCore() {
  const { data } = useLiveData()
  const t = data?.telemetry
  if (!data || !t) return <SkeletonPanel label="loading system core" />

  const cpu = t.cpu
  const mem = t.memory
  const disk = t.disk
  const gpus = t.gpus ?? []
  const loaded = t.ollama ?? []

  const cpuPct = cpu ? pct(cpu.load1, cpu.cores) : 0
  const memPct = mem ? pct(mem.totalKb - mem.availableKb, mem.totalKb) : 0
  const diskPct = disk ? pct(disk.usedBytes, disk.totalBytes) : 0
  const gpuVram = gpus.length ? gpus.reduce((s, g) => s + g.memUsedMb, 0) : 0
  const gpuVramTotal = gpus.length ? gpus.reduce((s, g) => s + g.memTotalMb, 0) : 0
  const gpuUtil = gpus.length ? Math.round(gpus.reduce((s, g) => s + g.utilPct, 0) / gpus.length) : 0
  const gpuTemp = gpus.length ? Math.max(...gpus.map(g => g.tempC)) : 0

  return (
    <div className="mc-core">
      <div className="mc-core-grid">
        <Gauge label="CPU" value={cpu ? `${Math.round(cpu.load1 * 10) / 10}` : '—'} sub={cpu ? `${cpu.cores} cores · 5m ${Math.round(cpu.load5 * 10) / 10}` : 'n/a'} pct={cpuPct} />
        <Gauge label="RAM" value={mem ? fmtGb(mem.totalKb - mem.availableKb) : '—'} sub={mem ? `of ${fmtGb(mem.totalKb)}` : 'n/a'} pct={memPct} tone="var(--pt-info,#00d4ff)" />
        <Gauge label="DISK" value={disk ? fmtBytes(disk.usedBytes) : '—'} sub={disk ? `of ${fmtBytes(disk.totalBytes)} free` : 'n/a'} pct={diskPct} tone="var(--pt-ok,#3ddc97)" />
        <Gauge label="GPU" value={gpus.length ? `${gpuUtil}%` : '—'} sub={gpus.length ? `${gpus.length} ok · ${gpuTemp}°C` : 'n/a'} pct={gpuUtil} tone="var(--pt-accent,#a78bfa)" />
        <Gauge label="VRAM" value={gpuVram ? `${Math.round(gpuVram)}MB` : '—'} sub={gpuVramTotal ? `of ${Math.round(gpuVramTotal)}MB` : 'n/a'} pct={pct(gpuVram, gpuVramTotal)} tone="var(--pt-accent,#a78bfa)" />
      </div>

      {loaded.length > 0 && (
        <div className="mc-core-models">
          <div className="mc-core-models-label">OLLAMA LOADED · LOCAL AI</div>
          {loaded.map(m => (
            <span key={m.name} className="mc-core-model-chip">
              <span className="mc-led green" />
              {m.name}
              <span className="mc-core-model-vram">{m.vramGb}G VRAM{Number(m.sizeGb) > Number(m.vramGb) ? ` · ${m.sizeGb}G` : ''}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
