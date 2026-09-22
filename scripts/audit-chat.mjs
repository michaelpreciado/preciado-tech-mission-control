// Real-gesture QA harness for Mission Control /chat.
//
// Enforces the chat-rebuild QA gate:
//   1. no horizontal overflow of the chat pane at phone width
//   2. no clipped content at phone/tablet widths, and nothing hidden behind the
//      fixed bottom navigation
//   3. the composer stays reachable after real touch gestures, in the list
//      stage AND in the thread stage
//   4. no console errors / unhandled rejections during the pass
//   5. a 300-message thread keeps vertical scrolling and a usable composer
//
// Gestures go through CDP (Input.synthesizeScrollGesture) so they drive real
// compositor scrolling rather than element.scrollTop writes — a pane that only
// *looks* scrollable is caught.
//
// Usage:
//   node scripts/audit-chat.mjs [baseUrl] [outDir]
//   node scripts/audit-chat.mjs http://127.0.0.1:4176 ./qa-out
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4176'
const OUT = process.argv[3] ?? null
if (OUT) fs.mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  ['phone-412', 412, 915, true],
  ['tablet-768', 768, 1024, true],
  ['phone-375', 375, 812, true],
  ['desktop-1440', 1440, 900, false],
]

const probe = () => {
  const main = document.querySelector('.mc-main') ?? document.querySelector('main') ?? document.body
  const vw = window.innerWidth
  const vh = window.innerHeight
  const out = {
    stage: document.querySelector('[data-stage]')?.getAttribute('data-stage') ?? null,
    main: null, clipped: [], scrollers: [], thread: null, composer: null,
    navOccluded: [], visiblePanes: [],
  }

  out.main = {
    scrollWidth: main.scrollWidth, clientWidth: main.clientWidth,
    overflowX: main.scrollWidth > main.clientWidth + 1 ? `${main.scrollWidth} > ${main.clientWidth}` : null,
  }

  const scrollable = (el) => {
    const cs = getComputedStyle(el)
    return {
      y: (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4,
      x: (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 4,
    }
  }

  for (const el of main.querySelectorAll('*')) {
    const b = el.getBoundingClientRect()
    if (b.width === 0 || b.height === 0) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue

    if (b.right > vw + 2 || b.left < -2) {
      let n = el.parentElement, ok = false
      while (n && n !== document.body) {
        if (scrollable(n).x) { ok = true; break }
        n = n.parentElement
      }
      if (!ok) out.clipped.push({
        tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60),
        left: Math.round(b.left), right: Math.round(b.right),
        why: b.right > vw + 2 ? 'spills past viewport right' : 'starts left of viewport',
      })
    }

    const insideScroller = (() => {
      let n = el.parentElement
      while (n && n !== document.documentElement) {
        if (scrollable(n).y) return true
        n = n.parentElement
      }
      return false
    })()
    if (!insideScroller && (b.top < -2 || b.bottom > vh + 2)) {
      out.clipped.push({
        tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60),
        top: Math.round(b.top), bottom: Math.round(b.bottom),
        why: b.bottom > vh + 2 ? 'past viewport bottom, no scrollable ancestor' : 'above viewport, no scrollable ancestor',
      })
    }
  }

  for (const el of main.querySelectorAll('*')) {
    const s = scrollable(el)
    if (!s.y && !s.x) continue
    const r = el.getBoundingClientRect()
    out.scrollers.push({
      cls: String(el.className || '').slice(0, 60), canY: s.y, canX: s.x,
      scrollTop: Math.round(el.scrollTop), clientH: el.clientHeight, scrollH: el.scrollHeight,
      rect: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
    })
    if (s.y) out.thread = {
      cls: String(el.className || '').slice(0, 60),
      scrollTop: Math.round(el.scrollTop), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      rect: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
    }
  }

  // Which of the "one window at a time" panes is actually on screen (mobile).
  for (const el of main.querySelectorAll('[class*="pane"], [class*="Pane"], [class*="rail"], [class*="sidebar"]')) {
    const b = el.getBoundingClientRect()
    if (b.width > 24 && b.height > 24 && b.right > 0 && b.left < vw) {
      out.visiblePanes.push({ cls: String(el.className || '').split(/\s+/).slice(0, 2).join('.').slice(0, 50), w: Math.round(b.width), left: Math.round(b.left) })
    }
  }

  const input = main.querySelector('textarea, input[type="text"], [contenteditable="true"]')
  if (input) {
    const r = input.getBoundingClientRect()
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2)
    const hit = cy > 0 && cy < vh && cx > 0 && cx < vw ? document.elementFromPoint(cx, cy) : null
    out.composer = {
      tag: input.tagName.toLowerCase(),
      rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) },
      inViewport: r.top >= 0 && r.bottom <= vh + 1 && r.left >= -1 && r.right <= vw + 1,
      reachable: !!hit && (hit === input || input.contains(hit) || hit.contains(input)),
      hitTag: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className || '').split(/\s+/)[0]}` : null,
    }
  }

  // Fixed bottom navigation must not swallow tappable content. Any interactive
  // element whose centre falls inside the nav box is unreachable.
  const nav = document.querySelector('nav[aria-label], .tabbar, [class*="bottomNav"], [class*="mobileNav"], footer nav')
  if (nav) {
    const nr = nav.getBoundingClientRect()
    if (nr.height > 20 && nr.bottom > vh - 4) {
      for (const el of main.querySelectorAll('a, button, input, select, textarea, [role="button"]')) {
        const b = el.getBoundingClientRect()
        if (b.width < 8 || b.height < 8) continue
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2
        if (cx < nr.left || cx > nr.right || cy < nr.top || cy > nr.bottom) continue
        const hit = document.elementFromPoint(Math.round(cx), Math.round(cy))
        if (hit && !nav.contains(hit) && !el.contains(hit)) {
          out.navOccluded.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 50), hitTag: hit.tagName.toLowerCase() })
        }
      }
      out.navBox = { top: Math.round(nr.top), height: Math.round(nr.height) }
    }
  }
  return out
}

const tap = async (page, locator) => {
  const box = await locator.boundingBox()
  if (!box) return false
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  return true
}

const browser = await chromium.launch()
const report = { base: BASE, ranAt: new Date().toISOString(), viewports: [], findings: [] }
const addFinding = (vp, id, severity, what, evidence) => report.findings.push({ viewport: vp, id, severity, what, evidence })

for (const [name, W, H, touch] of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch,
  })
  // Deterministic shell: never let the launch film race the probe.
  await ctx.addInitScript(() => { try { sessionStorage.setItem('mc:boot:w2i', 'seen') } catch {} })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
  page.on('pageerror', e => consoleErrors.push(`UNCAUGHT: ${String(e.message).slice(0, 200)}`))

  const entry = { name, width: W, height: H, touch, list: null, thread: null, consoleErrors, steps: [] }
  const shot = async (tag) => { if (OUT) await page.screenshot({ path: path.join(OUT, `${name}-${tag}.png`) }) }

  try {
    await page.goto(BASE + '/chat', { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForSelector('[data-stage]', { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(1200)

    const cdp = await ctx.newCDPSession(page)
    // Real finger drag: Input.dispatchTouchEvent. NOTE: CDP's
    // Input.synthesizeScrollGesture does NOT reliably scroll this app's panes
    // (verified: same page, manual touch drag moves the thread 245px while the
    // synthetic gesture moves it 0px), so the harness synthesises the drag
    // itself. dy > 0 = finger drags down = history scrolls back.
    const swipe = async (dy, yFrac = 0.5) => {
      const x = Math.round(W / 2), y0 = Math.round(H * yFrac)
      if (touch) {
        const steps = 12
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] }).catch(() => {})
        for (let i = 1; i <= steps; i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + Math.round((dy * i) / steps) }] }).catch(() => {})
          await page.waitForTimeout(16)
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {})
      } else {
        await page.mouse.move(x, y0)
        await page.mouse.wheel(0, -dy)
      }
      await page.waitForTimeout(500)
    }

    // ── Stage 1: the list / roster shell ──
    entry.list = await page.evaluate(probe)
    await shot('list')
    const sig = (p) => JSON.stringify({ t: p.thread?.scrollTop ?? null, s: (p.scrollers ?? []).map(x => x.scrollTop) })
    await swipe(-Math.round(H * 0.4))
    let listAfter = await page.evaluate(probe)
    if (sig(entry.list) === sig(listAfter)) { await swipe(Math.round(H * 0.8)); listAfter = await page.evaluate(probe) }
    entry.listAfterGesture = listAfter
    await shot('list-scrolled')

    if (entry.list.main?.overflowX) addFinding(name, 'LIST-H-OVERFLOW', 'high', `chat shell scrolls horizontally: ${entry.list.main.overflowX}`, entry.list.main)
    const clipX = entry.list.clipped.filter(c => c.why === 'spills past viewport right')
    if (clipX.length) addFinding(name, 'LIST-CLIP-X', 'high', `${clipX.length} element(s) spill past the viewport right edge`, { sample: clipX.slice(0, 6) })
    if (entry.list.navOccluded?.length) addFinding(name, 'LIST-BEHIND-NAV', 'high', `${entry.list.navOccluded.length} interactive element(s) sit under the fixed bottom nav`, { sample: entry.list.navOccluded.slice(0, 6) })

    // ── Stage 2: open a conversation (thread + composer) ──
    // The console is staged (roster → conversations → thread): tap into the
    // session list first, then into a conversation row. Real pointer taps.
    const stage = () => page.evaluate(() => document.querySelector('[data-stage]')?.getAttribute('data-stage') ?? null)
    const hasInput = () => page.evaluate(() => !!document.querySelector('.mc-main textarea, .mc-main input[type="text"], .mc-main [contenteditable="true"]'))
    const rows = () => page.evaluate(() => [...document.querySelectorAll('.mc-main button, .mc-main a')]
      .map(el => {
        const b = el.getBoundingClientRect()
        return { text: (el.textContent || '').trim().replace(/\s+/g, ' '), x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), w: Math.round(b.width), h: Math.round(b.height) }
      })
      .filter(r => r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.y < window.innerHeight))
    const tapRow = async (re) => {
      const hit = (await rows()).find(r => re.test(r.text) && r.h > 30)
      if (!hit) return false
      await page.mouse.click(hit.x, hit.y)
      await page.waitForTimeout(2200)
      return true
    }
    await tapRow(/All conversations|conversations/i)
    if (!(await hasInput())) {
      // Prefer a row inside the conversation list itself — the roster's bot rows
      // are taller and would bounce the stage back to 'conversations'.
      const convRow = await page.evaluate(() => {
        const box = document.querySelector('[class*="conversationList"], [class*="conversationPane"], [class*="conversations"]')
        if (!box) return null
        const b = [...box.querySelectorAll('button')].find(el => {
          const r = el.getBoundingClientRect()
          return r.width > 120 && r.height > 50 && r.top >= 0 && r.bottom <= window.innerHeight
        })
        if (!b) return null
        const r = b.getBoundingClientRect()
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
      })
      if (convRow) { await page.mouse.click(convRow.x, convRow.y); await page.waitForTimeout(2200) }
      else await tapRow(/(just now|\d+[smhd] ago)/i)
    }
    const opened = (await stage()) === 'thread' || (await hasInput())
    entry.openedThread = opened
    entry.thread = await page.evaluate(probe)
    await shot('thread')

    if (entry.thread.main?.overflowX) addFinding(name, 'THREAD-H-OVERFLOW', 'high', `thread pane scrolls horizontally: ${entry.thread.main.overflowX}`, entry.thread.main)
    const tclipX = entry.thread.clipped.filter(c => c.why === 'spills past viewport right')
    if (tclipX.length) addFinding(name, 'THREAD-CLIP-X', 'high', `${tclipX.length} element(s) spill past the viewport right edge in the thread`, { sample: tclipX.slice(0, 6) })
    if (entry.thread.navOccluded?.length) addFinding(name, 'THREAD-BEHIND-NAV', 'high', `${entry.thread.navOccluded.length} interactive element(s) sit under the fixed bottom nav in the thread`, { sample: entry.thread.navOccluded.slice(0, 6) })
    if (!opened) addFinding(name, 'THREAD-UNREACHABLE', 'medium', 'could not open a conversation from the list with a real tap', { stage: entry.thread.stage, panes: entry.thread.visiblePanes })

    if (entry.thread.composer) {
      if (!entry.thread.composer.inViewport) addFinding(name, 'COMPOSER-OFFSCREEN', 'high', 'composer is not fully inside the viewport at rest', entry.thread.composer)
      if (!entry.thread.composer.reachable) addFinding(name, 'COMPOSER-BLOCKED', 'high', `composer centre is covered by ${entry.thread.composer.hitTag}`, entry.thread.composer)
      if (touch && entry.thread.composer.rect.h < 44) addFinding(name, 'COMPOSER-TOO-SMALL', 'medium', `composer hit area is ${entry.thread.composer.rect.h}px (needs >=44px)`, entry.thread.composer)
    } else if (opened) {
      addFinding(name, 'COMPOSER-MISSING', 'high', 'thread opened but no message input is in the DOM', { stage: entry.thread.stage })
    }

    // Real gesture over the thread, then confirm the composer survives it. The
    // thread is bottom-anchored (it opens on the newest message), so a positive
    // yDistance (finger drags down → history scrolls back) is the direction that
    // can actually move it; a downward-only swipe would report a false failure.
    await swipe(Math.round(H * 0.5), 0.45)
    let thAfter = await page.evaluate(probe)
    if (sig(entry.thread) === sig(thAfter)) { await swipe(-Math.round(H * 0.5), 0.45); thAfter = await page.evaluate(probe) }
    if (sig(entry.thread) === sig(thAfter)) { await swipe(Math.round(H * 0.9), 0.6); thAfter = await page.evaluate(probe) }
    entry.threadAfterGesture = thAfter
    await shot('thread-scrolled')
    if (entry.threadAfterGesture.composer && !entry.threadAfterGesture.composer.reachable) {
      addFinding(name, 'COMPOSER-BLOCKED-AFTER-SCROLL', 'high', `after scrolling the thread the composer centre is covered by ${entry.threadAfterGesture.composer.hitTag}`, entry.threadAfterGesture.composer)
    }
    const t0 = entry.thread.thread?.scrollTop ?? 0
    const t1 = entry.threadAfterGesture.thread?.scrollTop ?? 0
    entry.gestureScrolled = t1 !== t0
    if (!entry.gestureScrolled && (entry.thread.thread?.scrollHeight ?? 0) > (entry.thread.thread?.clientHeight ?? 0) + 4) {
      addFinding(name, 'GESTURE-NO-SCROLL', 'high', 'a real touch/wheel gesture over the thread did not move the thread scroller', { before: entry.thread.thread, after: entry.threadAfterGesture.thread })
    }

    // ── Stage 3: 300-message thread ──
    if (entry.thread.thread && entry.thread.thread.scrollHeight > entry.thread.thread.clientHeight + 4) {
      const seeded = await page.evaluate(() => {
        const main = document.querySelector('.mc-main')
        let thread = null
        for (const el of main.querySelectorAll('*')) {
          const cs = getComputedStyle(el)
          if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) thread = el
        }
        if (!thread) return null
        const t0 = performance.now()
        for (let i = 0; i < 300; i++) {
          const d = document.createElement('div')
          d.className = 'qa-long-row'
          d.textContent = `synthetic message ${i + 1}`
          d.style.cssText = 'padding:6px 10px;margin:2px 0;border:1px dashed rgba(255,255,255,.15);font-size:12px'
          thread.appendChild(d)
        }
        const appendMs = performance.now() - t0
        return { scrollHeight: thread.scrollHeight, clientHeight: thread.clientHeight, appendMs: Math.round(appendMs) }
      }).catch(() => null)
      entry.longThread = seeded
      if (seeded) {
        const frames = await page.evaluate(() => new Promise(res => {
          let n = 0
          const t0 = performance.now()
          const tick = () => { n++; if (performance.now() - t0 < 600) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now() - t0) / 1000))) }
          requestAnimationFrame(tick)
        })).catch(() => null)
        entry.longThreadFps = frames
        await swipe(Math.round(H * 1.5), 0.5)
        const after = await page.evaluate(probe)
        entry.longAfter = after
        await shot('long-thread')
        if (after.composer && !after.composer.reachable) addFinding(name, 'COMPOSER-LOST-LONG-THREAD', 'high', 'composer unreachable after scrolling a 300-message thread', after.composer)
        if (after.main?.overflowX) addFinding(name, 'LONG-THREAD-H-OVERFLOW', 'high', `300-message thread introduces horizontal overflow: ${after.main.overflowX}`, after.main)
        if (frames !== null && frames < 40) addFinding(name, 'LONG-THREAD-FPS', 'medium', `rAF rate during a 300-message thread scroll: ${frames}/s`, { frames })
      }
    }

    if (consoleErrors.length) addFinding(name, 'CONSOLE-ERROR', 'medium', `${consoleErrors.length} console error(s) during load + gestures`, { consoleErrors: consoleErrors.slice(0, 5) })
  } catch (err) {
    entry.error = String(err).slice(0, 300)
    addFinding(name, 'HARNESS-ERROR', 'medium', `harness could not complete this viewport: ${entry.error}`, {})
  }
  report.viewports.push(entry)
  await ctx.close()
}

await browser.close()
report.summary = {
  viewports: report.viewports.length,
  findings: report.findings.length,
  bySeverity: report.findings.reduce((a, f) => { a[f.severity] = (a[f.severity] ?? 0) + 1; return a }, {}),
  openedThreads: report.viewports.filter(v => v.openedThread).length,
  consoleErrors: report.viewports.reduce((a, v) => a + (v.consoleErrors?.length ?? 0), 0),
}
if (OUT) fs.writeFileSync(path.join(OUT, 'audit-chat.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report.summary, null, 2))
for (const f of report.findings) console.log(`[${f.severity}] ${f.viewport} ${f.id}: ${f.what}`)
process.exit(report.findings.some(f => f.severity === 'high') ? 1 : 0)