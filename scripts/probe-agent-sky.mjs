// Agent-activity sky probe: the numbers behind "the graph is back in the first fold".
//
// For each viewport it loads Home and records, without trusting a screenshot:
//   - firstFold: the panel's top edge vs. the viewport height (top < innerHeight)
//   - svg: whether the real strand <svg> exists in the panel AND is rendered
//     (non-zero box, not display:none) — U1 shipped an SVG that phones never saw
//   - nodes: DOM nodes inside the panel (the perf budget for the animated SVG)
//   - overflow: page-level horizontal scroll on .mc-main and <html>
// and writes a viewport screenshot plus a panel screenshot.
//
// Usage: node scripts/probe-agent-sky.mjs [baseUrl] [outDir]
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4176'
const OUT = process.argv[3] ?? 'screenshots/agent-sky'
fs.mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  ['desktop', 1440, 1000, false],
  ['phone-390', 390, 844, true],
  ['phone-360', 360, 800, true],
  ['phone-414', 414, 896, true],
  ['phone-430', 430, 932, true],
]

const browser = await chromium.launch()
const results = {}
for (const [name, W, H, touch] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(1600)
  const r = await page.evaluate(() => {
    const panel = document.querySelector('[aria-labelledby="home-agents"]')
    const main = document.querySelector('.mc-main')
    const doc = document.documentElement
    const out = { panel: !!panel }
    if (panel) {
      const top = panel.getBoundingClientRect().top
      out.firstFold = { top: Math.round(top), innerHeight: window.innerHeight, pass: top < window.innerHeight }
      const svg = panel.querySelector('svg[role="img"]')
      const b = svg?.getBoundingClientRect()
      out.svg = svg
        ? { present: true, rendered: !!b && b.width > 0 && b.height > 0 && getComputedStyle(svg).display !== 'none', width: Math.round(b.width), height: Math.round(b.height), label: svg.getAttribute('aria-label') }
        : { present: false, rendered: false }
      out.nodes = panel.querySelectorAll('*').length
      out.svgNodes = svg ? svg.querySelectorAll('*').length : 0
      const scroller = svg?.closest('[data-sky-scroll]')
      out.scroller = scroller ? { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth, scrollLeft: Math.round(scroller.scrollLeft), snap: getComputedStyle(scroller).scrollSnapType } : null
    }
    out.overflow = {
      main: main ? { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, pass: main.scrollWidth <= main.clientWidth } : null,
      doc: { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, pass: doc.scrollWidth <= doc.clientWidth },
    }
    return out
  })
  const shot = path.join(OUT, `home-${name}-${W}x${H}.png`)
  await page.screenshot({ path: shot })
  const panelShot = path.join(OUT, `panel-${name}-${W}x${H}.png`)
  const panel = await page.$('[aria-labelledby="home-agents"]')
  if (panel) await panel.screenshot({ path: panelShot }).catch(() => {})
  results[`${name} ${W}x${H}`] = { ...r, shot, panelShot: panel ? panelShot : null }
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(results, null, 2))
