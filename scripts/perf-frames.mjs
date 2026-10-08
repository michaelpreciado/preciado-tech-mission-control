// Frame-timing harness: measures what a frame actually costs, per viewport.
//
// For each viewport it runs three scenarios and records a Chrome trace for each:
//   idle   — 3s of ambient animation on Home, nothing touched
//   scroll — synthesized touch (coarse) or wheel (fine) scroll gestures on long routes
//   nav    — client-side navigation through every route
//
// Two kinds of number come out of each run:
//   rAF delta  — the cadence frames were actually produced at. Reports the observed
//                display interval and how many vsyncs were missed.
//   stage cost — from the trace, the busy time per vsync interval on each pipeline
//                thread (renderer main, compositor, viz, GPU). Stages run in parallel,
//                so a frame fits the budget when its busiest stage does. This is the
//                frame-budget headroom number: it holds whatever the panel's Hz.
//
// Plus point probes: longest main-thread task, CLS, live backdrop-filters, running
// animations, DOM size, WebGL contexts, and rAF callbacks while the tab is hidden.
//
// Runs headless on the real GPU (--use-angle=vulkan). Headless rAF is fixed at 60Hz,
// so 120fps readiness is argued from stage cost vs the 8.33ms budget, never from
// the rAF cadence.
//
// Usage: node scripts/perf-frames.mjs [baseUrl] [--out file.json] [--only phone,desktop]
//                                     [--cpu N]   (main-thread throttle on touch viewports, default 4)
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt }
const BASE = args.find(a => /^https?:/.test(a)) ?? 'http://127.0.0.1:4176'
const OUT = flag('--out', null)
const ONLY = flag('--only', null)?.split(',')
const CPU = Number(flag('--cpu', 4))
const TRACE_DIR = flag('--trace-dir', null)
const LEAK_CYCLES = Number(flag('--leak', 3))  // full 17-route sweeps per viewport

const VIEWPORTS = [
  { name: 'desktop', w: 1440, h: 900, touch: false },
  { name: 'phone', w: 390, h: 844, touch: true },
  { name: 'fold-cover', w: 386, h: 866, touch: true },
  { name: 'fold-inner', w: 944, h: 978, touch: true },
  { name: 'fold-inner-wide', w: 1038, h: 1076, touch: true },
].filter(v => !ONLY || ONLY.includes(v.name))

export const ROUTES = [
  '/', '/kanban', '/crew', '/chat', '/calendar', '/github', '/costs', '/projects', '/pipeline',
  '/content-creation', '/memory', '/deliverables', '/bots', '/system', '/setup', '/styleguide', '/login',
]
const SCROLL_ROUTES = ['/', '/costs', '/kanban', '/system']
const TRACE_CATS = [
  'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'toplevel', 'viz', 'gpu', 'cc', 'blink', 'loading',
]

const pct = (xs, p) => xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] : 0
const stats = xs => { const s = [...xs].sort((a, b) => a - b); return { n: s.length, p50: pct(s, 0.5), p95: pct(s, 0.95), worst: s.at(-1) ?? 0 } }
const r2 = n => Math.round(n * 100) / 100

