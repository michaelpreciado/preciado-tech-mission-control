// Debug helper: dump the /chat interaction surface so the QA harness can drive
// it. Prints data-stage, clickable rows, and scrollers at one viewport.
import { chromium } from 'playwright'
const BASE = process.argv[2] ?? 'http://127.0.0.1:4176'
const W = Number(process.argv[3] ?? 412), H = Number(process.argv[4] ?? 915)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await ctx.addInitScript(() => { try { sessionStorage.setItem('mc:boot:w2i', 'seen') } catch {} })
const page = await ctx.newPage()
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text().slice(0, 160)) })
await page.goto(BASE + '/chat', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

const dump = await page.evaluate(() => {
  const main = document.querySelector('.mc-main') ?? document.body
  const rows = [...main.querySelectorAll('button, a, [role="button"]')].map(el => {
    const b = el.getBoundingClientRect()
    return { tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48), cls: String(el.className || '').split(/\s+/)[0].slice(0, 40), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }).filter(r => r.w > 0 && r.h > 0)
  const scrollers = [...main.querySelectorAll('*')].filter(el => {
    const cs = getComputedStyle(el)
    return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4
  }).map(el => ({ cls: String(el.className || '').split(/\s+/)[0].slice(0, 50), scrollH: el.scrollHeight, clientH: el.clientHeight, overscroll: getComputedStyle(el).overscrollBehaviorY, touchAction: getComputedStyle(el).touchAction }))
  return { stage: document.querySelector('[data-stage]')?.getAttribute('data-stage'), rows, scrollers }
})
console.log('stage:', dump.stage)
console.log('--- rows ---')
for (const r of dump.rows) console.log(` ${r.tag} [${r.x},${r.y} ${r.w}x${r.h}] ${r.cls} :: ${r.text}`)
console.log('--- scrollers ---')
for (const s of dump.scrollers) console.log(` ${s.cls} ${s.scrollH}/${s.clientH} overscrollY=${s.overscroll} touch-action=${s.touchAction}`)

// Try opening the first plausible conversation row and report what happens.
const dumpRows = () => page.evaluate(() => {
  const main = document.querySelector('.mc-main') ?? document.body
  return [...main.querySelectorAll('button, a, [role="button"]')].map(el => {
    const b = el.getBoundingClientRect()
    return { tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48), cls: String(el.className || '').split(/\s+/)[0].slice(0, 40), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }).filter(r => r.w > 0 && r.h > 0)
})

const tapText = async (re) => {
  const rows = await dumpRows()
  const hit = rows.find(r => re.test(r.text))
  if (!hit) { console.log('no row matching', re); return false }
  console.log(`tap -> ${hit.text}`)
  await page.mouse.click(hit.x + hit.w / 2, hit.y + hit.h / 2)
  await page.waitForTimeout(2500)
  return true
}

await tapText(/All conversations/i)
console.log('stage after list tap:', await page.evaluate(() => document.querySelector('[data-stage]')?.getAttribute('data-stage')))
const step2 = await dumpRows()
console.log('--- rows in list stage ---')
for (const r of step2) console.log(` ${r.tag} [${r.x},${r.y} ${r.w}x${r.h}] ${r.cls} :: ${r.text}`)

const conv = step2.find(r => /jarvis|friday|default|qwen|gemma|cdot|session/i.test(r.text) && r.h > 30)
if (conv) {
  console.log('opening conversation:', conv.text)
  await page.mouse.click(conv.x + conv.w / 2, conv.y + conv.h / 2)
  await page.waitForTimeout(3000)
  const st = await page.evaluate(() => ({
    stage: document.querySelector('[data-stage]')?.getAttribute('data-stage'),
    hasInput: !!document.querySelector('.mc-main textarea, .mc-main input[type=text], .mc-main [contenteditable=true]'),
    inputs: [...document.querySelectorAll('.mc-main textarea, .mc-main input, .mc-main [contenteditable=true]')].map(el => `${el.tagName.toLowerCase()}.${String(el.className || '').split(/\s+/)[0]}:${JSON.stringify(el.getBoundingClientRect().toJSON())}`.slice(0, 220)),
  }))
  console.log('after opening:', JSON.stringify(st, null, 1))
  await page.screenshot({ path: '/home/mp/.hermes/kanban/workspaces/t_8bd97d7c/evidence/debug-thread.png' })
}
await browser.close()