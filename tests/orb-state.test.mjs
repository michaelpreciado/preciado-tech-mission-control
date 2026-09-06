import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveOrbState, orbLoadIntensity } from '../lib/orb-state.ts'

const NOW = 1_700_000_000_000

function sample(over = {}) {
  return {
    t: NOW,
    cpuPct: 10,
    load1: 1,
    cores: [10, 10, 10, 10],
    cpuMhzMax: null,
    cpuMhzAvg: null,
    cpuTempC: 40,
    memUsedKb: 0,
    memCachedKb: 0,
    memTotalKb: 0,
    swapUsedKb: 0,
    swapTotalKb: 0,
    netRxBps: 0,
    netTxBps: 0,
    diskReadBps: 0,
    diskWriteBps: 0,
    gpus: [],
    psiCpu: null,
    psiMem: null,
    psiIo: null,
    procsRunning: 0,
    ctxPerSec: 0,
    nvmeTempC: null,
    ...over,
  }
}

const idleActivity = { lastEventAt: null, runningTaskCount: 0, now: NOW }

test('null telemetry sample derives idle even when activity exists', () => {
  assert.equal(deriveOrbState(null, { lastEventAt: NOW, runningTaskCount: 2, now: NOW }), 'idle')
})

test('quiet telemetry below 30 percent derives idle', () => {
  assert.equal(deriveOrbState(sample(), idleActivity), 'idle')
})

test('a running task or SSE event in the last 20 seconds derives active', () => {
  assert.equal(deriveOrbState(sample(), { ...idleActivity, runningTaskCount: 1 }), 'active')
  assert.equal(deriveOrbState(sample(), { ...idleActivity, lastEventAt: NOW - 20_000 }), 'active')
  assert.equal(deriveOrbState(sample(), { ...idleActivity, lastEventAt: NOW - 20_001 }), 'idle')
})

test('CPU, normalized load, and GPU utilization independently derive surge', () => {
  assert.equal(deriveOrbState(sample({ cpuPct: 70.01 }), idleActivity), 'surge')
  assert.equal(deriveOrbState(sample({ load1: 3.01 }), idleActivity), 'surge')
  assert.equal(deriveOrbState(sample({ gpus: [{ index: 0, name: 'GPU', utilPct: 71, memUsedMb: 0, memTotalMb: 1, tempC: 40, powerW: null, fanPct: null }] }), idleActivity), 'surge')
})

test('CPU 80 C and GPU 85 C enter hot, which outranks surge and activity', () => {
  assert.equal(deriveOrbState(sample({ cpuPct: 99, cpuTempC: 80 }), { ...idleActivity, runningTaskCount: 1 }), 'hot')
  assert.equal(deriveOrbState(sample({ gpus: [{ index: 0, name: 'GPU', utilPct: 0, memUsedMb: 0, memTotalMb: 1, tempC: 85, powerW: null, fanPct: null }] }), idleActivity), 'hot')
})

test('hot holds inside the 75/80 C thermal dead band', () => {
  assert.equal(deriveOrbState(sample({ cpuTempC: 76 }), { ...idleActivity, previousState: 'hot', coolBelowSince: NOW - 10_000 }), 'hot')
  assert.equal(deriveOrbState(sample({ gpus: [{ index: 0, name: 'GPU', utilPct: 0, memUsedMb: 0, memTotalMb: 1, tempC: 80, powerW: null, fanPct: null }] }), { ...idleActivity, previousState: 'hot', coolBelowSince: NOW - 10_000 }), 'hot')
})

test('hot cool-down requires three continuous seconds below 75/80 C', () => {
  const cool = sample({ cpuTempC: 74, gpus: [{ index: 0, name: 'GPU', utilPct: 0, memUsedMb: 0, memTotalMb: 1, tempC: 79, powerW: null, fanPct: null }] })
  assert.equal(deriveOrbState(cool, { ...idleActivity, previousState: 'hot', coolBelowSince: NOW - 2_999 }), 'hot')
  assert.equal(deriveOrbState(cool, { ...idleActivity, previousState: 'hot', coolBelowSince: NOW - 3_000 }), 'idle')
})

test('surge intensity normalizes CPU, load, and GPU signals', () => {
  assert.equal(orbLoadIntensity(sample({ cpuPct: 82 })), 0.82)
  assert.equal(orbLoadIntensity(sample({ load1: 4 })), 1)
})