/* Per-thread busy time per vsync window, from top-level task slices. */
function analyzeTrace(buf, intervalMs) {
  const events = JSON.parse(buf.toString()).traceEvents ?? JSON.parse(buf.toString())
  const names = new Map()
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name)
  const rendererPids = new Set(events.filter(e => e.ph === 'M' && e.name === 'process_name' && e.args.name === 'Renderer').map(e => e.pid))
  const STAGES = { CrRendererMain: 'main', Compositor: 'compositor', VizCompositorThread: 'viz', CrGpuMain: 'gpu' }
  const slices = { main: [], compositor: [], viz: [], gpu: [] }
  let t0 = Infinity, t1 = 0
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur) continue
    const thread = names.get(`${e.pid}:${e.tid}`)
    const stage = STAGES[thread]
    if (!stage) continue
    if ((stage === 'main' || stage === 'compositor') && !rendererPids.has(e.pid)) continue
    if (e.name !== 'ThreadControllerImpl::RunTask' && e.name !== 'RunTask') continue
    slices[stage].push([e.ts / 1000, (e.ts + e.dur) / 1000])
    t0 = Math.min(t0, e.ts / 1000); t1 = Math.max(t1, (e.ts + e.dur) / 1000)
  }
  if (!isFinite(t0)) return null
  const bins = Math.ceil((t1 - t0) / intervalMs)
  const out = {}
  const busyPerBin = {}
  // RunTask slices nest (a task can run a nested task); merge to the outermost
  // intervals so busy time is never double-counted.
  for (const stage of Object.keys(slices)) {
    const merged = []
    for (const [s, e] of slices[stage].sort((a, b) => a[0] - b[0])) {
      const last = merged.at(-1)
      if (last && s <= last[1]) last[1] = Math.max(last[1], e)
      else merged.push([s, e])
    }
    slices[stage] = merged
  }
  for (const [stage, list] of Object.entries(slices)) {
    const b = new Float64Array(bins)
    for (const [s, e] of list) {
      for (let i = Math.floor((s - t0) / intervalMs); i < bins && t0 + i * intervalMs < e; i++) {
        const lo = Math.max(s, t0 + i * intervalMs), hi = Math.min(e, t0 + (i + 1) * intervalMs)
        if (hi > lo) b[i] += hi - lo
      }
    }
    busyPerBin[stage] = b
    out[stage] = stats(Array.from(b))
  }
  const critical = Array.from({ length: bins }, (_, i) => Math.max(...Object.values(busyPerBin).map(b => b[i])))
  out.critical = stats(critical)
  out.over8 = critical.filter(x => x > 8.33).length
  out.bins = bins
  out.longestMainTask = Math.max(0, ...slices.main.map(([s, e]) => e - s))
  return out
}

const rafSample = (page, frames) => page.evaluate(n => new Promise(res => {
  const raf = window.__perfRaf ?? requestAnimationFrame
  const d = []; let last = 0
  const f = t => { if (last) d.push(t - last); last = t; if (d.length < n) raf(f); else res(d) }
  raf(f)
}), frames)

/* App rAF callbacks requested per second while nothing is happening. A live loop shows ~60. */
const appRafPerSec = page => page.evaluate(() => new Promise(res => {
  const start = window.__perfRafCalls
  setTimeout(() => res(window.__perfRafCalls - start), 1000)
}))

async function domCounters(cdp) {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {})
  const c = await cdp.send('Memory.getDOMCounters')
  return { documents: c.documents, nodes: c.nodes, listeners: c.jsEventListeners }
}

const rafStats = (deltas) => {
  const s = stats(deltas)
  const interval = s.p50
  return { ...s, interval, missed: deltas.filter(d => d > interval * 1.5).length }
}

async function probe(page) {
  return page.evaluate(() => {
    let blur = 0
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      const bf = cs.backdropFilter || cs.webkitBackdropFilter
      if (bf && bf !== 'none' && el.getClientRects().length) blur++
    }
    const anims = document.getAnimations().filter(a => a.playState === 'running')
    return {
      dom: document.querySelectorAll('*').length,
      backdrop: blur,
      animations: anims.length,
      webgl: window.__perfWebGL?.live ?? 0,
      webglCreated: window.__perfWebGL?.created ?? 0,
      cls: Math.round((window.__perfCLS ?? 0) * 1000) / 1000,
    }
  })
}

async function traced(browser, page, fn, label) {
  await browser.startTracing(page, { categories: TRACE_CATS })
  const extra = await fn()
  const buf = await browser.stopTracing()
  if (TRACE_DIR && label) writeFileSync(`${TRACE_DIR}/${label}.json`, buf)
  return { buf, extra }
}

async function navigate(page, path) {
  // App Router client navigation, same path a sidebar <Link> takes.
  const ok = await page.evaluate(p => { const r = window.next?.router; if (!r) return false; r.push(p); return true }, path)
  if (!ok) await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(p => location.pathname === p, path, { timeout: 15000 }).catch(() => {})
}

async function scrollTarget(page) {
  // Scroll whichever container has the most room: .mc-main on most routes, an inner
  // pane on board-style routes that pin the shell and scroll a column.
  const box = await page.evaluate(() => {
    let best = document.querySelector('.mc-main'), room = best.scrollHeight - best.clientHeight
    for (const el of best.querySelectorAll('*')) {
      const r = el.scrollHeight - el.clientHeight
      if (r > room && el.clientHeight > 120 && /auto|scroll/.test(getComputedStyle(el).overflowY)) { best = el; room = r }
    }
    const b = best.getBoundingClientRect()
    const x = Math.max(b.left + 8, Math.min(innerWidth - 8, b.left + b.width / 2))
    const y = Math.max(b.top + 8, Math.min(innerHeight - 90, b.top + Math.min(b.height, innerHeight - b.top) / 2))
    return { x, y, room }
  })
  return box
}

