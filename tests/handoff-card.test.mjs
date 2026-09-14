import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith('/components/HandoffCard.tsx')) return {
    format: 'module', shortCircuit: true,
    source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
    }).outputText,
  }
  return nextLoad(url, context)
} })
const { HandoffCard } = await import('../components/HandoffCard.tsx')
test('inline system card renders running, done and failed evidence safely', () => {
  for (const state of ['running', 'done', 'failed']) {
    const html = renderToStaticMarkup(React.createElement(HandoffCard, { message: {
      id: 1, role: 'system', state, task: '<script>unsafe</script>',
      ...(state !== 'running' ? { report: { ok: state === 'done', exitCode: state === 'done' ? 0 : 7,
        diffStat: 'file.txt | 1 +', outputTail: 'last output' } } : {}),
    } }))
    assert.ok(html.includes(`data-handoff-state="${state}"`))
    assert.match(html, /Handoff result · Codex/)
    assert.match(html, /not a resumed session/)
    assert.ok(!html.includes('<script>'))
    if (state !== 'running') {
      assert.match(html, /file.txt \| 1 \+/)
      assert.match(html, /last output/)
    }
  }
})
