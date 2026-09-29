import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const read = rel => readFileSync(join(root, rel), 'utf8')
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '')

function cssFiles(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(root, rel)).isDirectory()) cssFiles(rel, out)
    else if (name.endsWith('.css')) out.push(rel)
  }
  return out
}
const allCss = [...cssFiles('app'), ...cssFiles('components')]
const globals = read('app/globals.css')

test('shared motion pause/kill rules live in exactly one file', () => {
  for (const marker of ["data-motion-visible='false'", "data-page-hidden='true'", "html[data-motion='reduced'] *,"]) {
    const owners = allCss.filter(f => strip(read(f)).includes(marker))
    assert.deepEqual(owners, ['components/MotionVisibility.css'], marker)
  }
})

test('observer watches only opt-in widgets, and the widgets opt in', () => {
  const lib = read('lib/motion-visibility.ts')
  assert.match(lib, /MOTION_WIDGET_SELECTOR = '\[data-motion-widget\]'/)
  for (const file of ['components/CoreOrb.tsx', 'components/views/HoloHud3D.tsx', 'components/HomeDeck.tsx', 'components/NeuralUplink.tsx', 'components/HoloRing.tsx']) {
    assert.match(read(file), /data-motion-widget/, file)
  }
})

test('persistent backdrop blur is limited to the cockpit plus four overlays', () => {
  const rule = strip(globals).match(/html:root body (\*(?::not\([^)]+\))+),/)
  assert.ok(rule, 'blur-kill rule present')
  const kept = [...rule[1].matchAll(/:not\(([^)]+)\)/g)].map(m => m[1]).sort()
  assert.deepEqual(kept, ['.cmdp', '.mc-cockpit', '.mc-drawer', '.mc-login-card', '.mc-modal'])
  assert.match(strip(globals), /html:root body \*::before, html:root body \*::after \{\s*-webkit-backdrop-filter: none !important;\s*backdrop-filter: none !important;/)
})

// A fill-mode of both/forwards on an element whose base style is hidden or undrawn strands it
// in that state once a blanket `animation: none` (data-motion reduced/off, or OS reduced motion) removes the animation.
const OPACITY_ZERO = /(?:^|[;\s])opacity\s*:\s*0\s*(?:;|$)/
const DASH_UNDRAWN = /(?:^|[;\s])stroke-dashoffset\s*:\s*[1-9]/
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const rules = css => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ sel: selector.replace(/\s+/g, ' ').trim(), body }))
const selectorMatches = (sel, base) => new RegExp(`${escapeRe(base)}(?![\\w-])`).test(sel)

function strandedBases() {
  const found = []
  for (const file of allCss) {
    for (const { sel, body } of rules(strip(read(file)))) {
      if (sel.includes('data-motion')) continue
      const anim = body.match(/(?:^|[;\s])animation\s*:\s*([^;]+)/)
      if (!anim || /\bnone\b/.test(anim[1]) || !/\b(both|forwards)\b/.test(anim[1])) continue
      const needs = []
      if (OPACITY_ZERO.test(body)) needs.push({ prop: 'opacity', end: /(?:^|[;\s])(?:opacity\s*:\s*1|display\s*:\s*none)\s*(?:;|$)/ })
      if (DASH_UNDRAWN.test(body)) needs.push({ prop: 'stroke-dashoffset', end: /(?:^|[;\s])stroke-dashoffset\s*:\s*0\s*(?:;|$)/ })
      if (!needs.length) continue
      for (const part of sel.split(',')) found.push({ base: part.trim(), needs })
    }
  }
  return found
}

// Bodies of rules nested in an exact `@media (prefers-reduced-motion: reduce) { ... }` block.
function osReducedMotionRules(css) {
  const out = []
  const open = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g
  for (let m; (m = open.exec(css)); ) {
    let depth = 1, i = open.lastIndex
    while (depth && i < css.length) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0, i++
    out.push(...rules(css.slice(open.lastIndex, i - 1)))
  }
  return out
}

