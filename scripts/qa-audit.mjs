// QA sweep across every tab: console errors, overflow, contrast, collisions,
// stray legacy theme colors, a11y basics, and touch-target sizes.
//
// Usage: node scripts/qa-audit.mjs [baseUrl] [width] [height] [outDir]
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4176'
const W = Number(process.argv[3] ?? 1280)
const H = Number(process.argv[4] ?? 900)
const OUT = process.argv[5] ?? null
if (OUT) fs.mkdirSync(OUT, { recursive: true })

const TABS = [
  ['deck', '/'], ['approvals', '/approvals'], ['tasks', '/tasks'],
  ['calendar', '/calendar'], ['chat', '/chat'], ['github', '/github'],
  ['costs', '/costs'], ['projects', '/projects'], ['pipeline', '/pipeline'],
  ['ml-content', '/ml-content'], ['memory', '/memory'], ['team', '/team'],
  ['setup', '/setup'],
]

// Hexes/rgb from the retired neon-pink palette. Any of these still painted
// means a component is bypassing the accent tokens / chart palette.
const LEGACY = [
  'rgb(255, 16, 240)', 'rgb(181, 141, 255)', 'rgb(163, 230, 53)',
  'rgb(94, 234, 212)', 'rgb(255, 107, 214)', 'rgb(255, 140, 105)',
  'rgb(196, 181, 253)', 'rgb(255, 107, 107)',
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const mobile = W <= 500
let totalIssues = 0

for (const [name, path] of TABS) {
  const console_ = []
  page.removeAllListeners('console')
  page.removeAllListeners('pageerror')
  page.on('console', m => { if (m.type() === 'error') console_.push(m.text()) })
  page.on('pageerror', e => console_.push(`UNCAUGHT: ${e.message}`))

  await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(1800)

  const r = await page.evaluate(({ LEGACY, mobile }) => {
    const out = { legacy: [], lowContrast: [], collisions: [], a11y: [], tiny: [], truncated: [], overflow: null }
    const main = document.querySelector('.mc-main')
    if (!main) return out

    // -- horizontal overflow (the pane scrolls, not <html>)
    if (main.scrollWidth > main.clientWidth) {
      out.overflow = `${main.scrollWidth} > ${main.clientWidth}`
    }

    const els = [...main.querySelectorAll('*')]

    // -- stray legacy palette
    // .mc-swatch is exempt: those are the accent presets on /setup, so they
    // paint every offered accent (including the retired pink) on purpose.
    const seen = new Set()
    for (const el of els) {
      if (el.classList.contains('mc-swatch')) continue
      const cs = getComputedStyle(el)
      for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'fill', 'stroke']) {
        const v = cs[prop]
        if (v && LEGACY.some(l => v.startsWith(l.slice(0, -1)))) {
          const k = `${el.className || el.tagName}:${prop}:${v}`
          if (!seen.has(k)) { seen.add(k); out.legacy.push(k.slice(0, 90)) }
        }
      }
    }

    // -- text contrast vs its own painted backdrop
    const lum = c => {
      const m = c.match(/[\d.]+/g); if (!m) return null
      const [r, g, b] = m.slice(0, 3).map(Number)
      const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const backdrop = el => {
      let n = el
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor
        const m = bg.match(/[\d.]+/g)
        if (m && (m.length < 4 || Number(m[3]) > 0.85)) return bg
        n = n.parentElement
      }
      return 'rgb(6,1,10)'
    }
    for (const el of els) {
      if (!el.textContent?.trim() || el.children.length) continue
      const cs = getComputedStyle(el)
      const size = parseFloat(cs.fontSize)
      const L1 = lum(cs.color), L2 = lum(backdrop(el))
      if (L1 == null || L2 == null) continue
      const [hi, lo] = [L1, L2].sort((a, b) => b - a)
      const ratio = (hi + 0.05) / (lo + 0.05)
      const need = size >= 18 || (size >= 14 && Number(cs.fontWeight) >= 700) ? 3 : 4.5
      if (ratio < need - 0.05) {
        out.lowContrast.push(`${(el.className || el.tagName).toString().slice(0, 34)} ${size}px ${ratio.toFixed(2)}:1 (need ${need}) "${el.textContent.trim().slice(0, 24)}"`)
      }
    }

    // -- a11y basics
    for (const b of main.querySelectorAll('button')) {
      if (!b.textContent?.trim() && !b.getAttribute('aria-label') && !b.title) {
        out.a11y.push(`unlabeled button .${b.className}`.slice(0, 80))
      }
    }
    for (const i of main.querySelectorAll('img')) {
      if (!i.hasAttribute('alt')) out.a11y.push(`img without alt: ${i.src.slice(0, 50)}`)
      if (i.complete && i.naturalWidth === 0) out.a11y.push(`BROKEN IMG: ${i.src.slice(0, 60)}`)
    }

    // -- touch targets (mobile only)
    if (mobile) {
      for (const b of main.querySelectorAll('button, a[href]')) {
        const r = b.getBoundingClientRect()
        if (r.width > 0 && (r.height < 30 || r.width < 30)) {
          out.tiny.push(`${(b.className || b.tagName).toString().slice(0, 34)} ${Math.round(r.width)}x${Math.round(r.height)}`)
        }
      }
    }

    // -- clipped text (scrollWidth exceeds box with no scroll affordance)
    for (const el of els) {
      if (el.children.length || !el.textContent?.trim()) continue
      const cs = getComputedStyle(el)
      if (cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis' && cs.whiteSpace === 'nowrap') {
        if (el.scrollWidth > el.clientWidth + 2) {
          out.truncated.push(`${(el.className || el.tagName).toString().slice(0, 34)} "${el.textContent.trim().slice(0, 26)}"`)
        }
      }
    }

    const dedupe = a => [...new Set(a)]
    for (const k of ['legacy', 'lowContrast', 'a11y', 'tiny', 'truncated']) out[k] = dedupe(out[k]).slice(0, 6)
    return out
  }, { LEGACY, mobile })

  const issues = []
  if (console_.length) issues.push(['CONSOLE', console_.slice(0, 3)])
  if (r.overflow) issues.push(['OVERFLOW', [r.overflow]])
  if (r.legacy.length) issues.push(['LEGACY COLOR', r.legacy])
  if (r.lowContrast.length) issues.push(['CONTRAST', r.lowContrast])
  if (r.a11y.length) issues.push(['A11Y', r.a11y])
  if (r.tiny.length) issues.push(['TOUCH TARGET', r.tiny])
  if (r.truncated.length) issues.push(['CLIPPED', r.truncated])

  totalIssues += issues.reduce((n, [, v]) => n + v.length, 0)
  console.log(`${issues.length ? '✗' : '✓'} ${name}`)
  for (const [kind, list] of issues) for (const l of list) console.log(`    [${kind}] ${l}`)

  if (OUT) await page.screenshot({ path: `${OUT}/${mobile ? 'm' : 'd'}-${name}.png`, fullPage: false })
}

await browser.close()
console.log(`\n${totalIssues} issue(s) across ${TABS.length} tabs at ${W}x${H}`)
