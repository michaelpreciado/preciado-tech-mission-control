/**
 * Telemetry collector — real machine stats for the SYSTEM CORE strip.
 *
 * Reads live host metrics (CPU load, RAM, disk, per-GPU util/VRAM/temp) plus
 * Ollama's loaded-model state. Every read is best-effort; a missing source
 * yields null rather than failing the whole dashboard.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import { getConfig } from '../config'
import type { SystemTelemetry } from '../types'

const pexec = promisify(execFile)

async function cpuLoad(): Promise<{ load1: number; load5: number; load15: number; cores: number } | null> {
  try {
    const raw = (await fs.readFile('/proc/loadavg', 'utf8')).trim().split(/\s+/)
    const cores = Number((await fs.readFile('/proc/cpuinfo', 'utf8')).match(/^processor\s*:/gm)?.length ?? 1)
    return { load1: Number(raw[0]), load5: Number(raw[1]), load15: Number(raw[2]), cores }
  } catch { return null }
}

async function memInfo(): Promise<{ totalKb: number; availableKb: number } | null> {
  try {
    const raw = await fs.readFile('/proc/meminfo', 'utf8')
    const get = (k: string) => Number(raw.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm'))?.[1] ?? 0)
    return { totalKb: get('MemTotal'), availableKb: get('MemAvailable') }
  } catch { return null }
}

async function diskInfo(): Promise<{ usedBytes: number; totalBytes: number } | null> {
  try {
    const { stdout } = await pexec('df', ['-P', '/'])
    const [, total, used] = stdout.trim().split('\n')[1].split(/\s+/)
    return { usedBytes: Number(used) * 1024, totalBytes: Number(total) * 1024 }
  } catch { return null }
}

type GpuRow = { index: number; name: string; utilPct: number; memUsedMb: number; memTotalMb: number; tempC: number }

async function gpus(): Promise<GpuRow[] | null> {
  try {
    const { stdout } = await pexec('nvidia-smi', [
      '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu',
      '--format=csv,noheader,nounits',
    ])
    return stdout.trim().split('\n').filter(Boolean).map(line => {
      const [i, name, util, used, total, temp] = line.split(',').map(s => s.trim())
      return { index: Number(i), name, utilPct: Number(util), memUsedMb: Number(used), memTotalMb: Number(total), tempC: Number(temp) }
    })
  } catch { return null }
}

async function ollamaModels(): Promise<{ name: string; sizeGb: number; vramGb: number }[] | null> {
  try {
    const base = getConfig().services.ollamaUrl.replace(/\/api\/version\/?$/, '').replace(/\/$/, '')
    const res = await fetch(`${base}/api/ps`, { cache: 'no-store', signal: AbortSignal.timeout(1500) })
    if (!res.ok) return null
    const data = await res.json() as { models?: { name?: string; size?: number; size_vram?: number }[] }
    return (data.models ?? []).map(m => ({
      name: m.name || 'model',
      sizeGb: Math.round((m.size ?? 0) / 1024 ** 3),
      vramGb: Math.round((m.size_vram ?? 0) / 1024 ** 3),
    }))
  } catch { return null }
}

export async function collectTelemetry(): Promise<SystemTelemetry> {
  const [cpu, mem, disk, gpuList, models] = await Promise.all([
    cpuLoad(), memInfo(), diskInfo(), gpus(), ollamaModels(),
  ])
  return {
    generatedAt: new Date().toISOString(),
    cpu,
    memory: mem,
    disk,
    gpus: gpuList,
    ollama: models,
  }
}
