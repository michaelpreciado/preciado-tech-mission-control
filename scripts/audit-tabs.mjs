// Production-validation audit: screenshot every tab at desktop + mobile,
// collect console errors and horizontal-scroll violations.
// Usage: node scripts/audit-tabs.mjs [baseUrl] [outDir]
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:4176'
const OUT = process.argv[3] ?? 'audit-out'
fs.mkdirSync(OUT, { recursive: true })

const TABS = [
  ['deck', '/'],
  ['approvals', '/approvals'],
  ['tasks', '/tasks'],
  ['calendar', '/calendar'],
  ['chat', '/chat'],
  ['github', '/github'],
  ['costs', '/costs'],
  ['projects', '/projects'],
  ['pipeline', '/pipeline'],
  ['ml-content', '/ml-content'],
  ['memory', '/memory'],
  ['team', '/team'],
  ['setup', '/setup'],
]

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 375, height: 812 },
}

const results = {}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
})
for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport })
  for (const [name, path] of TABS) {
    const page = await ctx.newPage()
    const errors = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 300)) })
    page.on('pageerror', err => errors.push(`PAGEERROR: ${String(err).slice(0, 300)}`))
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout
: 30000 }).catch(() => {})
      await page.waitForTimeout(2500)
      const metrics = await page.evaluate(() => ({
        bodyText: document.body.innerText.length,
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      await page.screenshot({ path: `${OUT}/${vpName}-${name}.png`, fullPage: false })
      results[`${vpName}-${name}`] = { ...metrics, errors: [...new Set(errors)].slice(0, 5) }
    } catch (err) {
      results[`${vpName}-${name}`] = { fatal: String(err).slice(0, 200), errors }
    }
    await page.close()
  }
  await ctx.close()
}
await browser.close()
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
