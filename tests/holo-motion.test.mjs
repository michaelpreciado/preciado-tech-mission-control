import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ring = readFileSync(new URL('../components/HoloRing.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../components/HomeWorkspace.module.css', import.meta.url), 'utf8')

test('HoloRing moves HTML texture layers instead of SVG groups', () => {
  assert.match(ring, /function RingLayer/)
  assert.match(ring, /<div className=\{`\$\{styles.holoLayer\}/)
  assert.doesNotMatch(ring, /<animate|<g\b/)
  assert.match(ring, /data-motion-widget/)
})

test('HoloRing keyframes animate only transform and opacity', () => {
  const frames = [...css.matchAll(/@keyframes holo\w+\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)]
  assert.ok(frames.length >= 9)
  for (const [, body] of frames) {
    for (const [, property] of body.matchAll(/([\w-]+)\s*:/g)) {
      assert.ok(['transform', 'opacity'].includes(property), property)
    }
  }
})

test('HoloRing preserves static fallback for system and explicit reduced motion', () => {
  assert.match(css, /prefers-reduced-motion: reduce/)
  for (const mode of ['reduced', 'off']) {
    assert.ok(css.includes(`html[data-motion='${mode}'] .holoPixelFrames`))
    assert.ok(css.includes(`html[data-motion='${mode}'] .holoPixelReduced`))
  }
})
