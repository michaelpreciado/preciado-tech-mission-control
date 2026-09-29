import test from 'node:test'
import assert from 'node:assert/strict'
import { startMotionVisibility, MOTION_WIDGET_SELECTOR } from '../lib/motion-visibility.ts'

function el(name, { widget = false, children = [] } = {}) {
  const node = {
    name, nodeType: 1, widget, children, isConnected: true, attrs: {},
    matches: sel => { assert.equal(sel, MOTION_WIDGET_SELECTOR); return node.widget },
    querySelectorAll: sel => {
      assert.equal(sel, MOTION_WIDGET_SELECTOR)
      const out = []
      const walk = n => { for (const c of n.children) { if (c.widget) out.push(c); walk(c) } }
      walk(node)
      return out
    },
    setAttribute: (k, v) => { node.attrs[k] = v },
    removeAttribute: k => { delete node.attrs[k] },
  }
  return node
}
const text = () => ({ nodeType: 3 })

function harness(body = el('body')) {
  const state = { io: null, mo: null, listeners: new Map(), hidden: false }
  class IO {
    constructor(cb) { this.cb = cb; this.observed = new Set(); this.observeCalls = []; this.disconnected = false; state.io = this }
    observe(n) { this.observed.add(n); this.observeCalls.push(n) }
    unobserve(n) { this.observed.delete(n) }
    disconnect() { this.disconnected = true; this.observed.clear() }
  }
  class MO {
    constructor(cb) { this.cb = cb; this.disconnected = false; this.opts = null; state.mo = this }
    observe(target, opts) { this.target = target; this.opts = opts }
    disconnect() { this.disconnected = true }
  }
  const doc = {
    get hidden() { return state.hidden },
    addEventListener: (t, fn) => state.listeners.set(t, fn),
    removeEventListener: (t, fn) => { if (state.listeners.get(t) === fn) state.listeners.delete(t) },
  }
  const root = { dataset: {} }
  const stop = startMotionVisibility({ root, body, doc, IO, MO })
  return { state, root, body, stop }
}
const mutate = (h, { added = [], removed = [] }) => h.state.mo.cb([{ addedNodes: added, removedNodes: removed }])

test('widgets already on the page are observed exactly once', () => {
  const inner = el('inner', { widget: true })
  const outer = el('outer', { widget: true, children: [inner] })
  const h = harness(el('body', { children: [outer, el('plain')] }))
  assert.deepEqual(h.state.io.observeCalls, [outer, inner])
  assert.equal(h.state.mo.target, h.body)
  assert.deepEqual(h.state.mo.opts, { childList: true, subtree: true })
})

test('intersection entries toggle data-motion-visible', () => {
  const w = el('w', { widget: true })
  const h = harness(el('body', { children: [w] }))
  h.state.io.cb([{ target: w, isIntersecting: false }])
  assert.equal(w.attrs['data-motion-visible'], 'false')
  h.state.io.cb([{ target: w, isIntersecting: true }])
  assert.equal(w.attrs['data-motion-visible'], 'true')
})

test('later-mounted widgets, including nested ones, are observed once', () => {
  const h = harness()
  const nested = el('nested', { widget: true })
  const wrapper = el('wrapper', { children: [el('mid', { children: [nested] })] })
  const direct = el('direct', { widget: true })
  h.body.children.push(wrapper, direct)
  mutate(h, { added: [wrapper, direct, text()] })
  mutate(h, { added: [direct, wrapper] })
  assert.deepEqual(h.state.io.observeCalls, [nested, direct])
})

test('removed widgets are unobserved, moved ones stay watched', () => {
  const a = el('a', { widget: true })
  const b = el('b', { widget: true })
  const h = harness(el('body', { children: [a, b] }))
  a.isConnected = false
  mutate(h, { removed: [a] })
  assert.deepEqual([...h.state.io.observed], [b])
  const moved = el('moved', { widget: true })
  h.body.children.push(moved)
  mutate(h, { added: [moved] })
  mutate(h, { removed: [moved], added: [moved] })
  assert.ok(h.state.io.observed.has(moved))
  assert.equal(h.state.io.observeCalls.filter(n => n === moved).length, 1)
})

test('removed widgets can be observed again when remounted', () => {
  const w = el('w', { widget: true })
  const h = harness(el('body', { children: [w] }))
  w.isConnected = false
  mutate(h, { removed: [w] })
  w.isConnected = true
  mutate(h, { added: [w] })
  assert.equal(h.state.io.observeCalls.filter(n => n === w).length, 2)
  assert.ok(h.state.io.observed.has(w))
})

test('text-only and add-only mutations do not sweep watched widgets', () => {
  const w = el('w', { widget: true })
  const h = harness(el('body', { children: [w] }))
  w.isConnected = false
  mutate(h, { added: [text()], removed: [text()] })
  assert.ok(h.state.io.observed.has(w), 'sweep must wait for a removed Element')
  mutate(h, { added: [el('x')] })
  assert.ok(h.state.io.observed.has(w))
  mutate(h, { removed: [el('gone')] })
  assert.ok(!h.state.io.observed.has(w))
})

test('visibilitychange mirrors document.hidden into data-page-hidden', () => {
  const h = harness()
  assert.equal(h.root.dataset.pageHidden, 'false')
  h.state.hidden = true
  h.state.listeners.get('visibilitychange')()
  assert.equal(h.root.dataset.pageHidden, 'true')
  h.state.hidden = false
  h.state.listeners.get('visibilitychange')()
  assert.equal(h.root.dataset.pageHidden, 'false')
})

test('cleanup disconnects both observers, removes the listener and clears attributes', () => {
  const w = el('w', { widget: true })
  const h = harness(el('body', { children: [w] }))
  h.state.io.cb([{ target: w, isIntersecting: false }])
  h.stop()
  assert.ok(h.state.io.disconnected)
  assert.ok(h.state.mo.disconnected)
  assert.equal(h.state.listeners.size, 0)
  assert.ok(!('pageHidden' in h.root.dataset))
  assert.ok(!('data-motion-visible' in w.attrs))
})

test('restart after cleanup (StrictMode) re-observes without leaking the old listener', () => {
  const w = el('w', { widget: true })
  const body = el('body', { children: [w] })
  const first = harness(body)
  first.stop()
  const second = harness(body)
  assert.deepEqual(second.state.io.observeCalls, [w])
  assert.equal(first.state.listeners.size, 0)
})
