// Mobile matrix audit: every route × every target phone width, four checks per page.
//
//   overflow — .mc-main or <html> scrolls horizontally (children of deliberate
//              x-scrollers are ignored, same rule as audit-mobile.mjs)
//   tap      — visible interactive controls under 44×44 CSS px, and adjacent pairs
//              (same row, overlapping vertically) closer than 8px
//   nav      — after scrolling .mc-main to the bottom, the last content element is
//              hidden behind the fixed bottom tab bar
//   type     — visible text rendered below the 12px legibility floor
//
// Inline links inside running prose are exempt from the tap check (WCAG 2.5.8
// inline exception); so are controls a parent clips to zero.
//
// Usage: node scripts/audit-mobile-matrix.mjs [baseUrl] [--only 390] [--routes /,/costs] [--json out.json]
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
const BASE = args.find(a => /^https?:/.test(a)) ?? 'http://127.0.0.1:4176'

const WIDTHS = [[360, 800], [390, 844], [414, 896], [430, 932]]
  .filter(([w]) => !flag('--only') || flag('--only').split(',').map(Number).includes(w))
const ROUTES = flag('--routes')?.split(',') ?? [
  '/', '/kanban', '/chat', '/projects', '/content-creation', '/calendar', '/github', '/costs',
  '/system', '/local-ai', '/memory', '/setup', '/pipeline', '/crew', '/deliverables', '/bots',
  '/styleguide', '/login',
]