test('hidden-until-animated elements have data-motion reduced and off fallbacks', () => {
  const stranded = strandedBases()
  const fallbacks = { reduced: [], off: [] }
  for (const file of allCss) {
    for (const { sel } of rules(strip(read(file)))) {
      for (const mode of ['reduced', 'off']) if (new RegExp(`\\[data-motion=["']${mode}["']\\]`).test(sel)) fallbacks[mode].push(sel)
    }
  }
  assert.ok(stranded.length >= 8, `scanner found the launch/boot rules (${stranded.length})`)
  for (const { base } of stranded) {
    for (const mode of ['reduced', 'off']) {
      assert.ok(fallbacks[mode].some(f => selectorMatches(f, base)), `${base} lacks a data-motion='${mode}' fallback`)
    }
  }
})

test("hidden-until-animated elements reach their visible end state under OS prefers-reduced-motion", () => {
  assert.match(strip(read('components/MotionVisibility.css')), /@media \(prefers-reduced-motion: reduce\) \{[^}]*animation: none !important;/, 'OS blanket animation kill is present')
  const stranded = strandedBases()
  assert.ok(stranded.length >= 8, `scanner found the launch/boot rules (${stranded.length})`)
  const os = allCss.flatMap(f => osReducedMotionRules(strip(read(f))))
  for (const { base, needs } of stranded) {
    const matching = os.filter(r => selectorMatches(r.sel, base))
    for (const { prop, end } of needs) {
      assert.ok(matching.some(r => end.test(r.body)), `${base} is not forced to a visible ${prop} end state under prefers-reduced-motion: reduce`)
    }
  }
})

test('launch film fallback forces the visible end state', () => {
  for (const mode of ['reduced', 'off']) {
    const block = strip(globals).match(new RegExp(`html\\[data-motion='${mode}'\\] :is\\(([^)]+)\\)`))
    assert.ok(block, mode)
    for (const cls of ['.launch-letter', '.launch-sub', '.launch-meta', '.launch-data', '.launch-final', '.launch-chart-dot', '.launch-chart-line', '.launch-seam']) {
      assert.ok(block[1].includes(cls), `${mode} ${cls}`)
    }
    assert.match(strip(globals), new RegExp(`html\\[data-motion='${mode}'\\] \\.launch-chart-line[^{]*\\{ stroke-dashoffset: 0; \\}`))
    assert.match(strip(globals), new RegExp(`html\\[data-motion='${mode}'\\] \\.boot-draw-path[^{]*\\{ animation: none; stroke-dashoffset: 0; \\}`))
  }
})

test('NeuralUplink module has no unused keyframes', () => {
  const css = strip(read('components/NeuralUplink.module.css'))
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1])
  assert.ok(names.length > 0)
  for (const name of names) {
    const used = [...css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)].some(m => new RegExp(`(^|\\s)${name}(\\s|$)`).test(m[1]))
    assert.ok(used, `@keyframes ${name} is unused`)
  }
})

