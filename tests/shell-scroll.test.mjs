import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

test('main pane stays bounded when fixed navigation changes the shell to block', () => {
  const rule = css.match(/^\.mc-shell > \.mc-main\s*\{([^}]+)\}/m)?.[1]
  assert.ok(rule, 'shared shell child sizing must apply outside breakpoint overrides')
  assert.match(rule, /\bheight:\s*100%;/)
  assert.match(rule, /\bmin-height:\s*0;/)
  assert.match(rule, /\bbox-sizing:\s*border-box;/)
})

test('main pane retains native vertical scrolling', () => {
  const rule = css.match(/^\.mc-main\s*\{([^}]+)\}/m)?.[1]
  assert.ok(rule)
  assert.match(rule, /\boverflow-y:\s*auto;/)
  assert.match(rule, /\boverscroll-behavior-y:\s*contain;/)
})