// Two gestures (down, back up). The target is found before tracing starts so
// the measurement never includes the harness's own DOM walk.
async function scrollMain(cdp, box, touch) {
  if (box.room < 50) return box.room
  const dist = Math.min(box.room, 1600)
  for (const dir of [-1, 1]) {
    await cdp.send('Input.synthesizeScrollGesture', {
      x: Math.round(box.x), y: Math.round(box.y), yDistance: dir * dist, speed: 1600,
      gestureSourceType: touch ? 'touch' : 'mouse', repeatCount: 0,
    })
  }
  return box.room
}

const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=vulkan', '--ignore-gpu-blocklist'] })
const results = { base: BASE, at: new Date().toISOString(), cpuThrottleTouch: CPU, viewports: {} }

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.touch ? 2.625 : 1,
    hasTouch: vp.touch, isMobile: vp.touch,
  })
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('mc:boot:w2i', 'seen') } catch {}
    // Count the app's rAF calls; the harness samples through the raw function.
    const raw = window.requestAnimationFrame.bind(window)
    window.__perfRaf = raw
    window.__perfRafCalls = 0
    window.requestAnimationFrame = cb => { window.__perfRafCalls++; return raw(cb) }
    window.__perfCLS = 0
    try {
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perfCLS += e.value })
        .observe({ type: 'layout-shift', buffered: true })
    } catch {}
    window.__perfLong = []
    try {
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perfLong.push({ dur: Math.round(e.duration), path: location.pathname }) })
        .observe({ type: 'longtask', buffered: true })
    } catch {}
    const g = window.__perfWebGL = { created: 0, live: 0 }
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const c = orig.call(this, type, ...rest)
      if (c && /webgl/.test(type) && !this.__perfCounted) {
        this.__perfCounted = true; g.created++; g.live++
        this.addEventListener('webglcontextlost', () => { g.live-- })
      }
      return c
    }
  })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  const res = { touch: vp.touch, size: `${vp.w}×${vp.h}` }
  console.log(`\n── ${vp.name} · ${vp.w}×${vp.h}${vp.touch ? ' · touch · cpu×' + CPU : ''} ──`)

  await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2500)
  if (vp.touch && CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })

  // idle
  {
    const { buf, extra } = await traced(browser, page, () => rafSample(page, 180), `${vp.name}-idle`)
    const raf = rafStats(extra)
    res.idle = { raf, stage: analyzeTrace(buf, raf.interval), probe: await probe(page) }
  }
  // scroll
  {
    const deltas = []; const stageRuns = []; let longest = 0
    for (const path of SCROLL_ROUTES) {
      await navigate(page, path); await page.waitForTimeout(2500)
      const target = await scrollTarget(page), room = target.room
      const { buf } = await traced(browser, page, () => scrollMain(cdp, target, vp.touch), `${vp.name}-scroll${path.replace(/\//g, '-')}`)
      const stage = analyzeTrace(buf, 16.67)
      if (stage) { stageRuns.push({ path, room, ...stage }); longest = Math.max(longest, stage.longestMainTask) }
    }
    // A clean rAF cadence during scroll, sampled on the longest route.
    await navigate(page, '/costs'); await page.waitForTimeout(2000)
    const target = await scrollTarget(page)
    const [d] = await Promise.all([rafSample(page, 150), scrollMain(cdp, target, vp.touch)])
    deltas.push(...d)
    res.scroll = {
      raf: rafStats(deltas),
      routes: stageRuns.map(r => ({ path: r.path, room: r.room, critical: r.critical, main: r.main, compositor: r.compositor, gpu: r.gpu, viz: r.viz, over8: r.over8, bins: r.bins, longestMainTask: r2(r.longestMainTask) })),
      longestMainTask: r2(longest),
      criticalWorstP95: Math.max(...stageRuns.map(r => r.critical.p95)),
      probe: await probe(page),
    }
  }
  // nav
  {
    await navigate(page, '/'); await page.waitForTimeout(1500)
    await page.evaluate(() => { window.__perfLong = [] })
    const { buf, extra } = await traced(browser, page, async () => {
      const deltas = []
      for (const path of ROUTES.filter(p => p !== '/login')) {
        const [d] = await Promise.all([rafSample(page, 45), navigate(page, path)])
        deltas.push(...d)
      }
      return deltas
    }, `${vp.name}-nav`)
    const raf = rafStats(extra)
    const long = await page.evaluate(() => window.__perfLong)
    const byPath = {}
    for (const t of long) byPath[t.path] = Math.max(byPath[t.path] ?? 0, t.dur)
    res.nav = { raf, stage: analyzeTrace(buf, 16.67), longTasks: byPath, probe: await probe(page) }
  }
  // leak: sweep every route repeatedly; listeners, nodes, documents and WebGL
  // contexts must return to the same level each time we land back on Home.
  if (LEAK_CYCLES > 0) {
    const cycles = []
    for (let c = 0; c < LEAK_CYCLES; c++) {
      for (const path of ROUTES.filter(p => p !== '/login')) { await navigate(page, path); await page.waitForTimeout(250) }
      await navigate(page, '/'); await page.waitForTimeout(1500)
      cycles.push({ ...(await domCounters(cdp)), webgl: (await probe(page)).webgl, rafPerSec: await appRafPerSec(page) })
    }
    res.leak = cycles
  }
  res.idleRafPerSec = await appRafPerSec(page)
  // hidden: rAF callbacks while the page reports hidden
  {
    await navigate(page, '/'); await page.waitForTimeout(800)
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => {})
    await page.evaluate(() => {
      window.__hiddenFrames = 0
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(300)
    const hidden = await page.evaluate(() => ({
      pageHidden: document.documentElement.dataset.pageHidden,
      runningAnimations: document.getAnimations().filter(a => a.playState === 'running').length,
    }))
    await page.evaluate(() => {
      delete document.visibilityState; delete document.hidden
      document.dispatchEvent(new Event('visibilitychange'))
    })
    res.hidden = hidden
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {})
  results.viewports[vp.name] = res

  const f = s => `${r2(s.p50)}/${r2(s.p95)}/${r2(s.worst)}`
  console.log(`  idle    rAF ${f(res.idle.raf)} ms (interval ${r2(res.idle.raf.interval)}, missed ${res.idle.raf.missed})  stage ${res.idle.stage ? f(res.idle.stage.critical) : '-'}  main ${res.idle.stage ? f(res.idle.stage.main) : '-'}`)
  console.log(`  scroll  rAF ${f(res.scroll.raf)} ms (missed ${res.scroll.raf.missed}/${res.scroll.raf.n})  stage-p95 worst route ${r2(res.scroll.criticalWorstP95)}  longest task ${res.scroll.longestMainTask}`)
  for (const r of res.scroll.routes) console.log(`    ${r.path.padEnd(8)} room ${String(r.room).padStart(5)}  crit ${f(r.critical)}  main ${f(r.main)}  comp ${f(r.compositor)}  viz ${f(r.viz)}  gpu ${f(r.gpu)}  >8.3ms ${r.over8}/${r.bins}`)
  console.log(`  nav     rAF ${f(res.nav.raf)} ms (missed ${res.nav.raf.missed})  longest task ${res.nav.stage ? r2(res.nav.stage.longestMainTask) : '-'}`)
  console.log(`          long tasks >50ms by route: ${Object.entries(res.nav.longTasks).map(([p, d]) => `${p} ${d}`).join(', ') || 'none'}`)
  console.log(`  probe   home: dom ${res.idle.probe.dom} backdrop ${res.idle.probe.backdrop} anims ${res.idle.probe.animations} cls ${res.idle.probe.cls}  ·  after nav: webgl live ${res.nav.probe.webgl} created ${res.nav.probe.webglCreated}`)
  if (res.leak) console.log(`  leak    per sweep → home: ${res.leak.map(c => `nodes ${c.nodes} listeners ${c.listeners} docs ${c.documents} gl ${c.webgl} rAF/s ${c.rafPerSec}`).join('  |  ')}`)
  console.log(`  hidden  data-page-hidden=${res.hidden.pageHidden} running animations ${res.hidden.runningAnimations}`)
  await ctx.close()
}

await browser.close()
if (OUT) { writeFileSync(OUT, JSON.stringify(results, null, 2)); console.log(`\nwrote ${OUT}`) }