test('rain and accent tokens are unchanged', () => {
  const g = strip(globals)
  assert.match(g, /--mc-rain-head: #c4e2ff;/)
  assert.match(g, /--mc-rain-trail: rgba\(30, 144, 255, \.26\);/)
  assert.match(g, /--mc-rain-glow: rgba\(30, 144, 255, \.52\);/)
  assert.match(g, /--mc-rain-head: color\(display-p3 \.78 \.89 1\);/)
  assert.match(g, /--mc-rain-trail: color\(display-p3 \.16 \.58 1 \/ \.28\);/)
  assert.match(g, /--mc-rain-glow: color\(display-p3 \.16 \.58 1 \/ \.56\);/)
  const tokens = read('lib/tokens.ts')
  assert.match(tokens, /NEON_DEFAULT = '#1e90ff'/)
  assert.match(tokens, /ACCENT_DEFAULT = '#9db4ec'/)
  assert.match(tokens, /ACTION_DEFAULT = '#75b9ff'/)
  assert.match(tokens, /bg:\s+'#07080b'/)
})

test('containment is applied by exact owners, not class-substring matching', () => {
  for (const file of allCss) assert.doesNotMatch(strip(read(file)), /\[class[*^$~|]?=[^\]]*obCard/, `${file} matches obCard by attribute substring`)
  const owners = []
  for (const file of allCss) {
    for (const { sel, body } of rules(strip(read(file)))) if (/(?:^|[;\s])contain\s*:[^;]*\bpaint\b/.test(body)) owners.push(`${file}: ${sel}`)
  }
  assert.deepEqual(owners.sort(), ['app/globals.css: .mc-hud3d', 'components/HomeWorkspace.module.css: .obCard'])
  const home = rules(strip(read('components/HomeWorkspace.module.css')))
  for (const cls of ['.obCardHeader', '.obCardBody']) {
    const own = home.filter(r => r.sel.split(',').map(x => x.trim()).includes(cls))
    assert.ok(own.length, cls)
    for (const r of own) assert.doesNotMatch(r.body, /contain\s*:/, `${cls} must not be contained`)
  }
})

test('NeuralUplink renders only classes that its module styles', () => {
  const css = strip(read('components/NeuralUplink.module.css'))
  const used = new Set([...read('components/NeuralUplink.tsx').matchAll(/styles\.(\w+)/g)].map(m => m[1]))
  assert.ok(used.has('scan'))
  for (const name of used) assert.match(css, new RegExp(`(^|[\\s,}])\\.${name}\\b`, 'm'), `.${name} is rendered but unstyled`)
})

// ---- v4 lane: an !important animation starter must be inert in reduced / off / OS reduce ----
// components/MotionVisibility.css kills animation with low-specificity `animation: none !important`, so a more
// specific !important starter in v4-lane.css wins the cascade and keeps running (scroll-linked, so it never ends).
function nestedRules(css, conds = []) {
  const out = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open < 0) break
    const prelude = css.slice(i, open).replace(/\s+/g, ' ').trim()
    let depth = 1, j = open + 1
    while (depth && j < css.length) depth += css[j] === '{' ? 1 : css[j] === '}' ? -1 : 0, j++
    const inner = css.slice(open + 1, j - 1)
    if (/^@(media|supports|layer)\b/.test(prelude)) out.push(...nestedRules(inner, [...conds, prelude]))
    else if (!prelude.startsWith('@')) out.push({ sel: prelude, body: inner, conds })
    i = j
  }
  return out
}
const topLevelSplit = (text, sep) => {
  const parts = []
  let depth = 0, cur = ''
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth--
    if (ch === sep && !depth) { parts.push(cur.trim()); cur = '' } else cur += ch
  }
  return [...parts, cur.trim()].filter(Boolean)
}
// Evaluates only the leading `html…` compound: [data-motion="x"], :not(list), :root. Other selectors are treated as matching.
function htmlMatches(part, motion) {
  const m = part.match(/^html((?:\[[^\]]*\]|:not\((?:[^()]|\([^()]*\))*\)|:root)*)/)
  if (!m) return true
  const simple = tok => {
    const attr = tok.match(/^\[data-motion=["']?([\w-]+)["']?\]$/)
    if (attr) return motion === attr[1]
    const not = tok.match(/^:not\(([\s\S]*)\)$/)
    if (not) return !topLevelSplit(not[1], ',').some(simple)
    return true
  }
  const toks = m[1].match(/\[[^\]]*\]|:not\((?:[^()]|\([^()]*\))*\)|:root/g) || []
  return toks.every(simple)
}
function activeIn(rule, { motion, osReduce }) {
  for (const cond of rule.conds) {
    if (/prefers-reduced-motion:\s*no-preference/.test(cond) && osReduce) return false
    if (/prefers-reduced-motion:\s*reduce/.test(cond) && !osReduce) return false
  }
  return topLevelSplit(rule.sel, ',').some(part => htmlMatches(part, motion))
}
function importantAnimationStarters(css) {
  return nestedRules(strip(css)).filter(rule => rule.body.split(';').some(decl => {
    const d = decl.match(/^\s*(animation|animation-name|animation-timeline)\s*:\s*([^!]+?)\s*!important/)
    return d && !/^none\b/.test(d[2])
  }))
}
const V4_LANE = read('app/vf/v4-lane.css')

test('selector evaluator: html[data-motion] / :not() / media gating', () => {
  assert.equal(htmlMatches('html:not([data-motion="off"]) .a', 'reduced'), true)
  assert.equal(htmlMatches('html:not([data-motion="off"]) .a', 'off'), false)
  assert.equal(htmlMatches('html:not([data-motion="off"], [data-motion="reduced"]) .a', 'reduced'), false)
  assert.equal(htmlMatches('html:not([data-motion="off"], [data-motion="reduced"]) .a', 'full'), true)
  assert.equal(htmlMatches('html[data-motion="reduced"] .a', 'reduced'), true)
  assert.equal(htmlMatches('.mc-main .a', 'reduced'), true)
})

test('v4 lane keeps its full-motion animation starters (rain/scanline/entry behaviour unchanged)', () => {
  const starters = importantAnimationStarters(V4_LANE)
  const full = starters.filter(r => activeIn(r, { motion: 'full', osReduce: false }))
  const has = re => full.some(r => re.test(r.body))
  assert.ok(has(/v4-sweep[^;]*linear/), 'scanline sweep active in full')
  assert.ok(has(/animation-timeline:\s*scroll\(nearest block\)/), 'scanline scroll timeline active in full')
  assert.ok(has(/animation-timeline:\s*view\(\)/), 'native entry view timeline active in full')
  assert.ok(has(/animation:\s*var\(--v4-entry-name\)[^;]*backwards/), 'fallback .v4-seen entry active in full')
  assert.ok(full.some(r => r.conds.some(c => /max-width:\s*820px/.test(c)) && /view\(\)/.test(r.body)), 'mobile entry active in full')
})

for (const state of [
  { name: 'data-motion=reduced', motion: 'reduced', osReduce: false },
  { name: 'data-motion=off', motion: 'off', osReduce: false },
  { name: 'OS prefers-reduced-motion with data-motion=full', motion: 'full', osReduce: true },
  { name: 'OS prefers-reduced-motion with data-motion=reduced', motion: 'reduced', osReduce: true },
]) {
  test(`v4 lane: no !important animation starter can apply under ${state.name}`, () => {
    const live = importantAnimationStarters(V4_LANE).filter(r => activeIn(r, state))
    assert.deepEqual(live.map(r => `${r.conds.join(' > ')} :: ${r.sel}`), [])
  })
}

test('v4 lane no longer carries reduced-only entry variants (reduced now has no v4 motion)', () => {
  assert.doesNotMatch(strip(V4_LANE), /v4-(rise|fade)-reduced/)
})

// ---- OS reduced motion: no universal nonzero transition/animation duration ----
// A nonzero `transition-duration` on `*` gives every element (default transition-property: all) a real,
// finite transition object whenever an inherited property such as scrollbar-color changes.
test('OS prefers-reduced-motion universal rule uses zero durations, never a nonzero micro-duration', () => {
  const universal = allCss.flatMap(f => osReducedMotionRules(strip(read(f))).filter(r => r.sel.split(',').map(s => s.trim()).includes('*')).map(r => ({ f, ...r })))
  assert.ok(universal.some(r => r.f === 'app/globals.css'), 'globals.css keeps its OS reduced-motion universal rule')
  const g = universal.find(r => r.f === 'app/globals.css')
  assert.match(g.body, /(?:^|[;\s])transition-duration\s*:\s*0s\s*!important/)
  assert.match(g.body, /(?:^|[;\s])animation-duration\s*:\s*0s\s*!important/)
  assert.match(g.body, /(?:^|[;\s])animation-iteration-count\s*:\s*1\s*!important/)
  assert.match(g.body, /(?:^|[;\s])scroll-behavior\s*:\s*auto\s*!important/)
  const globalsOs = osReducedMotionRules(strip(globals))
  for (const { sel, body } of globalsOs) {
    for (const [, prop, value] of body.matchAll(/(animation-duration|transition-duration)\s*:\s*([^;!]+)/g)) {
      assert.match(value.trim(), /^0s$/, `${sel} { ${prop}: ${value.trim()} } is a nonzero OS-reduced duration`)
    }
  }
})

test('nothing in the app depends on transitionend / animationend events', () => {
  const found = []
  const walk = dir => {
    for (const name of readdirSync(join(root, dir))) {
      const rel = `${dir}/${name}`
      if (statSync(join(root, rel)).isDirectory()) walk(rel)
      else if (/\.(tsx?|jsx?|mjs|cjs|css)$/.test(name) && /(?:transition|animation)(?:end|cancel)/i.test(read(rel))) found.push(rel)
    }
  }
  for (const dir of ['app', 'components', 'lib', 'public']) walk(dir)
  assert.deepEqual(found, [])
})

// ---- launch film layout: the data row must wrap inside the film, not spill out of the viewport ----
const globalsRules = rules(strip(globals))
const ownRules = sel => globalsRules.filter(r => r.sel.split(',').map(s => s.trim()).includes(sel))
// the layout rule, not the reduced-motion end-state overrides that also name the same class
const baseRule = sel => {
  const base = ownRules(sel).filter(r => /(?:^|[;\s])(?:display|width)\s*:/.test(r.body))
  assert.equal(base.length, 1, `${sel} has exactly one layout rule`)
  return base[0]
}
const declaration = (body, prop) => (body.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`)) || [])[1]?.trim()

test('launch data row wraps within the film container', () => {
  const { body } = baseRule('.launch-data')
  assert.equal(declaration(body, 'flex-wrap'), 'wrap')
  assert.equal(declaration(body, 'max-width'), '100%')
  assert.match(declaration(body, 'row-gap') ?? '', /^\d+px$/)
  assert.ok(body.indexOf('row-gap') > body.indexOf('gap: clamp'), 'row-gap must follow the gap shorthand or it is overwritten')
})

test('launch chart is bounded by the space it has', () => {
  assert.equal(declaration(baseRule('.launch-chart').body, 'max-width'), '100%')
})

test('launch layout fix keeps original full-mode styling and does not clip or hide', () => {
  const row = baseRule('.launch-data')
  assert.equal(declaration(row.body, 'display'), 'flex')
  assert.equal(declaration(row.body, 'align-items'), 'flex-end')
  assert.equal(declaration(row.body, 'justify-content'), 'center')
  assert.equal(declaration(row.body, 'gap'), 'clamp(16px, 4vw, 34px)')
  assert.match(declaration(row.body, 'animation'), /^launch-fade 700ms ease 2400ms both$/)
  const chart = baseRule('.launch-chart')
  assert.equal(declaration(chart.body, 'width'), 'min(320px, 68vw)')
  assert.equal(declaration(chart.body, 'height'), '64px')
  assert.equal(declaration(chart.body, 'overflow'), 'visible')
  for (const sel of ['.launch-film', '.launch-data', '.launch-stat', '.launch-chart']) {
    for (const r of ownRules(sel)) {
      assert.doesNotMatch(r.body, /overflow(?:-x)?\s*:\s*(?:hidden|clip)|display\s*:\s*none|visibility\s*:\s*hidden|clip-path/, `${sel} must not hide or clip overflow`)
    }
  }
})
