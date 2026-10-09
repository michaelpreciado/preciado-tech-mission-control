// Visual regression snapshot for perf work: proves an optimisation changed cost, not looks.
//
// capture: for every route at desktop / phone / fold-inner, freeze every animation at
//          t=0, then step .mc-main through its full scroll height one viewport at a time,
//          screenshotting each step and recording a layout signature (tag, class, rect)
//          of every rendered element. Stepping matters: content-visibility:auto content
//          only renders near the viewport, so a single screenshot would hide regressions.
// compare: per-step pixel difference (sharp) and per-route geometry difference.
//          Live data (clocks, counts) moves pixels between runs; geometry is the
//          layout-regression signal, pixels are for review.
//
// Usage: node scripts/visual-snapshot.mjs capture <dir> [baseUrl] [--only phone,desktop] [--routes /a,/b]
//        node scripts/visual-snapshot.mjs compare <beforeDir> <afterDir>
import { chromium } from 'playwright'
import sharp from 'sharp'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [mode, dirA, third] = process.argv.slice(2)
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }

const VIEWPORTS = [
  { name: 'desktop', w: 1440, h: 900, touch: false },
  { name: 'phone', w: 390, h: 844, touch: true },
  { name: 'fold-inner', w: 944, h: 978, touch: true },
].filter(v => !flag('--only') || flag('--only').split(',').includes(v.name))
const ROUTES = flag('--routes')?.split(',') ?? [
  '/', '/kanban', '/crew', '/chat', '/calendar', '/github', '/costs', '/projects', '/pipeline',
  '/content-creation', '/memory', '/deliverables', '/bots', '/system', '/setup', '/styleguide', '/login',
]
const MAX_STEPS = 10
const slug = p => (p === '/' ? 'home' : p.slice(1).replace(/\//g, '-'))

async function capture(dir, base) {
  mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=vulkan', '--ignore-gpu-blocklist'] })
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch,
    })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('mc:boot:w2i', 'seen') } catch {} })
    const page = await ctx.newPage()
    for (const route of ROUTES) {
      await page.goto(base + route, { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(1500)
      const steps = await page.evaluate(() => {
        const m = document.querySelector('.mc-main')
        return m ? Math.ceil((m.scrollHeight - m.clientHeight) / m.clientHeight) + 1 : 1
      })
      const geometry = []
      for (let s = 0; s < Math.min(steps, MAX_STEPS); s++) {
        const sig = await page.evaluate(async step => {
          const m = document.querySelector('.mc-main')
          if (m) m.scrollTop = step * m.clientHeight
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
          for (const a of document.getAnimations()) {
            // Scroll-driven animations follow the scroll position and are already deterministic.
            if (a.timeline && !(a.timeline instanceof DocumentTimeline)) continue
            a.pause(); a.currentTime = 0
          }
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
          const out = []
          const root = m ?? document.body
          const top = root.getBoundingClientRect().top - (m?.scrollTop ?? 0)
          for (const el of root.querySelectorAll('*')) {
            const r = el.getBoundingClientRect()
            if (!r.width && !r.height) continue
            // Only what is on screen at this step: off-screen content-visibility subtrees
            // report placeholder geometry by design, which is not what the user sees.
            if (r.bottom <= 0 || r.top >= innerHeight) continue
            // Tag + rect only: CSS-module class hashes differ between bundlers and builds.
            out.push(`${el.tagName}@${Math.round(r.left)},${Math.round(r.top - top)},${Math.round(r.width)}x${Math.round(r.height)}`)
          }
          return out
        }, s)
        if (s === 0) geometry.push(...sig)
        else for (const g of sig) geometry.push(g)
        await page.screenshot({ path: join(dir, `${vp.name}-${slug(route)}-${String(s).padStart(2, '0')}.png`) })
      }
      writeFileSync(join(dir, `${vp.name}-${slug(route)}.geom.json`), JSON.stringify([...new Set(geometry)].sort()))
      process.stdout.write(`${vp.name} ${route} ${Math.min(steps, MAX_STEPS)} steps\n`)
    }
    await ctx.close()
  }
  await browser.close()
}

async function pixelDiff(a, b) {
  const [ia, ib] = await Promise.all([a, b].map(f => sharp(f).raw().toBuffer({ resolveWithObject: true })))
  if (ia.info.width !== ib.info.width || ia.info.height !== ib.info.height) return 100
  let diff = 0
  const px = ia.info.width * ia.info.height, ch = ia.info.channels
  for (let i = 0; i < ia.data.length; i += ch) {
    if (Math.abs(ia.data[i] - ib.data[i]) + Math.abs(ia.data[i + 1] - ib.data[i + 1]) + Math.abs(ia.data[i + 2] - ib.data[i + 2]) > 24) diff++
  }
  return (diff / px) * 100
}

async function compare(a, b) {
  const files = readdirSync(a).filter(f => f.endsWith('.png'))
  const byRoute = new Map()
  for (const f of files) {
    const key = f.replace(/-\d\d\.png$/, '')
    const d = existsSync(join(b, f)) ? await pixelDiff(join(a, f), join(b, f)) : null
    const r = byRoute.get(key) ?? { steps: 0, worst: 0, missing: 0 }
    r.steps++
    if (d == null) r.missing++
    else r.worst = Math.max(r.worst, d)
    byRoute.set(key, r)
  }
  let geomBad = 0
  for (const [key, r] of [...byRoute].sort()) {
    const norm = g => g.replace(/^(\w+)\.[^@]*@/, '$1@')
    const ga = [...new Set(JSON.parse(readFileSync(join(a, `${key}.geom.json`), 'utf8')).map(norm))]
    const gb = existsSync(join(b, `${key}.geom.json`)) ? [...new Set(JSON.parse(readFileSync(join(b, `${key}.geom.json`), 'utf8')).map(norm))] : []
    const sb = new Set(gb), sa = new Set(ga)
    const lost = ga.filter(g => !sb.has(g)).length, gained = gb.filter(g => !sa.has(g)).length
    const geomPct = ((lost + gained) / Math.max(1, ga.length + gb.length)) * 100
    if (geomPct > 2) geomBad++
    console.log(`${key.padEnd(30)} steps ${String(r.steps).padStart(2)}  worst pixel diff ${r.worst.toFixed(2).padStart(6)}%  geometry Δ ${geomPct.toFixed(2).padStart(6)}% (${lost} lost / ${gained} new)${r.missing ? `  missing ${r.missing}` : ''}`)
  }
  console.log(geomBad ? `\n${geomBad} route-viewport(s) with >2% geometry change — review screenshots` : '\nNo layout regression (geometry Δ ≤ 2% everywhere)')
}

if (mode === 'capture') await capture(dirA, third && /^https?:/.test(third) ? third : 'http://127.0.0.1:4176')
else if (mode === 'compare') await compare(dirA, third)
else { console.error('usage: capture <dir> [baseUrl] | compare <before> <after>'); process.exit(2) }
