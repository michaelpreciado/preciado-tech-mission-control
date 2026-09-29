// Read-only browser QA against an isolated build (default http://127.0.0.1:4391). No mutation controls are clicked.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire('/home/mp/Documents/mission-control/package.json')
const { chromium } = require('playwright')
const BASE = process.env.QA_BASE || 'http://127.0.0.1:4391'
const OUT = process.env.QA_OUT || '../evidence'
fs.mkdirSync(`${OUT}/screens`, { recursive: true })
const VPS = [{ n: '1440x900', w: 1440, h: 900, m: false }, { n: '590x844', w: 590, h: 844, m: true }, { n: '390x844', w: 390, h: 844, m: true }]
const ROUTES = [['home', '/'], ['crew', '/crew'], ['kanban', '/kanban']]
const results = []
const SCROLL = `(f) => { document.documentElement.style.scrollBehavior = 'auto'; const m = document.querySelector('.mc-main'); m.style.scrollBehavior = 'auto'; const t = (el) => { el.scrollTop = f * (el.scrollHeight - el.clientHeight) }; t(m); window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)) }`
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${detail}`) }
const browser = await chromium.launch({ headless: true })
const contrast = []
let occ = 0

async function measure(page, vp, scene) {
  const runs = await page.evaluate(() => {
    const out = []; const W = innerWidth, H = innerHeight
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue
      const el = n.parentElement; const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || el.closest('[hidden]') || el.closest('svg') || el.closest('script,style,noscript,caption') || el.closest('.sr, [class*=skip]')) continue
      const r = document.createRange(); r.selectNodeContents(n)
      for (const b of r.getClientRects()) {
        if (b.width < 4 || b.height < 6 || b.bottom <= 0 || b.top >= H || b.right <= 0 || b.left >= W) continue
        const top = Math.max(b.top, 0) + 1, bot = Math.min(b.bottom, H) - 1, midY = (top + bot) / 2
        const xs = [b.left + Math.min(3, b.width / 2), (b.left + b.right) / 2, b.right - Math.min(3, b.width / 2)]
        const hit = (x, y) => { const t = document.elementFromPoint(Math.min(Math.max(x, 0), W - 1), y); return !!t && (t === el || el.contains(t) || t.contains(el)) }
        const grid = [top, midY, bot].flatMap(y => xs.map(x => hit(x, y)))
        if (!grid.some(Boolean)) { window.__occ = (window.__occ || 0) + 1; continue }
        out.push({ partial: !grid.every(Boolean), sel: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0].replace(/^.*__/, '').slice(0, 30)}`, color: cs.color, size: parseFloat(cs.fontSize), weight: +cs.fontWeight,
          box: [Math.max(0, Math.floor(b.left)), Math.max(0, Math.floor(b.top)), Math.min(W, Math.ceil(b.right)), Math.min(H, Math.ceil(b.bottom))] })
      }
    }
    return out
  })
  occ += await page.evaluate(() => window.__occ || 0)
  const tag = await page.addStyleTag({ content: '*,*::placeholder{color:transparent!important;text-shadow:none!important;caret-color:transparent!important;-webkit-text-fill-color:transparent!important}' })
  await page.waitForTimeout(150)
  const png = (await page.screenshot()).toString('base64')
  await tag.evaluate(n => n.remove())
  const res = await page.evaluate(async ({ png, runs }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }
    const L = (r, gg, b) => .2126 * lin(r) + .7152 * lin(gg) + .0722 * lin(b)
    return runs.map(run => {
      const [x0, y0, x1, y1] = run.box; const w = x1 - x0, h = y1 - y0
      if (w <= 0 || h <= 0) return null
      const d = g.getImageData(x0, y0, w, h).data
      let lo = 1, hi = 0
      for (let i = 0; i < d.length; i += 4) { const l = L(d[i], d[i + 1], d[i + 2]); if (l < lo) lo = l; if (l > hi) hi = l }
      const m = run.color.match(/[\d.]+/g).map(Number); const a = m[3] ?? 1
      const tl = L(m[0], m[1], m[2]); const worstBg = tl > (lo + hi) / 2 ? hi : lo
      const textL = a * tl + (1 - a) * worstBg
      const ratio = (Math.max(textL, worstBg) + .05) / (Math.min(textL, worstBg) + .05)
      const large = run.size >= 24 || (run.size >= 18.66 && run.weight >= 700)
      return { ...run, worst: +ratio.toFixed(2), need: large ? 3 : 4.5, pass: ratio >= (large ? 3 : 4.5) }
    }).filter(Boolean)
  }, { png, runs })
  for (const r of res) contrast.push({ viewport: vp.n, scene, ...r })
}

