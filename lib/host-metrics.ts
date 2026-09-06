/**
 * Host metrics sampler — the data source behind the RIG HUD on Home.
 *
 * Why a sampler and not another collector: per-thread CPU %, network rx/tx and
 * disk read/write are all *rates*. They need two counter reads separated by a
 * known interval, and the HUD's scope traces need history. Computing deltas
 * per-request would make every number depend on how many browser tabs happened
 * to be polling. So the server owns the cadence: one 1 Hz timer feeding a
 * 120-sample ring buffer, and the route just reads it.
 *
 * The timer starts lazily on the first read and stops itself after IDLE_STOP_MS
 * with no reader, so a closed tab doesn't leave a heartbeat burning CPU
 * overnight — the same idle-backoff bargain lib/server-cache.ts makes.
 *
 * Every read is best-effort: a missing source yields null and the tile goes
 * blank, matching the contract in lib/collectors/*.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  parseProcStat,
  cpuUsagePct,
  perCoreUsagePct,
  parseMeminfo,
  parseNetDev,
  parseDiskstats,
  parsePressure,
  parseUptime,
  parseNvidiaSmi,
  parseHwmonTemp,
  ratePerSec,
  RingBuffer,
  type GpuCard,
} from './collectors/host-parsers'
import { logger } from './logger'
import { getCachedCollector } from './collector-cache'

const pexec = promisify(execFile)

const TICK_MS = 1_000
/** 120 samples at 1 Hz = a two-minute scope window. */
const HISTORY = 120
/** Samples older than this are dropped when serving, closing idle-gap seams. */
const MAX_AGE_MS = (HISTORY + 10) * TICK_MS
const IDLE_STOP_MS = 60_000
/** nvidia-smi is a ~100ms process spawn; temps and power don't need 1 Hz. */
const GPU_EVERY = 2
/** Mount usage moves in minutes, not seconds. */
const MOUNTS_EVERY = 30
const EXEC_TIMEOUT_MS = 2_000
/** Gap between the two cold-start ticks, so the first sample has a real window. */
const COLD_SETTLE_MS = 350

/* ── Public shapes ──────────────────────────────────────────────────── */

export type GpuSample = GpuCard

export interface HostSample {
  /** Epoch ms. */
  t: number
  cpuPct: number
  /** One-minute load average from /proc/loadavg. */
  load1: number
  /** Per-thread busy %, index-aligned with cpu0..cpuN. */
  cores: number[]
  cpuMhzMax: number | null
  cpuMhzAvg: number | null
  cpuTempC: number | null
  memUsedKb: number
  memCachedKb: number
  memTotalKb: number
  swapUsedKb: number
  swapTotalKb: number
  netRxBps: number
  netTxBps: number
  diskReadBps: number
  diskWriteBps: number
  gpus: GpuSample[]
  /** PSI "some" avg10 stall percentages. */
  psiCpu: number | null
  psiMem: number | null
  psiIo: number | null
  procsRunning: number
  ctxPerSec: number
  nvmeTempC: number | null
}

export interface MountUsage {
  mount: string
  device: string
  usedBytes: number
  totalBytes: number
}

export interface NetIface {
  iface: string
  rxBps: number
  txBps: number
  rxTotalBytes: number
  txTotalBytes: number
}

export interface HostStatic {
  hostname: string
  cpuModel: string | null
  threads: number
  kernel: string | null
}

export interface HostMetrics {
  generatedAt: string
  /** True once at least two ticks have landed, i.e. rates are real. */
  sampling: boolean
  static: HostStatic
  current: HostSample | null
  uptimeSec: number | null
  mounts: MountUsage[]
  interfaces: NetIface[]
  /** Columnar history — arrays of numbers, not 120 objects. */
  history: {
    t: number[]
    cpu: number[]
    mem: number[]
    netRx: number[]
    netTx: number[]
    diskRead: number[]
    diskWrite: number[]
    /** One series per GPU card, index-aligned with current.gpus. */
    gpu: number[][]
  }
}

/* ── Sampler state ──────────────────────────────────────────────────── */

const buffer = new RingBuffer<HostSample>(HISTORY)

