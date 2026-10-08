// Focused trace: navigate to a route and name the longest main-thread tasks.
// Usage: node scripts/trace-route.mjs /costs [--vp phone|desktop]
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const route = process.argv[2] ?? '/costs'
const BASE = 'http://127.0.0.1:4176'
const VP = process.argv.includes('--vp') ? process.argv[process.argv.indexOf('--vp') + 1] : 'phone'
const vp = VP === 'desktop' ? { w: 1440, h: 900, touch: false } : { w: 390, h: 844, touch: true }

const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=vulkan', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({
  viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.touch ? 2.625 : 1,
  hasTouch: vp.touch, isMobile: vp.touch,
})
await ctx.addInitScript(() => {
  window.__perfLong = []
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perfLong.push({ dur: Math.round(e.duration), path: location.pathname, start: Math.round(e.startTime) }) })
      .observe({ type: 'longtask', buffered: true })
  } catch {}
})
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {})
await page.waitForTimeout(2000)
if (vp.touch) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.invalidationTracking', 'toplevel', 'blink', 'v8'] })
await page.evaluate(p => window.next.router.push(p), route)
await page.waitForFunction(p => location.pathname === p, route, { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(2500)
const buf = await browser.stopTracing()
writeFileSync(`/home/mp/.hermes/profiles/jarvis/cache/scratch/mc-overnight/trace${route.replace(/\//g, '-')}-${VP}.json`, buf)

const events = JSON.parse(buf.toString()).traceEvents
const names = new Map()
for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name)
const mainTids = new Set()
for (const e of events) if (e.ph === 'M' && e.name === 'process_name' && e.args.name === 'Renderer') mainTids.add(e.pid)

// Longest RunTask slices on the renderer main thread, plus what ran inside them.
const tasks = events.filter(e => e.ph === 'X' && e.dur && names.get(`${e.pid}:${e.tid}`) === 'CrRendererMain'
  && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && mainTids.has(e.pid))
  .map(e => ({ ts: e.ts / 1000, dur: e.dur / 1000, tid: e.tid, pid: e.pid }))
  .sort((a, b) => b.dur - a.dur).slice(0, 5)

console.log(`\nroute ${route} @ ${VP} — top main-thread tasks:`)
for (const t of tasks) {
  console.log(`\n  ${t.dur.toFixed(1)} ms  (t=${t.ts.toFixed(0)})`)
  const inner = events.filter(e => e.ph === 'X' && e.dur && e.pid === t.pid && e.tid === t.tid
    && e.ts / 1000 >= t.ts && e.ts / 1000 < t.ts + t.dur && e.name !== 'RunTask' && e.name !== 'ThreadControllerImpl::RunTask')
    .map(e => ({ name: e.name, dur: e.dur / 1000, cat: e.cat }))
    .sort((a, b) => b.dur - a.dur).slice(0, 8)
  for (const i of inner) console.log(`      ${i.dur.toFixed(1).padStart(7)} ms  ${i.name}`)
}

console.log('\n  longtask observer:', JSON.stringify(await page.evaluate(() => window.__perfLong)))

// Invalidation tracking: what told Blink to recalc style.
const inval = events.filter(e => /InvalidationTracking|StyleRecalcInvalidationTracking|InvalidateStyle/.test(e.name))
const byReason = new Map()
for (const e of inval) {
  const reason = e.args?.data?.reason ?? e.args?.data?.changedProperty ?? e.name
  const node = e.args?.data?.nodeName ?? ''
  const key = `${reason}${node ? ' · ' + node : ''}`
  byReason.set(key, (byReason.get(key) ?? 0) + 1)
}
console.log('\n  style invalidation reasons (top 15):')
for (const [k, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`      ${String(n).padStart(5)}  ${k}`)

await browser.close()