for (const vp of VPS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m })
  for (const [id, path] of ROUTES) {
    const page = await ctx.newPage(); const errs = []
    page.on('pageerror', e => errs.push(String(e))); page.on('console', m => m.type() === 'error' && errs.push(m.text().slice(0, 160)))
    const reqs = []; page.on('request', r => { if (r.method() !== 'GET' && r.method() !== 'HEAD') reqs.push(`${r.method()} ${r.url()}`) })
    await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/screens/${id}-${vp.n}.png` })
    const s = await page.evaluate(() => {
      const m = document.querySelector('.mc-main'); const nav = document.querySelector('[data-mobile-nav]')
      const navShown = nav && getComputedStyle(nav).display !== 'none'
      const small = [...document.querySelectorAll('a[href],button,input,select,textarea,[role=tab]')].filter(e => {
        const r = e.getBoundingClientRect(); const cs = getComputedStyle(e)
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]') && (r.height < 43.5 || r.width < 43.5) && !e.closest('.skip,[class*=skip]')
      }).map(e => `${e.tagName.toLowerCase()} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)}" ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`)
      return { overflowX: m ? m.scrollWidth - m.clientWidth : -1, htmlOverflow: document.documentElement.scrollWidth - innerWidth, navShown, small, h1: document.querySelectorAll('h1').length, blur: [...document.querySelectorAll('*')].map(e => getComputedStyle(e).backdropFilter).filter(b => b && b !== 'none').map(b => parseFloat(b.match(/blur\(([\d.]+)px/)?.[1] || 0)).reduce((a, b) => Math.max(a, b), 0), anim: document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).map(a => a.animationName || a.constructor.name) }
    })
    check(`${id}@${vp.n} no horizontal overflow (.mc-main)`, s.overflowX <= 0, `mc-main ${s.overflowX}, html ${s.htmlOverflow}`)
    check(`${id}@${vp.n} exactly one h1`, s.h1 === 1, String(s.h1))
    check(`${id}@${vp.n} max backdrop blur <=16px`, s.blur <= 16, `${s.blur}px`)
    check(`${id}@${vp.n} no infinite-running animations`, s.anim.length === 0, s.anim.join(',') || 'none')
    if (vp.m) console.log(`INFO ${id}@${vp.n} sub-44px targets: ${s.small.length} ${s.small.slice(0, 8).join(' | ')}`)
    results.push({ name: `${id}@${vp.n} sub44 targets (enforced on mobile only)`, pass: !vp.m || s.small.length === 0, detail: s.small.slice(0, 12).join(' | ') })
    // scroll end clears nav
    if (vp.m && s.navShown) {
      await page.evaluate(`(${SCROLL})(1)`)
      await page.waitForTimeout(300)
      const c = await page.evaluate(() => {
        const nav = document.querySelector('[data-mobile-nav]').getBoundingClientRect()
        const kids = [...document.querySelector('.mc-main').querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.height > 1 && r.width > 1 && cs.position !== 'fixed' && cs.visibility !== 'hidden' && !e.closest('[hidden],[aria-hidden=true]') }).map(e => [e.getBoundingClientRect().bottom, `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}`]).sort((a, b) => b[0] - a[0])
        return { navTop: nav.top, lastBottom: kids[0][0], who: kids[0][1] }
      })
      check(`${id}@${vp.n} scroll end clears tab bar`, c.lastBottom <= c.navTop + 1, `content ${Math.round(c.lastBottom)} nav ${Math.round(c.navTop)} last=${c.who}`)
      await page.screenshot({ path: `${OUT}/screens/${id}-${vp.n}-scrollend.png` })
    }
    check(`${id}@${vp.n} no console/page errors`, errs.length === 0, errs.slice(0, 3).join(' || '))
    check(`${id}@${vp.n} no non-GET requests`, reqs.length === 0, reqs.join(','))
    await page.evaluate(`(${SCROLL})(0)`); await page.waitForTimeout(500)
    await measure(page, vp, `${id}-top`)
    await page.close()
  }
  // kanban scrolled + drawer + more sheet + palette
  {
    const page = await ctx.newPage()
    await page.goto(BASE + '/kanban', { waitUntil: 'networkidle' }); await page.waitForTimeout(1200)
    await page.evaluate(`(${SCROLL})(0.5)`); await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/screens/kanban-scrolled-${vp.n}.png` })
    await measure(page, vp, 'kanban-scrolled')
    await page.evaluate(`(${SCROLL})(0)`); await page.waitForTimeout(400)
    const cards = page.locator('article button[aria-label^="Open "]:visible')
    const nCards = await cards.count()
    if (nCards) {
      let pick = 0
      for (let i = 0; i < Math.min(nCards, 30); i++) {
        await cards.nth(i).click({ timeout: 4000 }); await page.waitForTimeout(1000)
        const has = await page.evaluate(() => !!document.querySelector('[role=dialog] [aria-label="Task actions"] button.mc-btn-primary'))
        if (has) { pick = i; break }
        await page.keyboard.press('Escape'); await page.waitForTimeout(250)
        if (i === Math.min(nCards, 30) - 1) { await cards.nth(0).click({ timeout: 4000 }); await page.waitForTimeout(1000) }
      }
      console.log(`INFO drawer@${vp.n} card index with primary action: ${pick}`)
      await page.waitForTimeout(400)
      const dlg = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d ? { ok: true, focusIn: d.contains(document.activeElement) } : { ok: false } })
      check(`drawer@${vp.n} opens as dialog with focus inside`, dlg.ok && dlg.focusIn, JSON.stringify(dlg))
      await page.screenshot({ path: `${OUT}/screens/drawer-${vp.n}.png` })
      const ap = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button.mc-btn.mc-btn-primary')].map(b => { const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return { text: (b.textContent || '').trim().slice(0, 12), opacity: cs.opacity, bg: cs.backgroundColor, fg: cs.color, h: Math.round(r.height), inView: r.top >= 0 && r.bottom <= innerHeight } }))
      console.log(`INFO drawer@${vp.n} primary buttons ${JSON.stringify(ap)}`)
      await measure(page, vp, 'drawer')
      for (let i = 0; i < 14; i++) await page.keyboard.press('Tab')
      check(`drawer@${vp.n} focus trapped after 14 Tabs`, await page.evaluate(() => !!document.querySelector('[role=dialog]')?.contains(document.activeElement)))
      await page.keyboard.press('Escape'); await page.waitForTimeout(400)
      check(`drawer@${vp.n} Escape closes`, await page.evaluate(() => !document.querySelector('[role=dialog]')))
    } else console.log(`INFO no kanban cards available at ${vp.n} (empty board)`)
    if (vp.m) {
      const more = page.locator('[data-mobile-nav] button', { hasText: 'More' })
      if (await more.count()) {
        await more.click(); await page.waitForTimeout(500)
        check(`more-sheet@${vp.n} opens as modal dialog`, await page.evaluate(() => !!document.querySelector('[role=dialog][aria-modal=true]')))
        await page.screenshot({ path: `${OUT}/screens/more-${vp.n}.png` })
        await measure(page, vp, 'more-sheet')
        await page.keyboard.press('Escape'); await page.waitForTimeout(400)
        check(`more-sheet@${vp.n} Escape closes`, await page.evaluate(() => !document.querySelector('[role=dialog]')))
      }
    } else {
      await page.keyboard.press('Control+k'); await page.waitForTimeout(400)
      check('palette@1440 opens on Ctrl+K', await page.evaluate(() => !!document.querySelector('[role=dialog], .cmdp')))
      await page.screenshot({ path: `${OUT}/screens/palette-${vp.n}.png` })
      await measure(page, vp, 'palette')
      await page.keyboard.press('Escape')
    }
    await page.close()
  }
  await ctx.close()
}
// keyboard + reduced motion
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage(); await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  const f1 = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { txt: (a.textContent || '').trim().slice(0, 30), left: r.left, top: r.top } })
  check('Tab 1 reaches skip link, visible on focus', /skip/i.test(f1.txt) && f1.left >= 0 && f1.top >= 0, JSON.stringify(f1))
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab')
  const ring = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` })
  check('Focus ring visible', /^solid [2-9]/.test(ring), ring)
  const rm = await page.evaluate(() => ({ running: document.getAnimations().filter(a => a.playState === 'running').length, texture: getComputedStyle(document.querySelector('.mbg-texture')).display }))
  check('reduced motion: zero running animations', rm.running === 0, JSON.stringify(rm))
  await page.screenshot({ path: `${OUT}/screens/home-reduced-motion-1440x900.png` })
  await ctx.close()
}
await browser.close()
const partial = contrast.filter(r => r.partial), full = contrast.filter(r => !r.partial)
const fullFail = full.filter(r => !r.pass), partFail = partial.filter(r => !r.pass)
const strip = r => `${r.viewport} ${r.scene} ${r.sel} ratio ${r.worst} (need ${r.need}, ${r.color})`
const summary = { measured: contrast.length, occludedSkipped: occ, fullyVisible: full.length, fullyVisibleBelowThreshold: fullFail.length, partialUnderChrome: partial.length, partialBelowThreshold: partFail.length,
  fullFailures: fullFail.map(strip).slice(0, 60), partialFailures: partFail.map(strip).slice(0, 40),
  lowestFullBySelector: Object.entries(full.reduce((a, r) => (a[r.sel] = Math.min(a[r.sel] ?? 99, r.worst), a), {})).sort((a, b) => a[1] - b[1]).slice(0, 15) }
fs.writeFileSync(`${OUT}/qa-checks.json`, JSON.stringify(results, null, 1))
fs.writeFileSync(`${OUT}/qa-contrast-summary.json`, JSON.stringify(summary, null, 1))
console.log(JSON.stringify(summary, null, 1))
console.log(`CHECKS ${results.filter(r => r.pass).length}/${results.length} passed`)
for (const r of results.filter(r => !r.pass)) console.log(`FAILED: ${r.name} :: ${r.detail}`)
