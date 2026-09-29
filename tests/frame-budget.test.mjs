import test from 'node:test'
import assert from 'node:assert/strict'
import { FrameBudget, rainDpr } from '../lib/frame-budget.ts'

for (const hz of [60, 120, 144]) {
  test(`rain follows ${hz} Hz without changing the simulation step`, () => {
    const budget = new FrameBudget()
    for (let i = 1; i <= 240; i++) { budget.sample(i * 1000 / hz); budget.record(0.5) }
    assert.ok(Math.abs(budget.interval - 1000 / hz) < 0.01)
  })
}
test('uncapped rAF cannot inflate the draw rate beyond 144 Hz', () => {
  const budget = new FrameBudget()
  for (let i = 1; i <= 240; i++) { budget.sample(i); budget.record(0.5) }
  assert.equal(budget.interval, 1000 / 144)
})
test('moving draw p95 downshifts and recovers', () => {
  const budget = new FrameBudget()
  for (let i = 1; i <= 240; i++) { budget.sample(i * 1000 / 120); budget.record(4) }
  assert.ok(budget.interval > 1000 / 60)
  for (let i = 241; i <= 720; i++) { budget.sample(i * 1000 / 120); budget.record(0.5) }
  assert.ok(Math.abs(budget.interval - 1000 / 120) < 0.01)
})
test('rain backing store stays inside desktop and mobile pixel budgets', () => {
  for (const [w, h, dpr, mobile] of [[3840, 2160, 2, false], [884, 832, 2.5, true], [412, 915, 2.625, true]]) {
    const scale = rainDpr(w, h, dpr, mobile)
    assert.ok(w * h * scale * scale <= (mobile ? 750000 : 2100000) + 1)
    assert.ok(scale <= (mobile ? 1 : 1.25))
  }
})