let timer: ReturnType<typeof setInterval> | null = null
let inFlight: Promise<void> | null = null
let tickCount = 0
let lastReadAt = 0

let prevStat: ReturnType<typeof parseProcStat> | null = null
let prevAt = 0
let prevNet: Map<string, { rx: number; tx: number }> | null = null
let prevDisk: Map<string, { r: number; w: number }> | null = null
let prevCtxt = 0

let lastGpus: GpuSample[] = []
let mounts: MountUsage[] = []
let interfaces: NetIface[] = []
let uptimeSec: number | null = null
let staticInfo: HostStatic | null = null
let hwmonPaths: { cpu: string | null; nvme: string | null } | null = null

/* ── Best-effort readers ────────────────────────────────────────────── */

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * Locate the package-temperature and NVMe sensors once. hwmon numbering is
 * assigned at probe time and shuffles across reboots, so the device must be
 * found by its `name`, never by a hardcoded hwmonN path.
 */
async function discoverHwmon(): Promise<{ cpu: string | null; nvme: string | null }> {
  const found: { cpu: string | null; nvme: string | null } = { cpu: null, nvme: null }
  let dirs: string[]
  try {
    dirs = await fs.readdir('/sys/class/hwmon')
  } catch {
    return found
  }
  for (const d of dirs) {
    const base = path.join('/sys/class/hwmon', d)
    const name = (await readText(path.join(base, 'name')))?.trim()
    if (!name) continue
    const isCpu = name === 'coretemp' || name === 'k10temp' || name === 'zenpower'
    const isNvme = name === 'nvme'
    if (!isCpu && !isNvme) continue
    // Prefer the labelled package/composite sensor over a per-core one.
    let pick: string | null = null
    let files: string[] = []
    try { files = await fs.readdir(base) } catch { continue }
    for (const f of files.filter(f => /^temp\d+_label$/.test(f))) {
      const label = (await readText(path.join(base, f)))?.trim() ?? ''
      if (/^Package id|^Tctl|^Composite/i.test(label)) {
        pick = path.join(base, f.replace('_label', '_input'))
        break
      }
    }
    if (!pick && files.includes('temp1_input')) pick = path.join(base, 'temp1_input')
    if (isCpu && !found.cpu) found.cpu = pick
    if (isNvme && !found.nvme) found.nvme = pick
  }
  return found
}

async function readStatic(): Promise<HostStatic> {
  const cpuinfo = (await readText('/proc/cpuinfo')) ?? ''
  return {
    hostname: (await readText('/proc/sys/kernel/hostname'))?.trim() || 'localhost',
    cpuModel: cpuinfo.match(/^model name\s*:\s*(.+)$/m)?.[1]?.trim() ?? null,
    threads: cpuinfo.match(/^processor\s*:/gm)?.length ?? 0,
    kernel: (await readText('/proc/sys/kernel/osrelease'))?.trim() || null,
  }
}

/** Peak and mean current clock across all threads, in MHz. */
function cpuClocks(cpuinfo: string): { max: number | null; avg: number | null } {
  const mhz = [...cpuinfo.matchAll(/^cpu MHz\s*:\s*([\d.]+)$/gm)].map(m => Number(m[1])).filter(Number.isFinite)
  if (!mhz.length) return { max: null, avg: null }
  return {
    max: Math.round(Math.max(...mhz)),
    avg: Math.round(mhz.reduce((s, n) => s + n, 0) / mhz.length),
  }
}

async function readGpus(): Promise<GpuSample[]> {
  try {
    const { stdout } = await pexec('nvidia-smi', [
      '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,fan.speed',
      '--format=csv,noheader,nounits',
    ], { timeout: EXEC_TIMEOUT_MS })
    return parseNvidiaSmi(stdout)
  } catch {
    return []
  }
}

