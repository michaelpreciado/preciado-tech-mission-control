/**
 * Pure parsers for Linux host telemetry — /proc, /sys/class/hwmon and
 * nvidia-smi text in, plain numbers out.
 *
 * Deliberately dependency-free (like costs-usage.ts and ollama-throughput.ts)
 * so Node's ESM loader can import it straight from tests without resolving the
 * app's extensionless `@/lib` aliases. Nothing here touches the filesystem or
 * spawns a process; every I/O concern lives in lib/host-metrics.ts.
 *
 * Every parser is total: malformed input yields zeroes or null, never a throw.
 * A dashboard tile going blank is acceptable; a collector taking the page down
 * is not.
 */

/* ── /proc/stat ─────────────────────────────────────────────────────── */

/** Cumulative jiffy counters for one CPU line. `idle` folds in iowait. */
export interface CpuTicks {
  total: number
  idle: number
}

export interface ProcStat {
  /** Per-thread counters, index-aligned with cpu0..cpuN. */
  cpus: CpuTicks[]
  /** The aggregate `cpu` line. */
  aggregate: CpuTicks
  /** Cumulative context switches since boot. */
  ctxt: number
  procsRunning: number
  procsBlocked: number
}

const EMPTY_TICKS: CpuTicks = { total: 0, idle: 0 }

function ticksOf(fields: number[]): CpuTicks {
  // user nice system idle iowait irq softirq steal guest guest_nice
  const total = fields.reduce((s, n) => s + n, 0)
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0)
  return { total, idle }
}

export function parseProcStat(raw: string): ProcStat {
  const cpus: CpuTicks[] = []
  let aggregate: CpuTicks = EMPTY_TICKS
  let ctxt = 0
  let procsRunning = 0
  let procsBlocked = 0

  for (const line of raw.split('\n')) {
    if (line.startsWith('cpu')) {
      const parts = line.trim().split(/\s+/)
      const ticks = ticksOf(parts.slice(1).map(Number).map(n => (Number.isFinite(n) ? n : 0)))
      if (parts[0] === 'cpu') aggregate = ticks
      else cpus.push(ticks)
    } else if (line.startsWith('ctxt ')) {
      ctxt = Number(line.slice(5).trim()) || 0
    } else if (line.startsWith('procs_running ')) {
      procsRunning = Number(line.slice(14).trim()) || 0
    } else if (line.startsWith('procs_blocked ')) {
      procsBlocked = Number(line.slice(14).trim()) || 0
    }
  }

  return { cpus, aggregate, ctxt, procsRunning, procsBlocked }
}

function busyPct(prev: CpuTicks, cur: CpuTicks): number {
  const dTotal = cur.total - prev.total
  // A negative delta means the counters reset (suspend/resume, container
  // restart). Report idle rather than a nonsense spike.
  if (dTotal <= 0) return 0
  const dIdle = Math.max(0, cur.idle - prev.idle)
  const pct = ((dTotal - dIdle) / dTotal) * 100
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10
}

/** Aggregate CPU busy percentage between two /proc/stat samples. */
export function cpuUsagePct(prev: CpuTicks, cur: CpuTicks): number {
  return busyPct(prev, cur)
}

/** Per-thread busy percentages. Threads missing from either sample are dropped. */
export function perCoreUsagePct(prev: CpuTicks[], cur: CpuTicks[]): number[] {
  const n = Math.min(prev.length, cur.length)
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(busyPct(prev[i], cur[i]))
  return out
}

/* ── /proc/meminfo ──────────────────────────────────────────────────── */

export interface MemInfo {
  totalKb: number
  availableKb: number
  freeKb: number
  buffersKb: number
  cachedKb: number
  swapTotalKb: number
  swapUsedKb: number
}

export function parseMeminfo(raw: string): MemInfo | null {
  const get = (key: string): number => {
    const m = raw.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))
    return m ? Number(m[1]) : 0
  }
  const totalKb = get('MemTotal')
  if (!totalKb) return null
  const swapTotalKb = get('SwapTotal')
  return {
    totalKb,
    availableKb: get('MemAvailable'),
    freeKb: get('MemFree'),
    buffersKb: get('Buffers'),
    cachedKb: get('Cached'),
    swapTotalKb,
    swapUsedKb: Math.max(0, swapTotalKb - get('SwapFree')),
  }
}

/* ── /proc/net/dev ──────────────────────────────────────────────────── */

export interface NetCounters {
  iface: string
  rxBytes: number
  txBytes: number
  rxPackets: number
  txPackets: number
}

export function parseNetDev(raw: string): NetCounters[] {
  const out: NetCounters[] = []
  for (const line of raw.split('\n')) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const iface = line.slice(0, colon).trim()
    // Loopback traffic is the dashboard talking to itself — never interesting.
    if (!iface || iface === 'lo') continue
    const f = line.slice(colon + 1).trim().split(/\s+/).map(Number)
    if (f.length < 10 || !Number.isFinite(f[0])) continue
    out.push({ iface, rxBytes: f[0], rxPackets: f[1], txBytes: f[8], txPackets: f[9] })
  }
  return out
}

/* ── /proc/diskstats ────────────────────────────────────────────────── */

export interface DiskCounters {
  name: string
  readBytes: number
  writeBytes: number
}

