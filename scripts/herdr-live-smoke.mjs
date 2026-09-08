// Explicitly invoked smoke test for a disposable, already-started agent only.
import assert from 'node:assert/strict'
import { herdr } from '../lib/herdr-bridge.ts'

const target = process.argv[2]
const snap = await herdr.snapshot()
const agent = snap.agents.find(a => a.id === target)
assert.ok(agent?.name.startsWith('mc-deck-smoke'), 'Refusing to control a non-smoke agent')
const first = await herdr.tail(target, 80)
assert.equal(typeof first.text, 'string')
await herdr.operate({ op: 'rename', target, name: 'mc-deck-smoke-verified' })
await herdr.operate({ op: 'prompt', target, text: 'Reply exactly HERDR_DECK_SMOKE_OK. Do not run tools or edit files.' })
await new Promise(resolve => setTimeout(resolve, 5000))
const tail = await herdr.tail(target, 80)
const report = {
  target, roster: true, tailReadable: true, rename: true, promptSubmitted: true,
  smokeTextVisible: tail.text.includes('HERDR_DECK_SMOKE_OK'),
  usageLimitVisible: /usage limit|limit reached|out of.*credits/i.test(tail.text),
}
await herdr.operate({ op: 'stop', target })
report.interruptSent = true
console.log(JSON.stringify(report))
