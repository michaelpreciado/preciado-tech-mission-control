import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

// LaunchFilm.tsx is compiled with the project's own TypeScript and run against a minimal hook runtime and a
// controllable fetch. React's real jsx-runtime builds the element tree, so the assertions read the actual markup.
const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../components/boot/LaunchFilm.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText

function mountLaunchFilm(fetchImpl) {
  const slots = []
  let index = 0, mounted = false, dirty = false, renders = 0, tree = null
  const cleanups = []
  const fetches = []
  const react = {
    useState(init) {
      const i = index++
      if (!(i in slots)) slots[i] = { value: typeof init === 'function' ? init() : init }
      const slot = slots[i]
      return [slot.value, next => {
        const value = typeof next === 'function' ? next(slot.value) : next
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true }
      }]
    },
    useEffect(fn) { if (!mounted) pending.push(fn) },
  }
  const pending = []
  const apiFetch = (path, init) => { fetches.push({ path, signal: init?.signal }); return fetchImpl(path, init) }
  const mod = { exports: {} }
  const load = id => id === 'react' ? react : id === '@/lib/api-base' ? { apiFetch } : require(id)
  vm.runInThisContext(`(function (exports, require, module) {${compiled}\n})`)(mod.exports, load, mod)
  const { LaunchFilm } = mod.exports
  const render = () => { index = 0; renders++; tree = LaunchFilm({}); dirty = false }
  render()
  mounted = true
  for (const fn of pending.splice(0)) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup) }
  return {
    fetches,
    get renders() { return renders },
    get tree() { return tree },
    unmount: () => cleanups.splice(0).forEach(fn => fn()),
    async flush() {
      for (let n = 0; n < 8; n++) { await new Promise(r => setImmediate(r)); if (dirty) render() }
      return tree
    },
  }
}

const walk = (node, visit) => {
  if (node == null || typeof node !== 'object') return
  if (Array.isArray(node)) return node.forEach(n => walk(n, visit))
  visit(node)
  walk(node.props?.children, visit)
}
const text = node => {
  let out = ''
  const add = n => { if (typeof n === 'string' || typeof n === 'number') out += n; else if (Array.isArray(n)) n.forEach(add); else if (n?.props) add(n.props.children) }
  add(node)
  return out
}
const find = (tree, cls) => { const hits = []; walk(tree, n => { if (String(n.props?.className ?? '').split(/\s+/).includes(cls)) hits.push(n) }); return hits }
const stats = tree => find(tree, 'launch-stat').map(s => text(s.props.children[0]))
const meta = tree => text(find(tree, 'launch-meta')[0].props.children)

const json = (body, { ok = true, status = 200 } = {}) => () => Promise.resolve({ ok, status, json: () => Promise.resolve(body) })
const daily = n => Array.from({ length: n }, (_, i) => ({ cost: (i + 1) / 10 }))
const payload = extra => ({ crew: [{}, {}, {}], kanban: { openTasks: 7 }, costs: { meteredCostUsd: 12.345, daily: daily(30) }, ...extra })

test('film is data-state=loading until the request completes, then ready with a real chart', async () => {
  let release
  const gate = new Promise(r => { release = r })
  const film = mountLaunchFilm(() => gate.then(() => ({ ok: true, status: 200, json: () => Promise.resolve(payload()) })))
  assert.equal(film.tree.props['data-state'], 'loading')
  assert.equal(find(film.tree, 'launch-chart').length, 0)
  assert.equal((await film.flush()).props['data-state'], 'loading', 'still loading while the request is pending')
  release()
  const tree = await film.flush()
  assert.equal(tree.props['data-state'], 'ready')
  assert.deepEqual(stats(tree), ['3', '7', '$12.35'])
  assert.equal(meta(tree), 'MC-072 · LAUNCH FILM · LIVE DATA')
  assert.equal(find(tree, 'launch-chart').length, 1)
  assert.equal(film.fetches[0].path, '/api/mission-control')
})

test('successful response with fewer than 2 daily points is ready with no chart and unchanged stats', async () => {
  for (const series of [[], [{ cost: 1 }]]) {
    const film = mountLaunchFilm(json(payload({ costs: { meteredCostUsd: 2, daily: series } })))
    const tree = await film.flush()
    assert.equal(tree.props['data-state'], 'ready')
    assert.deepEqual(stats(tree), ['3', '7', '$2.00'])
    assert.equal(find(tree, 'launch-chart').length, 0)
  }
})

test('successful null response is ready (not loading forever) and shows the existing zero/em-dash fallbacks', async () => {
  const film = mountLaunchFilm(json(null))
  const tree = await film.flush()
  assert.equal(tree.props['data-state'], 'ready')
  assert.deepEqual(stats(tree), ['0', '0', '—'])
  assert.equal(meta(tree), 'MC-072 · LAUNCH FILM · LIVE DATA')
  assert.equal(find(tree, 'launch-chart').length, 0)
})

test('HTTP error is data-state=failed with em dashes and LOCAL BUS', async () => {
  const film = mountLaunchFilm(json({ error: 'nope' }, { ok: false, status: 500 }))
  const tree = await film.flush()
  assert.equal(tree.props['data-state'], 'failed')
  assert.deepEqual(stats(tree), ['—', '—', '—'])
  assert.equal(meta(tree), 'MC-072 · LAUNCH FILM · LOCAL BUS')
  assert.equal(find(tree, 'launch-chart').length, 0)
})

test('network error and unparsable body are failed', async () => {
  for (const impl of [() => Promise.reject(new TypeError('network')), () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('bad json')) })]) {
    const tree = await mountLaunchFilm(impl).flush()
    assert.equal(tree.props['data-state'], 'failed')
    assert.deepEqual(stats(tree), ['—', '—', '—'])
  }
})

test('unmount aborts the request and a late response or abort error changes nothing', async () => {
  let resolve, reject
  const late = mountLaunchFilm(() => new Promise(r => { resolve = r }))
  late.unmount()
  assert.equal(late.fetches[0].signal.aborted, true)
  const rendersBefore = late.renders
  resolve({ ok: true, status: 200, json: () => Promise.resolve(payload()) })
  await late.flush()
  assert.equal(late.renders, rendersBefore, 'no state update after abort')
  assert.equal(late.tree.props['data-state'], 'loading')

  const aborted = mountLaunchFilm(() => new Promise((_, r) => { reject = r }))
  aborted.unmount()
  reject(new DOMException('aborted', 'AbortError'))
  await aborted.flush()
  assert.equal(aborted.renders, 1)
  assert.equal(aborted.tree.props['data-state'], 'loading', 'an abort must not be reported as a failed request')
})