const SECTOR_BYTES = 512
/** Virtual/duplicate devices — counting these double-counts real traffic. */
const VIRTUAL_DEVICE = /^(loop|ram|zram|dm-|md\d|sr\d)/
/** Partitions repeat their parent disk's traffic. */
const PARTITION = /^(?:(?:[svh]d[a-z]+|xvd[a-z]+)\d+|nvme\d+n\d+p\d+|mmcblk\d+p\d+)$/

export function parseDiskstats(raw: string): DiskCounters[] {
  const out: DiskCounters[] = []
  for (const line of raw.split('\n')) {
    const f = line.trim().split(/\s+/)
    if (f.length < 14) continue
    const name = f[2]
    if (!name || VIRTUAL_DEVICE.test(name) || PARTITION.test(name)) continue
    out.push({
      name,
      readBytes: (Number(f[5]) || 0) * SECTOR_BYTES,
      writeBytes: (Number(f[9]) || 0) * SECTOR_BYTES,
    })
  }
  return out
}

/* ── /proc/pressure/* ───────────────────────────────────────────────── */

/**
 * PSI stall percentages. `some` = at least one task stalled; `full` = every
 * task stalled (the number that actually means "this machine is struggling").
 */
export interface Pressure {
  some10: number
  some60: number
  full10: number
}

function avg10Of(raw: string, prefix: string): number | null {
  const m = raw.match(new RegExp(`^${prefix}\\s+avg10=([\\d.]+)\\s+avg60=([\\d.]+)`, 'm'))
  return m ? Number(m[1]) : null
}

export function parsePressure(raw: string): Pressure | null {
  const someLine = raw.match(/^some\s+avg10=([\d.]+)\s+avg60=([\d.]+)/m)
  if (!someLine) return null
  return {
    some10: Number(someLine[1]),
    some60: Number(someLine[2]),
    // /proc/pressure/cpu has no `full` line on most kernels.
    full10: avg10Of(raw, 'full') ?? 0,
  }
}

/* ── /proc/uptime ───────────────────────────────────────────────────── */

export function parseUptime(raw: string): number | null {
  const secs = Number(raw.trim().split(/\s+/)[0])
  return Number.isFinite(secs) ? secs : null
}

/* ── nvidia-smi ─────────────────────────────────────────────────────── */

export interface GpuCard {
  index: number
  name: string
  utilPct: number
  memUsedMb: number
  memTotalMb: number
  tempC: number
  /** Null when the card doesn't report it (common on laptop/mobile parts). */
  powerW: number | null
  fanPct: number | null
}

/** `[N/A]` and `[Not Supported]` are nvidia-smi's way of saying "no sensor". */
function optionalNum(v: string): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function parseNvidiaSmi(csv: string): GpuCard[] {
  const out: GpuCard[] = []
  for (const line of csv.trim().split('\n')) {
    if (!line.trim()) continue
    const c = line.split(',').map(s => s.trim())
    if (c.length < 6) continue
    const index = Number(c[0])
    if (!Number.isFinite(index)) continue
    out.push({
      index,
      // "NVIDIA GeForce RTX 5070 Ti" is all brand until the model — drop it.
      name: c[1].replace(/^NVIDIA\s+/i, '').replace(/^GeForce\s+/i, ''),
      utilPct: Number(c[2]) || 0,
      memUsedMb: Number(c[3]) || 0,
      memTotalMb: Number(c[4]) || 0,
      tempC: Number(c[5]) || 0,
      powerW: optionalNum(c[6] ?? ''),
      fanPct: optionalNum(c[7] ?? ''),
    })
  }
  return out
}

/* ── hwmon ──────────────────────────────────────────────────────────── */

/** hwmon temp*_input is millidegrees celsius. */
export function parseHwmonTemp(raw: string): number | null {
  const milli = Number(raw.trim())
  return Number.isFinite(milli) ? Math.round(milli / 100) / 10 : null
}

/* ── rate helper ────────────────────────────────────────────────────── */

/** Per-second rate from two cumulative counters. Resets clamp to 0. */
export function ratePerSec(prev: number, cur: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  const delta = cur - prev
  if (delta < 0) return 0
  return (delta * 1000) / elapsedMs
}

/* ── ring buffer ────────────────────────────────────────────────────── */

/**
 * Fixed-capacity FIFO for the scope traces. Overwrites in place so a long-lived
 * sampler never grows its heap.
 */
export class RingBuffer<T> {
  private items: T[] = []
  private cap: number
  private start = 0
  private size = 0

  constructor(capacity: number) {
    this.cap = Math.max(1, Math.floor(capacity))
  }

  get length(): number {
    return this.size
  }

  push(value: T): void {
    if (this.size < this.cap) {
      this.items[(this.start + this.size) % this.cap] = value
      this.size++
    } else {
      this.items[this.start] = value
      this.start = (this.start + 1) % this.cap
    }
  }

  /** Oldest to newest. */
  toArray(): T[] {
    const out: T[] = []
    for (let i = 0; i < this.size; i++) out.push(this.items[(this.start + i) % this.cap])
    return out
  }

  last(): T | null {
    if (!this.size) return null
    return this.items[(this.start + this.size - 1) % this.cap]
  }

  clear(): void {
    this.items = []
    this.start = 0
    this.size = 0
  }
}
