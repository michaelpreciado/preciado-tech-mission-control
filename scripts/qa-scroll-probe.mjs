// Focused probe: why does a real touch gesture not move the /chat thread pane
// on phone viewports? Dumps touch-action / overscroll-behavior for the thread
// scroller and its ancestors, then tries touch vs wheel vs direct scrollTop.
import { chromium } from 'playwright'
const BASE = process.argv[2] ?? 'http://127.0.0.1:4176'
const W = Number(process.argv[3] ?? 412), H = Number(process.argv[4] ?? 915)
const touch = W < 1100
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 })
await ctx.addInitScript(() => { try { sessionStorage.setItem('mc:boot:w2i', 'seen') } catch {} })
const page = await ctx.newPage()
await page.goto(BASE + '/chat', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const rows = () => page.evaluate(() => [...document.querySelectorAll('.mc-main button, .mc-main a')].map(el => {
  const b = el.getBoundingClientRect()
  return { text: (el.textContent || '').trim().replace(/\s+/g, ' '), x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), w: Math.round(b.width), h: Math.round(b.height) }
}).filter(r => r.w > 0 && r.h > 0 && r.y > 0 && r.y < window.innerHeight))

const tapRow = async (re, minH = 30) => {
  const hit = (await rows()).find(r => re.test(r.text) && r.h >= minH)
  if (!hit) return false
  await page.mouse.click(hit.x, hit.y)
  await page.waitForTimeout(2200)
  return true
}
await tapRow(/All conversations|conversations/i)
if (!(await page.evaluate(() => !!document.querySelector('.mc-main textarea')))) {
  const conv = await page.evaluate(() => {
    const box = document.querySelector('[class*="conversationList"], [class*="conversationPane"], [class*="conversations"]')
    if (!box) return null
    const b = [...box.querySelectorAll('button')].find(el => { const r = el.getBoundingClientRect(); return r.width > 120 && r.height > 50 && r.top >= 0 && r.bottom <= window.innerHeight })
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: (b.textContent || '').trim().slice(0, 40) }
  })
  if (conv) { console.log('opening:', conv.text); await page.mouse.click(conv.x, conv.y); await page.waitForTimeout(2500) }
}

const style = await page.evaluate(() => {
  const main = document.querySelector('.mc-main')
  let thread = null
  for (const el of main.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) thread = el
  }
  if (!thread) return { thread: null }
  const chain = []
  let n = thread
  while (n && n !== document.body) {
    const cs = getComputedStyle(n)
    chain.push({
      cls: String(n.className || '').split(/\s+/).slice(0, 2).join('.').slice(0, 44),
      overflowY: cs.overflowY, touchAction: cs.touchAction, overscrollY: cs.overscrollBehaviorY,
      scrollTop: Math.round(n.scrollTop), scrollH: n.scrollHeight, clientH: n.clientHeight,
      pos: cs.position, height: cs.height,
    })
    n = n.parentElement
  }
  const r = thread.getBoundingClientRect()
  return { thread: { rect: { top: Math.round(r.top), bottom: Math.round(r.bottom) }, scrollTop: Math.round(thread.scrollTop), scrollH: thread.scrollHeight, clientH: thread.clientHeight }, chain }
})
console.log('thread:', JSON.stringify(style.thread))
console.log('--- ancestor chain ---')
for (const c of style.chain ?? []) console.log(` ${c.cls} overflowY=${c.overflowY} touch-action=${c.touchAction} overscrollY=${c.overscrollY} pos=${c.pos} h=${c.height} st=${c.scrollTop}/${c.scrollH}/${c.clientH}`)

const cdp = await ctx.newCDPSession(page)
const y = Math.round(H * 0.55)
const before = await page.evaluate(() => {
  const main = document.querySelector('.mc-main')
  let t = null
  for (const el of main.querySelectorAll('*')) { const cs = getComputedStyle(el); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) t = el }
  return t ? Math.round(t.scrollTop) : null
})

// 1) touch gesture, finger drags down (scroll back through history)
await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(W / 2), y, xDistance: 0, yDistance: 300, gestureSourceType: 'touch', speed: 900 }).catch(e => console.log('touch gesture err', e.message))
await page.waitForTimeout(700)
const afterTouch = await page.evaluate(() => { const main = document.querySelector('.mc-main'); let t = null; for (const el of main.querySelectorAll('*')) { const cs = getComputedStyle(el); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) t = el } return t ? Math.round(t.scrollTop) : null })

// 2) wheel
await page.mouse.move(Math.round(W / 2), y)
await page.mouse.wheel(0, -300)
await page.waitForTimeout(600)
const afterWheel = await page.evaluate(() => { const main = document.querySelector('.mc-main'); let t = null; for (const el of main.querySelectorAll('*')) { const cs = getComputedStyle(el); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) t = el } return t ? Math.round(t.scrollTop) : null })

// 3) direct assignment (does the element scroll at all?)
const afterDirect = await page.evaluate(() => { const main = document.querySelector('.mc-main'); let t = null; for (const el of main.querySelectorAll('*')) { const cs = getComputedStyle(el); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) t = el } if (!t) return null; t.scrollTop = Math.max(0, t.scrollTop - 300); return Math.round(t.scrollTop) })

// 4) page-level scroll channel: did the document scroll instead?
const docY = await page.evaluate(() => window.scrollY)
console.log(JSON.stringify({ before, afterTouch, afterWheel, afterDirect, docY }, null, 1))
await page.screenshot({ path: `/home/mp/.hermes/kanban/workspaces/t_8bd97d7c/evidence/probe-${W}x${H}.png` })
await browser.close()