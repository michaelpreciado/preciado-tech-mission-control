import test from 'node:test'
import assert from 'node:assert/strict'
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
} from '../lib/collectors/host-parsers.ts'

/* ── /proc/stat ─────────────────────────────────────────────────────── */

const STAT_A = `cpu  1000 0 500 8000 100 0 0 0 0 0
cpu0 500 0 250 4000 50 0 0 0 0 0
cpu1 500 0 250 4000 50 0 0 0 0 0
intr 123 4 5
ctxt 768695921
btime 1750000000
processes 1039945
procs_running 11
procs_blocked 2
softirq 9 8 7`

// Aggregate gains 200 busy + 800 idle => 20% busy over the window.
const STAT_B = `cpu  1100 0 600 8700 200 0 0 0 0 0
cpu0 600 0 350 4700 50 0 0 0 0 0
cpu1 500 0 250 4000 150 0 0 0 0 0
intr 200 4 5
ctxt 768700000
btime 1750000000
processes 1040000
procs_running 3
procs_blocked 0
softirq 9 8 7`

test('parseProcStat reads aggregate, per-core, ctxt and proc counts', () => {
  const s = parseProcStat(STAT_A)
  assert.equal(s.cpus.length, 2)
  // total = sum of every field; idle = idle + iowait
  assert.equal(s.aggregate.total, 9600)
  assert.equal(s.aggregate.idle, 8100)
  assert.equal(s.cpus[0].total, 4800)
  assert.equal(s.cpus[0].idle, 4050)
  assert.equal(s.ctxt, 768695921)
  assert.equal(s.procsRunning, 11)
  assert.equal(s.procsBlocked, 2)
})

test('parseProcStat tolerates a truncated cpu line and missing counters', () => {
  const s = parseProcStat('cpu  10 0 5\ncpu0 10 0 5\n')
  assert.equal(s.aggregate.total, 15)
  assert.equal(s.aggregate.idle, 0)
  assert.equal(s.ctxt, 0)
  assert.equal(s.procsRunning, 0)
})

test('parseProcStat returns empty state for garbage input', () => {
  const s = parseProcStat('not a proc file at all')
  assert.equal(s.cpus.length, 0)
  assert.equal(s.aggregate.total, 0)
})

test('cpuUsagePct computes busy percentage across two samples', () => {
  const a = parseProcStat(STAT_A).aggregate
  const b = parseProcStat(STAT_B).aggregate
  // delta total 1000, delta idle 800 => 20% busy
  assert.equal(cpuUsagePct(a, b), 20)
})

test('cpuUsagePct returns 0 when the counters did not move', () => {
  const a = parseProcStat(STAT_A).aggregate
  assert.equal(cpuUsagePct(a, a), 0)
})

test('cpuUsagePct clamps a counter reset to 0 rather than going negative', () => {
  const a = parseProcStat(STAT_B).aggregate
  const b = parseProcStat(STAT_A).aggregate
  assert.equal(cpuUsagePct(a, b), 0)
})

test('perCoreUsagePct returns one clamped percentage per thread', () => {
  const a = parseProcStat(STAT_A)
  const b = parseProcStat(STAT_B)
  const pcts = perCoreUsagePct(a.cpus, b.cpus)
  // core0: delta total 900, delta idle 700 => 22.2%
  // core1: delta total 100, delta idle 100 => 0%
  assert.equal(pcts.length, 2)
  assert.ok(Math.abs(pcts[0] - 22.2) < 0.1, `expected ~22.2, got ${pcts[0]}`)
  assert.equal(pcts[1], 0)
})

test('perCoreUsagePct drops cores that vanish between samples', () => {
  const a = parseProcStat(STAT_A)
  const b = parseProcStat('cpu  1100 0 600 8700 200 0 0 0 0 0\ncpu0 600 0 350 4700 50 0 0 0 0 0\n')
  assert.equal(perCoreUsagePct(a.cpus, b.cpus).length, 1)
})