const browser = await chromium.launch()
const rows = []
for (const [W, H] of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('mc:boot:w2i', 'seen') } catch {} })
  const page = await ctx.newPage()
  console.log(`\n── ${W}×${H} ──`)
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(900)
    const r = await page.evaluate(() => {
      const main = document.querySelector('.mc-main') ?? document.body
      const doc = document.documentElement
      const vw = window.innerWidth, vh = window.innerHeight
      const visible = el => {
        const s = getComputedStyle(el)
        if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false
        const b = el.getBoundingClientRect()
        return b.width > 0 && b.height > 0
      }
      const inXScroller = el => {
        for (let p = el.parentElement; p && p !== main; p = p.parentElement) {
          if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX)) return true
        }
        return false
      }

      // overflow
      const over = []
      const limit = main.getBoundingClientRect().left + main.clientWidth + 1
      for (const el of main.querySelectorAll('*')) {
        const b = el.getBoundingClientRect()
        if (!b.width || inXScroller(el)) continue
        if (b.right > limit) over.push(String(el.className?.baseVal ?? el.className ?? el.tagName).slice(0, 50) || el.tagName)
      }

      // tap targets (whole document: the tab bar and header count too)
      const ctrls = [...document.querySelectorAll('a[href], button, [role="button"], [role="tab"], input:not([type=hidden]), select, textarea, summary')]
        .filter(el => visible(el) && !el.closest('[aria-hidden="true"], [inert]'))
        .filter(el => { const b = el.getBoundingClientRect(); return b.bottom > 0 && b.top < vh && b.right > 0 && b.left < vw })
        // Content scrolled under the opaque fixed tab bar is occluded, not adjacent to it.
        .filter(el => { const bar = document.querySelector('[data-mobile-nav]'); if (!bar || bar.contains(el)) return true; const top = bar.getBoundingClientRect().top; return top >= vh || el.getBoundingClientRect().bottom <= top + 0.5 })
        .filter(el => {
          if (el.tagName !== 'A') return true
          const p = el.parentElement
          return !(p && /^(P|LI|SPAN|TD)$/.test(p.tagName) && (p.textContent || '').trim().length > (el.textContent || '').trim().length + 20)
        })
      const label = el => `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`
      const small = []
      for (const el of ctrls) {
        const b = el.getBoundingClientRect()
        if (b.width < 44 - 0.5 || b.height < 44 - 0.5) small.push(`${label(el)} ${Math.round(b.width)}×${Math.round(b.height)}`)
      }
      const tight = []
      const boxes = ctrls.map(el => [el, el.getBoundingClientRect()])
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const [a, A] = boxes[i], [b, B] = boxes[j]
        if (a.contains(b) || b.contains(a)) continue
        const vOverlap = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top)
        const hOverlap = Math.min(A.right, B.right) - Math.max(A.left, B.left)
        let gap = null
        if (vOverlap > 4) gap = Math.max(B.left - A.right, A.left - B.right)
        else if (hOverlap > 4) gap = Math.max(B.top - A.bottom, A.top - B.bottom)
        if (gap !== null && gap >= -0.5 && gap < 8 - 0.5) tight.push(`${label(a)} ↔ ${label(b)} ${Math.round(gap)}px`)
      }

      // type floor
      const tiny = new Map()
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue
        const el = n.parentElement
        if (!el || !visible(el) || el.closest('[aria-hidden="true"], svg')) continue
        const fs = parseFloat(getComputedStyle(el).fontSize)
        if (fs < 12 - 0.01) {
          const k = `${String(el.className || el.tagName).slice(0, 40)} ${fs}px`
          tiny.set(k, (tiny.get(k) ?? 0) + 1)
        }
      }
      return { mainScroll: main.scrollWidth, mainClient: main.clientWidth, docScroll: doc.scrollWidth, docClient: doc.clientWidth,
        over: [...new Set(over)].slice(0, 4), small, tight, tiny: [...tiny.entries()].map(([k, v]) => `${k} ×${v}`) }
    })

    // nav overlap: scroll the pane to its end, then compare the last content box to the tab bar top
    const nav = await page.evaluate(async () => {
      const main = document.querySelector('.mc-main')
      const bar = document.querySelector('[data-mobile-nav]')
      if (!main || !bar) return { covered: null }
      // behavior:'instant' — the pane has scroll-behavior:smooth, which would still be mid-flight.
      // Lazy sections can grow the pane once revealed, so chase the end a few times.
      for (let i = 0; i < 4; i++) {
        main.scrollTo({ top: main.scrollHeight, behavior: 'instant' })
        await new Promise(r => setTimeout(r, 200))
      }
      const barTop = bar.getBoundingClientRect().top
      if (barTop >= window.innerHeight) return { covered: null }
      // A leaf's visible bottom is clipped by every overflow container between it and the pane,
      // so content parked inside an inner scroller or a fixed-height chart doesn't count.
      let lastBottom = 0
      for (const el of main.querySelectorAll('*')) {
        if (el.children.length || el.closest('[aria-hidden="true"]')) continue
        const s = getComputedStyle(el)
        if (s.visibility === 'hidden' || s.position === 'fixed') continue
        const b = el.getBoundingClientRect()
        if (!b.height || !b.width) continue
        let bottom = b.bottom, top = b.top
        for (let p = el.parentElement; p && p !== main; p = p.parentElement) {
          const ps = getComputedStyle(p)
          if (ps.position === 'fixed') { bottom = -1; break }
          if (ps.overflowY !== 'visible' || ps.overflowX !== 'visible') {
            const pb = p.getBoundingClientRect()
            bottom = Math.min(bottom, pb.bottom); top = Math.max(top, pb.top)
          }
        }
        if (bottom > top) lastBottom = Math.max(lastBottom, bottom)
      }
      return { covered: lastBottom > barTop + 1 ? Math.round(lastBottom - barTop) : 0, barTop: Math.round(barTop) }
    })

    const overflow = r.mainScroll > r.mainClient || r.docScroll > r.docClient
    const row = { width: W, route, overflow, mainScroll: r.mainScroll, mainClient: r.mainClient, small: r.small.length, tight: r.tight.length, tiny: r.tiny.length, navCovered: nav.covered, detail: r }
    rows.push(row)
    console.log(`${overflow ? '✗' : '✓'} ${route.padEnd(18)} main ${r.mainScroll}/${r.mainClient}  tap<44 ${String(r.small.length).padStart(3)}  gap<8 ${String(r.tight.length).padStart(3)}  text<12px ${String(r.tiny.length).padStart(2)}  nav-cover ${nav.covered ?? 'n/a'}` +
      (r.over.length ? `\n    overflowing: ${r.over.join(' | ')}` : ''))
  }
  await ctx.close()
}
await browser.close()

const tot = k => rows.reduce((s, r) => s + (typeof r[k] === 'number' ? r[k] : r[k] ? 1 : 0), 0)
console.log(`\nTOTAL pages=${rows.length} overflow=${tot('overflow')} tap<44=${tot('small')} gap<8=${tot('tight')} text<12px-groups=${tot('tiny')} nav-covered=${rows.filter(r => r.navCovered > 0).length}`)
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(rows, null, 2))
