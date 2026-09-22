// Is the phone thread pane unresponsive to real touch, or is
// Input.synthesizeScrollGesture unreliable here? Compares, on the same page:
//   a) a manual CDP touch drag (touchStart → touchMove… → touchEnd) on the thread
//   b) the same manual drag on a control div injected by the harness
//   c) Input.synthesizeScrollGesture touch mode on both
import { chromium } from 'playwright'
const BASE = process.argv[2] ?? 'http://127.0.0.1:4176'
const W = Number(process.argv[3] ?? 412), H = Number(process.argv[4] ?? 915)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await ctx.addInitScript(() => { try { sessionStorage.setItem('mc:boot:w2i', 'seen') } catch {} })
const page = await ctx.newPage()
await page.goto(BASE + '/chat', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const rows = () => page.evaluate(() => [...document.querySelectorAll('.mc-main button, .mc-main a')].map(el => {
  const b = el.getBoundingClientRect()
  return { text: (el.textContent || '').trim().replace(/\s+/g, ' '), x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), w: Math.round(b.width), h: Math.round(b.height) }
}).filter(r => r.w > 0 && r.h > 0 && r.y > 0 && r.y < window.innerHeight))
const tapRow = async (re, minH = 30) => { const hit = (await rows()).find(r => re.test(r.text) && r.h >= minH); if (!hit) return false; await page.mouse.click(hit.x, hit.y); await page.waitForTimeout(2200); return true }
await tapRow(/All conversations|conversations/i)
if (!(await page.evaluate(() => !!document.querySelector('.mc-main textarea')))) {
  const conv = await page.evaluate(() => {
    const box = document.querySelector('[class*="conversationList"], [class*="conversationPane"], [class*="conversations"]')
    if (!box) return null
    const b = [...box.querySelectorAll('button')].find(el => { const r = el.getBoundingClientRect(); return r.width > 120 && r.height > 50 && r.top >= 0 && r.bottom <= window.innerHeight })
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: (b.textContent || '').trim().slice(0, 36) }
  })
  if (conv) { console.log('opened:', conv.text); await page.mouse.click(conv.x, conv.y); await page.waitForTimeout(2500) }
}

// control: a plain scrollable div under the same conditions
const ctrlBox = await page.evaluate(() => {
  const d = document.createElement('div')
  d.id = 'qa-scroll-control'
  d.style.cssText = 'position:fixed;right:4px;top:120px;width:60px;height:200px;overflow-y:auto;z-index:99999;background:#001;border:1px solid #0ff'
  d.innerHTML = Array.from({ length: 60 }, (_, i) => `<div style="height:20px;color:#0ff;font-size:10px">c${i}</div>`).join('')
  document.body.appendChild(d)
  const r = d.getBoundingClientRect()
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
})

const readTop = (sel) => page.evaluate((s) => {
  if (s === '#qa-scroll-control') return Math.round(document.getElementById('qa-scroll-control').scrollTop)
  const main = document.querySelector('.mc-main')
  let t = null
  for (const el of main.querySelectorAll('*')) { const cs = getComputedStyle(el); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) t = el }
  return t ? Math.round(t.scrollTop) : null
}, sel)

const cdp = await ctx.newCDPSession(page)
const drag = async (x, y, dy, steps = 12) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + Math.round((dy * i) / steps) }] })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(500)
}

const threadY = Math.round(H * 0.55)
const t0 = await readTop('.mc-main')
await drag(Math.round(W / 2), threadY, 260)
const t1 = await readTop('.mc-main')
const c0 = await readTop('#qa-scroll-control')
await drag(ctrlBox.x, ctrlBox.y, 120)
const c1 = await readTop('#qa-scroll-control')
await cdp.send('Input.synthesizeScrollGesture', { x: ctrlBox.x, y: ctrlBox.y, xDistance: 0, yDistance: 120, gestureSourceType: 'touch', speed: 800 }).catch(() => {})
await page.waitForTimeout(500)
const c2 = await readTop('#qa-scroll-control')

console.log(JSON.stringify({
  manualTouchDrag_thread: { before: t0, after: t1, moved: t1 !== t0 },
  manualTouchDrag_control: { before: c0, after: c1, moved: c1 !== c0 },
  syntheticGesture_control: { before: c1, after: c2, moved: c2 !== c1 },
}, null, 1))
await browser.close()