async function readMounts(): Promise<MountUsage[]> {
  try {
    const { stdout } = await pexec('df', ['-P', '-x', 'tmpfs', '-x', 'devtmpfs', '-x', 'efivarfs'], { timeout: EXEC_TIMEOUT_MS })
    const seen = new Set<string>()
    const out: MountUsage[] = []
    for (const line of stdout.trim().split('\n').slice(1)) {
      const f = line.trim().split(/\s+/)
      if (f.length < 6) continue
      const [device, total, used] = f
      const mount = f.slice(5).join(' ')
      // One bind/subvol per device is enough — /, /home and /var/log on the
      // same LVM volume are the same bar drawn three times.
      if (seen.has(device)) continue
      seen.add(device)
      out.push({ mount, device, usedBytes: Number(used) * 1024, totalBytes: Number(total) * 1024 })
    }
    return out.sort((a, b) => b.totalBytes - a.totalBytes).slice(0, 4)
  } catch {
    return []
  }
}

/* ── The tick ───────────────────────────────────────────────────────── */

function tick(): Promise<void> {
  // De-duplicate rather than drop: a caller awaiting a tick that is already in
  // flight must wait for it, not sail past on a silent no-op.
  if (inFlight) return inFlight
  inFlight = runTick().finally(() => { inFlight = null })
  return inFlight
}

async function runTick(): Promise<void> {
  try {
    const now = Date.now()
    const elapsedMs = prevAt ? now - prevAt : 0

    const [statRaw, loadRaw, memRaw, netRaw, diskRaw, cpuinfo, upRaw, psiCpuRaw, psiMemRaw, psiIoRaw] = await Promise.all([
      readText('/proc/stat'),
      readText('/proc/loadavg'),
      readText('/proc/meminfo'),
      readText('/proc/net/dev'),
      readText('/proc/diskstats'),
      readText('/proc/cpuinfo'),
      readText('/proc/uptime'),
      readText('/proc/pressure/cpu'),
      readText('/proc/pressure/memory'),
      readText('/proc/pressure/io'),
    ])

    if (tickCount % GPU_EVERY === 0) lastGpus = await readGpus()
    if (tickCount % MOUNTS_EVERY === 0) mounts = await readMounts()
    if (!hwmonPaths) hwmonPaths = await discoverHwmon()
    tickCount++

    uptimeSec = upRaw ? parseUptime(upRaw) : null

    const stat = statRaw ? parseProcStat(statRaw) : null
    const mem = memRaw ? parseMeminfo(memRaw) : null
    const netRows = netRaw ? parseNetDev(netRaw) : []
    const diskRows = diskRaw ? parseDiskstats(diskRaw) : []

    // Network: per-interface rates plus a machine-wide total.
    const netNow = new Map(netRows.map(r => [r.iface, { rx: r.rxBytes, tx: r.txBytes }]))
    let netRxBps = 0
    let netTxBps = 0
    const ifaceRates: NetIface[] = []
    for (const r of netRows) {
      const p = prevNet?.get(r.iface)
      const rxBps = p ? ratePerSec(p.rx, r.rxBytes, elapsedMs) : 0
      const txBps = p ? ratePerSec(p.tx, r.txBytes, elapsedMs) : 0
      netRxBps += rxBps
      netTxBps += txBps
      ifaceRates.push({ iface: r.iface, rxBps, txBps, rxTotalBytes: r.rxBytes, txTotalBytes: r.txBytes })
    }
    interfaces = ifaceRates
      .filter(i => i.rxTotalBytes > 0 || i.txTotalBytes > 0)
      .sort((a, b) => b.rxBps + b.txBps - (a.rxBps + a.txBps) || b.rxTotalBytes - a.rxTotalBytes)
      .slice(0, 4)

    const diskNow = new Map(diskRows.map(r => [r.name, { r: r.readBytes, w: r.writeBytes }]))
    let diskReadBps = 0
    let diskWriteBps = 0
    for (const r of diskRows) {
      const p = prevDisk?.get(r.name)
      if (!p) continue
      diskReadBps += ratePerSec(p.r, r.readBytes, elapsedMs)
      diskWriteBps += ratePerSec(p.w, r.writeBytes, elapsedMs)
    }

    const clocks = cpuClocks(cpuinfo ?? '')
    const cpuTempC = hwmonPaths.cpu ? parseHwmonTemp((await readText(hwmonPaths.cpu)) ?? '') : null
    const nvmeTempC = hwmonPaths.nvme ? parseHwmonTemp((await readText(hwmonPaths.nvme)) ?? '') : null

    // The first tick only establishes baselines — every rate would be zero and
    // would show up on the trace as a fake trough.
    if (stat && prevStat && elapsedMs > 0) {
      buffer.push({
        t: now,
        cpuPct: cpuUsagePct(prevStat.aggregate, stat.aggregate),
        load1: Number.parseFloat(loadRaw?.trim().split(/\s+/)[0] ?? '0') || 0,
        cores: perCoreUsagePct(prevStat.cpus, stat.cpus),
        cpuMhzMax: clocks.max,
        cpuMhzAvg: clocks.avg,
        cpuTempC,
        memUsedKb: mem ? mem.totalKb - mem.availableKb : 0,
        memCachedKb: mem ? mem.cachedKb + mem.buffersKb : 0,
        memTotalKb: mem?.totalKb ?? 0,
        swapUsedKb: mem?.swapUsedKb ?? 0,
        swapTotalKb: mem?.swapTotalKb ?? 0,
        netRxBps,
        netTxBps,
        diskReadBps,
        diskWriteBps,
        gpus: lastGpus,
        psiCpu: psiCpuRaw ? (parsePressure(psiCpuRaw)?.some10 ?? null) : null,
        psiMem: psiMemRaw ? (parsePressure(psiMemRaw)?.some10 ?? null) : null,
        psiIo: psiIoRaw ? (parsePressure(psiIoRaw)?.some10 ?? null) : null,
        procsRunning: stat.procsRunning,
        ctxPerSec: prevCtxt ? Math.round(ratePerSec(prevCtxt, stat.ctxt, elapsedMs)) : 0,
        nvmeTempC,
      })
    }

    if (stat) {
      prevStat = stat
      prevCtxt = stat.ctxt
    }
    prevNet = netNow
    prevDisk = diskNow
    prevAt = now

    if (lastReadAt && now - lastReadAt > IDLE_STOP_MS) stop()
  } catch (err) {
    logger.error('host-metrics', err)
  }
}