/* ── /proc/meminfo ──────────────────────────────────────────────────── */

const MEMINFO = `MemTotal:       49214572 kB
MemFree:         2000000 kB
MemAvailable:   26800000 kB
Buffers:          500000 kB
Cached:         20000000 kB
SwapCached:            0 kB
SwapTotal:      49214460 kB
SwapFree:       49214460 kB
Shmem:           1000000 kB`

test('parseMeminfo pulls the full memory breakdown', () => {
  const m = parseMeminfo(MEMINFO)
  assert.equal(m.totalKb, 49214572)
  assert.equal(m.availableKb, 26800000)
  assert.equal(m.freeKb, 2000000)
  assert.equal(m.buffersKb, 500000)
  assert.equal(m.cachedKb, 20000000)
  assert.equal(m.swapTotalKb, 49214460)
  assert.equal(m.swapUsedKb, 0)
})

test('parseMeminfo returns null when MemTotal is absent', () => {
  assert.equal(parseMeminfo('Buffers: 100 kB'), null)
})

/* ── /proc/net/dev ──────────────────────────────────────────────────── */

const NETDEV = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 75133835  103253    0    0    0     0          0         0 75133835  103253    0    0    0     0       0          0
enp5s0: 143299299  124728    0   12    0     0          0      3054 18335096   63893    0    0    0     0       0          0
tailscale0: 97196809   43494    0    0    0     0          0         0  3504212   32148    0    0    0     0       0          0`

test('parseNetDev reads rx/tx byte counters and skips loopback', () => {
  const rows = parseNetDev(NETDEV)
  assert.deepEqual(rows.map(r => r.iface), ['enp5s0', 'tailscale0'])
  assert.equal(rows[0].rxBytes, 143299299)
  assert.equal(rows[0].txBytes, 18335096)
  assert.equal(rows[1].rxBytes, 97196809)
  assert.equal(rows[1].txBytes, 3504212)
})

test('parseNetDev handles an interface name flush against the colon', () => {
  const rows = parseNetDev('face |bytes\nwlp6s0:1 2 0 0 0 0 0 0 3 4 0 0 0 0 0 0')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].iface, 'wlp6s0')
  assert.equal(rows[0].rxBytes, 1)
  assert.equal(rows[0].txBytes, 3)
})

/* ── /proc/diskstats ────────────────────────────────────────────────── */

const DISKSTATS = `   8       0 sda 209 0 7795 157 3 0 128 0 0 114 157 0 0 0 0 3 0
   8       1 sda1 62 0 3744 57 0 0 0 0 0 55 57 0 0 0 0 0 0
 259       0 nvme0n1 1000 0 20000 500 800 0 40000 300 0 700 800 0 0 0 0 0 0
 259       1 nvme0n1p1 10 0 200 5 8 0 400 3 0 7 8 0 0 0 0 0 0
 254       0 zram0 5 0 10 1 5 0 10 1 0 1 1 0 0 0 0 0 0`

test('parseDiskstats keeps whole devices and drops partitions, zram and loop', () => {
  const rows = parseDiskstats(DISKSTATS)
  assert.deepEqual(rows.map(r => r.name), ['sda', 'nvme0n1'])
  // sectors are 512 bytes
  assert.equal(rows[1].readBytes, 20000 * 512)
  assert.equal(rows[1].writeBytes, 40000 * 512)
})

test('parseDiskstats ignores short lines', () => {
  assert.equal(parseDiskstats('8 0 sda 1 2\n').length, 0)
})

/* ── /proc/pressure/* ───────────────────────────────────────────────── */

test('parsePressure reads the some/full avg10 stall percentages', () => {
  const p = parsePressure('some avg10=1.25 avg60=0.40 avg300=0.03 total=38168172\nfull avg10=0.50 avg60=0.10 avg300=0.00 total=0')
  assert.equal(p.some10, 1.25)
  assert.equal(p.some60, 0.4)
  assert.equal(p.full10, 0.5)
})

test('parsePressure handles a cpu file that has no full line', () => {
  const p = parsePressure('some avg10=0.00 avg60=0.00 avg300=0.03 total=38168172')
  assert.equal(p.some10, 0)
  assert.equal(p.full10, 0)
})

test('parsePressure returns null for unreadable input', () => {
  assert.equal(parsePressure(''), null)
})

/* ── /proc/uptime ───────────────────────────────────────────────────── */

test('parseUptime reads seconds since boot', () => {
  assert.equal(parseUptime('3830.62 54035.25\n'), 3830.62)
  assert.equal(parseUptime('garbage'), null)
})

/* ── nvidia-smi ─────────────────────────────────────────────────────── */

const SMI = `0, NVIDIA GeForce RTX 5070 Ti, 12, 15282, 16303, 57, 120.45, 41
1, NVIDIA GeForce RTX 3060 Ti, 0, 4979, 8192, 45, 22.10, 0`

test('parseNvidiaSmi reads every card including power and fan', () => {
  const gpus = parseNvidiaSmi(SMI)
  assert.equal(gpus.length, 2)
  assert.equal(gpus[0].index, 0)
  assert.equal(gpus[0].name, 'RTX 5070 Ti')
  assert.equal(gpus[0].utilPct, 12)
  assert.equal(gpus[0].memUsedMb, 15282)
  assert.equal(gpus[0].memTotalMb, 16303)
  assert.equal(gpus[0].tempC, 57)
  assert.equal(gpus[0].powerW, 120.45)
  assert.equal(gpus[0].fanPct, 41)
  assert.equal(gpus[1].name, 'RTX 3060 Ti')
})

test('parseNvidiaSmi turns [N/A] fields into null without dropping the card', () => {
  const gpus = parseNvidiaSmi('0, NVIDIA GeForce RTX 5070 Ti, 12, 15282, 16303, 57, [N/A], [N/A]')
  assert.equal(gpus.length, 1)
  assert.equal(gpus[0].powerW, null)
  assert.equal(gpus[0].fanPct, null)
  assert.equal(gpus[0].tempC, 57)
})

test('parseNvidiaSmi returns an empty list when nvidia-smi printed nothing', () => {
  assert.deepEqual(parseNvidiaSmi('\n\n'), [])
})

/* ── hwmon ──────────────────────────────────────────────────────────── */

test('parseHwmonTemp converts millidegrees to celsius', () => {
  assert.equal(parseHwmonTemp('47850\n'), 47.9) // rounded to 0.1°C
  assert.equal(parseHwmonTemp('bogus'), null)
})

/* ── rates ──────────────────────────────────────────────────────────── */

test('ratePerSec divides the counter delta by the elapsed window', () => {
  assert.equal(ratePerSec(1000, 3000, 2000), 1000)
})

test('ratePerSec returns 0 on a counter reset or a zero-length window', () => {
  assert.equal(ratePerSec(3000, 1000, 2000), 0)
  assert.equal(ratePerSec(1000, 3000, 0), 0)
})

/* ── ring buffer ────────────────────────────────────────────────────── */

test('RingBuffer keeps the newest entries in order once it wraps', () => {
  const rb = new RingBuffer(3)
  rb.push('a'); rb.push('b')
  assert.deepEqual(rb.toArray(), ['a', 'b'])
  assert.equal(rb.length, 2)
  rb.push('c'); rb.push('d'); rb.push('e')
  assert.deepEqual(rb.toArray(), ['c', 'd', 'e'])
  assert.equal(rb.length, 3)
})

test('RingBuffer exposes the most recent entry and clears', () => {
  const rb = new RingBuffer(2)
  assert.equal(rb.last(), null)
  rb.push(1); rb.push(2); rb.push(3)
  assert.equal(rb.last(), 3)
  rb.clear()
  assert.deepEqual(rb.toArray(), [])
  assert.equal(rb.last(), null)
})
