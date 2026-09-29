import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../public/v4-scroll.js', import.meta.url), 'utf8')

function makeNode(name, { children = [], matchesSel = () => false } = {}) {
  const classes = new Set()
  const node = {
    name, nodeType: 1, children, style: { transform: '', removeProperty(k) { if (k === 'transform') node.style.transform = '' } },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    matches: sel => matchesSel(sel),
    querySelectorAll: sel => (sel === '.v4-seen' ? children.filter(c => c.classList.contains('v4-seen')) : children),
    listeners: new Map(),
    addEventListener(type, fn) { node.listeners.set(type, fn) },
    removeEventListener(type, fn) { if (node.listeners.get(type) === fn) node.listeners.delete(type) },
  }
  return node
}

// Runs public/v4-scroll.js in a browser that lacks native scroll/view timelines (the fallback path).
function boot({ motion = 'full', osReduce = false, mobile = false } = {}) {
  const entry = makeNode('entry')
  const sweep = makeNode('sweep')
  const main = makeNode('main', { children: [entry] })
  main.querySelector = sel => (sel === '.v4-scanline' ? sweep : null)
  const st = { ios: [], mos: [], frames: [], cancelled: [], win: new Map(), media: new Map() }
  class IO {
    constructor(cb) { this.cb = cb; this.observed = new Set(); this.disconnected = false; st.ios.push(this) }
    observe(n) { this.observed.add(n) }
    unobserve(n) { this.observed.delete(n) }
    disconnect() { this.disconnected = true; this.observed.clear() }
  }
  class MO {
    constructor(cb) { this.cb = cb; this.disconnected = false; this.target = null; st.mos.push(this) }
    observe(t) { this.target = t }
    disconnect() { this.disconnected = true }
  }
  const html = { dataset: { motion } }
  const matchMedia = q => {
    const mq = {
      get matches() { return /max-width:\s*820px/.test(q) ? mobile : /prefers-reduced-motion:\s*reduce/.test(q) ? osReduce : false },
      listeners: [],
      addEventListener(_t, fn) { mq.listeners.push(fn) },
      removeEventListener(_t, fn) { mq.listeners = mq.listeners.filter(f => f !== fn) },
    }
    st.media.set(q, mq)
    return mq
  }
  let frameId = 0
  const ctx = {
    CSS: { supports: () => false },
    document: { documentElement: html, querySelector: sel => (sel === '.mc-main' ? main : null) },
    window: { innerHeight: 800, IntersectionObserver: IO, addEventListener: (t, fn) => st.win.set(t, fn), removeEventListener: (t, fn) => { if (st.win.get(t) === fn) st.win.delete(t) } },
    IntersectionObserver: IO, MutationObserver: MO, Element: Object, matchMedia,
    requestAnimationFrame: fn => { st.frames.push(fn); return ++frameId },
    cancelAnimationFrame: id => st.cancelled.push(id),
  }
  ctx.Element = class {}
  Object.setPrototypeOf(main, ctx.Element.prototype)
  Object.setPrototypeOf(entry, ctx.Element.prototype)
  vm.runInNewContext(source, ctx)
  const liveIO = () => st.ios.filter(io => !io.disconnected)
  const setMotion = value => { html.dataset.motion = value; st.mos.find(m => m.target === html).cb([]) }
  const setOsReduce = value => { osReduce = value; for (const fn of st.media.get('(prefers-reduced-motion: reduce)')?.listeners ?? []) fn() }
  return { main, sweep, entry, st, html, liveIO, setMotion, setOsReduce, flush: () => { const f = st.frames.splice(0); f.forEach(fn => fn()) } }
}

test('full motion: fallback observes entries and drives the scroll sweep', () => {
  const b = boot()
  assert.equal(b.liveIO().length, 1)
  assert.ok(b.main.listeners.has('scroll'))
  b.main.scrollTop = 130
  b.flush()
  assert.equal(b.sweep.style.transform, 'translateY(130px)')
})

for (const [name, opts] of [
  ['data-motion=off', { motion: 'off' }],
  ['data-motion=reduced', { motion: 'reduced' }],
  ['OS prefers-reduced-motion', { osReduce: true }],
]) {
  test(`${name}: fallback starts no observer, scroll listener or sweep transform`, () => {
    const b = boot(opts)
    assert.equal(b.liveIO().length, 0, 'no live IntersectionObserver')
    assert.equal(b.st.mos.filter(m => m.target === b.main && !m.disconnected).length, 0, 'no live child-list MutationObserver')
    assert.equal(b.main.listeners.has('scroll'), false)
    assert.equal(b.sweep.style.transform, '')
    assert.equal(b.entry.classList.contains('v4-seen'), false)
  })
}

test('full -> reduced tears everything down and clears fallback state', () => {
  const b = boot()
  b.entry.classList.add('v4-seen')
  b.main.scrollTop = 40
  b.flush()
  assert.equal(b.sweep.style.transform, 'translateY(40px)')
  b.setMotion('reduced')
  assert.equal(b.liveIO().length, 0)
  assert.equal(b.main.listeners.has('scroll'), false)
  assert.equal(b.st.win.has('resize'), false)
  assert.equal(b.sweep.style.transform, '')
  assert.equal(b.entry.classList.contains('v4-seen'), false)
})

test('OS reduce toggling at runtime stops and restarts the fallback', () => {
  const b = boot()
  assert.equal(b.liveIO().length, 1)
  b.setOsReduce(true)
  assert.equal(b.liveIO().length, 0)
  assert.equal(b.main.listeners.has('scroll'), false)
  assert.equal(b.sweep.style.transform, '')
  b.setOsReduce(false)
  assert.equal(b.liveIO().length, 1)
  assert.ok(b.main.listeners.has('scroll'))
})

test('reduced -> full restarts the fallback', () => {
  const b = boot({ motion: 'reduced' })
  assert.equal(b.liveIO().length, 0)
  b.setMotion('full')
  assert.equal(b.liveIO().length, 1)
  assert.ok(b.main.listeners.has('scroll'))
})