function start(): void {
  if (timer) return
  timer = setInterval(() => { void tick() }, TICK_MS)
  // Never hold the process open for a decoration.
  timer.unref?.()
  void tick()
}

function stop(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
  prevAt = 0
  prevStat = null
  prevNet = null
  prevDisk = null
  prevCtxt = 0
}

/* ── Read side ──────────────────────────────────────────────────────── */

async function getHostMetricsFresh(): Promise<HostMetrics> {
  lastReadAt = Date.now()
  if (!staticInfo) staticInfo = await readStatic()
  const cold = !timer
  start()
  if (cold) {
    // The first tick only establishes counter baselines. Settle briefly and
    // take a second one so the first response carries a real sample rather
    // than a frame of zeroes.
    await tick()
    await new Promise(r => setTimeout(r, COLD_SETTLE_MS))
    await tick()
  }

  const cutoff = Date.now() - MAX_AGE_MS
  const samples = buffer.toArray().filter(s => s.t >= cutoff)
  const current = samples.length ? samples[samples.length - 1] : null
  const gpuCount = current?.gpus.length ?? 0

  return {
    generatedAt: new Date().toISOString(),
    sampling: samples.length > 0,
    static: staticInfo,
    current,
    uptimeSec,
    mounts,
    interfaces,
    history: {
      t: samples.map(s => s.t),
      cpu: samples.map(s => s.cpuPct),
      mem: samples.map(s => (s.memTotalKb ? Math.round((s.memUsedKb / s.memTotalKb) * 1000) / 10 : 0)),
      netRx: samples.map(s => Math.round(s.netRxBps)),
      netTx: samples.map(s => Math.round(s.netTxBps)),
      diskRead: samples.map(s => Math.round(s.diskReadBps)),
      diskWrite: samples.map(s => Math.round(s.diskWriteBps)),
      gpu: Array.from({ length: gpuCount }, (_, i) => samples.map(s => s.gpus[i]?.utilPct ?? 0)),
    },
  }
}

export function getHostMetrics(): Promise<HostMetrics> {
  return getCachedCollector('host-metrics', getHostMetricsFresh)
}
