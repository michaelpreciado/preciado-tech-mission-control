#!/usr/bin/env node
// Lane G pass-2 audit: 14 routes x {1440x900 desk, 412x915 phone}.
// Emits live-audit entries (pass: 2) + .mc-widget census (total/visible) per route/width,
// and saves full-page screenshots for the contact sheets.
// Usage: node scripts/audit-pass2-census.mjs [baseUrl] [outJson] [shotDir]
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4176'
const OUT = process.argv[3] ?? 'artifacts/2026-11-09/live-audit-pass2.json'
const SHOTS = process.argv[4] ?? 'artifacts/2026-11-09/pass2-shots'
mkdirSync(OUT.split('/')[0], { recursive: true })
mkdirSync(SHOTS, { recursive: true })

const ROUTES = ['/', '/kanban', '/chat', '/calendar', '/github', '/costs', '/system', '/local-ai', '/memory', '/setup', '/pipeline', '/crew', '/deliverables', '/bots']
const VIEWPORTS = { desk: [1440, 900], phone: [412, 915] }

const browser = await chromium.launch()
const rows = []
for (const [route, slug] of ROUTES.map(r => [r, r === '/' ? 'home' : r.slice(1)])) {
  for (const [vp, [W, H]] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H, deviceScaleFactor: 1 } })
    const page = await ctx.newPage()
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(1800)
    const r = await page.evaluate(() => {
      const body = document.body
      const win = [...document.querySelectorAll('.mc-window')]
      const widgets = [...document.querySelectorAll('.mc-widget')]
      const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 1 && b.height > 1 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none' && getComputedStyle(el).opacity !== '0' }
      const shadow = [...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e).boxShadow; return s && s !== 'none' }).length
      const blur = [...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); return (s.backdropFilter || s.webkitBackdropFilter || '').includes('blur') }).length
      const grad = [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).backgroundImage.includes('gradient')).length
      const emoji = (body.innerText.match(/\p{Extended_Pictographic}/gu) || []).length
      const mono = [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).fontFamily.includes('mono')).length
      const head = (document.querySelector('h1,h2') || {}).innerText || ''
      const main = document.querySelector('.mc-main') || body
      return {
        bodyBg: getComputedStyle(body).backgroundColor,
        cards: win.length,
        widgets_total: widgets.length,
        widgets_visible: widgets.filter(vis).length,
        shadow, blur, grad, emoji, mono,
        head: head.trim().slice(0, 60),
        scrollW: main.scrollWidth, clientW: main.clientWidth,
        docScroll: body.scrollWidth, docClient: body.clientWidth,
      }
    })
    const overflow = r.scrollW > r.clientW || r.docScroll > r.docClient
    rows.push({ pass: 2, route, vp, width: W, ...r, ovf: overflow })
    await page.screenshot({ path: `${SHOTS}/${slug}-${W}.png`, fullPage: false })
    await ctx.close()
    console.log(`${overflow ? '✗' : '✓'} ${route.padEnd(14)} ${W}  main ${r.scrollW}/${r.clientW}  widgets ${r.widgets_visible}/${r.widgets_total}  cards ${r.cards}  shadow ${r.shadow} blur ${r.blur} grad ${r.grad} emoji ${r.emoji}`)
  }
}
await browser.close()
writeFileSync(OUT, JSON.stringify(rows, null, 2))
const bad = rows.filter(r => r.ovf)
console.log(`\nTOTAL pages=${rows.length} overflow=${bad.length}`)
if (bad.length) console.log(bad.map(r => `${r.route} @${r.width}`).join('\n'))
