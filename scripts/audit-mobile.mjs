// Mobile overflow audit: loads every tab at phone width and asserts the main
// pane does not scroll horizontally.
//
// Overflow lands on .mc-main, not <html> — .mc-shell is height:100dvh/overflow:hidden,
// so document.scrollWidth stays clean even when content spills. Check the pane.
//
// Usage: node scripts/audit-mobile.mjs [baseUrl] [width] [height]
//   With no width/height it sweeps the default viewport set below, which
//   includes both foldable postures — a foldable changes viewport without a
//   reload, so both sides of every breakpoint have to stay clean.
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4176'
const ARGW = process.argv[3] ? Number(process.argv[3]) : null
const ARGH = process.argv[4] ? Number(process.argv[4]) : null

// Fold inner is listed at both plausible CSS widths because the reported value
// depends on the DPR the browser picks, and 980px is a breakpoint boundary.
const VIEWPORTS = ARGW
  ? [['custom', ARGW, ARGH ?? 812]]
  : [
      ['phone', 375, 812],
      ['fold-cover', 386, 866],
      ['fold-inner', 944, 978],
      ['fold-inner-wide', 1038, 1076],
    ]

const TABS = [
  ['deck', '/'], ['approvals', '/approvals'], ['tasks', '/tasks'],
  ['calendar', '/calendar'], ['chat', '/chat'], ['github', '/github'],
  ['costs', '/costs'], ['projects', '/projects'], ['pipeline', '/pipeline'],
  ['ml-content', '/ml-content'], ['memory', '/memory'], ['team', '/team'],
  ['setup', '/setup'],
]

const browser = await chromium.launch()

let failures = 0
for (const [vpName, W, H] of VIEWPORTS) {
// hasTouch matters: the CRT animation and the cockpit backdrop-blur are gated
// on (pointer: coarse), so auditing without it would test the desktop paths.
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
console.log(`\n── ${vpName} · ${W}×${H} ──`)
for (const [name, path] of TABS) {
  const errors = []
  page.removeAllListeners('console')
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(1200)

  const r = await page.evaluate(() => {
    const main = document.querySelector('.mc-main')
    const doc = document.documentElement
    const over = []
    if (main) {
      const limit = main.clientWidth + 1
      for (const el of main.querySelectorAll('*')) {
        const b = el.getBoundingClientRect()
        if (b.width === 0) continue
        // Ignore children of deliberately x-scrollable containers.
        let p = el.parentElement, scrollable = false
        while (p && p !== main) {
          if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX)) { scrollable = true; break }
          p = p.parentElement
        }
        if (scrollable) continue
        if (b.right > main.getBoundingClientRect().left + limit) {
          over.push(`${el.className || el.tagName}`.slice(0, 60))
        }
      }
    }
    return {
      mainScroll: main ? main.scrollWidth : 0,
      mainClient: main ? main.clientWidth : 0,
      docScroll: doc.scrollWidth,
      docClient: doc.clientWidth,
      over: [...new Set(over)].slice(0, 5),
    }
  })

  const bad = r.mainScroll > r.mainClient || r.docScroll > r.docClient
  if (bad || errors.length) failures++
  console.log(
    `${bad ? '✗' : '✓'} ${name.padEnd(11)} main ${r.mainScroll}/${r.mainClient}` +
    `  doc ${r.docScroll}/${r.docClient}` +
    (r.over.length ? `\n    overflowing: ${r.over.join(' | ')}` : '') +
    (errors.length ? `\n    console: ${errors.slice(0, 2).join(' | ').slice(0, 160)}` : ''),
  )
}
await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} tab(s) with problems` : '\nAll tabs clean')
process.exit(failures ? 1 : 0)
