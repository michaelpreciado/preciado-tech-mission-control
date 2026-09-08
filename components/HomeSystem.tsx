'use client'

import { Dial, useHostMetrics } from './views/RigHud'
import { AsciiMeter } from './ascii-viz'
import { SectionRule } from './ui'
import styles from './HomeWorkspace.module.css'

const rate = (value: number) => value > 1048576 ? `${(value / 1048576).toFixed(1)} MB/s` : `${(value / 1024).toFixed(1)} KB/s`
export function HomeSystem() {
  const { data, error } = useHostMetrics()
  const sample = data?.current
  const memory = sample?.memTotalKb ? sample.memUsedKb / sample.memTotalKb * 100 : 0
  const root = data?.mounts.find(mount => mount.mount === '/') ?? data?.mounts[0]
  const disk = root?.totalBytes ? root.usedBytes / root.totalBytes * 100 : 0
  const gpu = sample?.gpus[0]
  return (
    <section className={styles.section} aria-labelledby="home-system-telemetry">
      <SectionRule label="SYSTEM" index={3} id="home-system-telemetry" post={<span className={styles.live} data-stale={error}>{error ? 'Connection lost' : sample ? '● Live · 2s' : 'Connecting…'}</span>} />
      {error && <p role="status" className={styles.error}>{data ? 'Showing the last received sample while reconnecting.' : 'Telemetry is unavailable. Reconnecting…'}</p>}
      {!sample && !error && <p className={styles.empty}>Waiting for the first hardware sample…</p>}
      {sample && <>
        <div className={styles.machine}><span>{data?.static.hostname}</span><span>{data?.static.cpuModel} · {data?.static.threads} threads</span></div>
        <div className={`${styles.dials} mc-rig-dials`}>
          <div className="asciiviz-telemetry">
          <Dial label="CPU" pct={sample.cpuPct} value={sample.cpuPct.toFixed(0)} unit="%" sub={sample.cpuTempC === null ? 'Processor utilization' : `${sample.cpuTempC.toFixed(0)}°C`} color="var(--pt-info)" />
            <AsciiMeter value={sample.cpuPct / 100} width={12} label="CPU" />
          </div>
          <div className="asciiviz-telemetry">
          <Dial label="MEMORY" pct={memory} value={(sample.memUsedKb / 1048576).toFixed(1)} unit="G" sub={`of ${(sample.memTotalKb / 1048576).toFixed(1)} GB`} color="var(--pt-info)" capacity />
            <AsciiMeter value={sample.memTotalKb > 0 ? memory / 100 : NaN} width={12} label="MEMORY" />
          </div>
          <Dial label="GPU" pct={gpu?.utilPct ?? 0} value={gpu ? gpu.utilPct.toFixed(0) : '—'} unit={gpu ? '%' : ''} sub={gpu?.name ?? 'No GPU reported'} color="var(--pt-info)" />
          <Dial label="DISK" pct={disk} value={root ? disk.toFixed(0) : '—'} unit={root ? '%' : ''} sub={root ? `${((root.totalBytes - root.usedBytes) / 1073741824).toFixed(0)} GB free` : 'No volume reported'} color="var(--pt-info)" capacity />
        </div>
        <div className={styles.vitals}><span>Network ↓ <strong>{rate(sample.netRxBps)}</strong></span><span>Network ↑ <strong>{rate(sample.netTxBps)}</strong></span><span>Processes <strong>{sample.procsRunning}</strong></span></div>
      </>}
    </section>
  )
}
