/** Actual shelf component, fixture API only. No live Next service or external URL. */
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { deliverablesFixture } from './helpers/deliverables-fixture.mjs'
import { collectDeliverables, readDeliverable } from '../lib/pt/deliverables.ts'
import { sha256 } from '../lib/pt/artifact-files.ts'
const require = createRequire(import.meta.url), webpack = require('next/dist/compiled/webpack/webpack-lib')
const { chromium } = require('playwright')
const root = path.resolve(new URL('..',import.meta.url).pathname), output = path.resolve(root,'../logs/lane-04')
const temp = await fs.mkdtemp(path.join(os.tmpdir(),'pt-shelf-browser-'))
const fixture = await deliverablesFixture()
const write = (name,value) => fs.writeFile(path.join(temp,name),value)
await write('ts-loader.cjs',`const ts = require(${JSON.stringify(require.resolve('typescript'))});module.exports = function(source) { return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText }`)
await write('css-loader.cjs',`module.exports = function() { return '' }`)
await write('entry.tsx',`import React from 'react';import {createRoot} from 'react-dom/client';import {DeliverablesShelf} from ${JSON.stringify(root+'/components/DeliverablesShelf.tsx')};createRoot(document.getElementById('root')).render(<DeliverablesShelf/>);`)
await new Promise((resolve,reject) => webpack({ mode:'development',devtool:false,entry:path.join(temp,'entry.tsx'),output:{path:temp,filename:'bundle.js'},
  resolve:{extensions:['.tsx','.ts','.js','.mjs'],modules:[path.join(root,'node_modules')],alias:{'@':root}},
  module:{rules:[{test:/\.[jt]sx?$/,exclude:/node_modules/,use:path.join(temp,'ts-loader.cjs')},{test:/\.css$/,use:path.join(temp,'css-loader.cjs')}]},
},(error,stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({all:false,errors:true}))) : resolve()))
const bundle = await fs.readFile(path.join(temp,'bundle.js'),'utf8'), css = await fs.readFile(path.join(root,'components/deliverables.css'),'utf8')
const browser = await chromium.launch({headless:true})
const errors=[]
try {
  for (const mobile of [false,true]) {
    const original = await fs.readFile(path.join(fixture.report,'verified note.md'))
    const context = await browser.newContext({viewport:{width:mobile?390:1280,height:mobile?844:900},isMobile:mobile,hasTouch:mobile})
    const page = await context.newPage()
    page.on('pageerror',err => errors.push(err.message))
    await page.clock.install({time:new Date(fixture.options.now)})
    let denied = false
    await page.route('**/*',async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/deliverables') return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#05060a}*{box-sizing:border-box}</style><div id="root"></div>'})
      if (url.pathname === '/api/deliverables') return route.fulfill({status:denied?401:200,json:denied?{data:null}:await collectDeliverables(fixture.options)})
      if (url.pathname.startsWith('/api/deliverables/')) {
        try { return route.fulfill({json:await readDeliverable(url.pathname.split('/').pop(),url.searchParams.get('revision'),url.searchParams.get('evidenceRevision'),fixture.options)}) }
        catch (err) { return route.fulfill({status:err.status || 503,json:{data:null}}) }
      }
      return route.abort()
    })
    await page.goto('http://deliverables-fixture.test/deliverables')
    await page.addStyleTag({content:css}); await page.addScriptTag({content:bundle})
    const item = file => fixture.envelope.data.items.find(i => i.path === file)
    const click = file => page.locator(`[data-artifact-id="${item(file).id}"]`).click()
    await page.locator('[data-artifact-id]').first().waitFor()
    assert.equal(await page.locator('[data-artifact-id]').count(),fixture.envelope.data.count)
    await click('held/offer.html')
    await page.locator('pre').waitFor()
    assert.equal(await page.evaluate(() => window.__artifactExecuted),undefined)
    assert.ok((await page.locator('pre').textContent()).includes('<script>'))
    assert.equal(sha256(await page.locator('pre').textContent()),item('held/offer.html').artifactRevision)
    assert.ok((await page.getByLabel('Artifact review').textContent()).includes('approval-held'))
    assert.equal(await page.locator('iframe').count(),0)
    await page.screenshot({path:path.join(output,mobile?'shelf-mobile.png':'shelf-desktop.png')})
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await click('Clients/A & B/Terms #1.md')
    await page.getByRole('link',{name:'Open in Obsidian'}).waitFor()
    assert.match(await page.getByRole('link',{name:'Open in Obsidian'}).getAttribute('href'),/Terms%20%231/)
    await click('verified note.md'); await page.locator('pre').waitFor()
    await fixture.write('verified note.md','# Changed after review\n')
    await page.clock.fastForward(61_000)
    await page.waitForFunction(id => document.querySelector(`[data-artifact-id="${id}"] [data-state]`)?.getAttribute('data-state') === 'awaiting-verification',item('verified note.md').id)
    await page.waitForFunction(() => document.querySelector('pre')?.textContent === '# Changed after review\n')
    denied=true; await page.clock.fastForward(61_000)
    await page.getByRole('alert').waitFor()
    assert.equal(await page.locator('pre').count(),0); assert.equal(await page.locator('[data-artifact-id]').count(),0)
    await fs.writeFile(path.join(fixture.report,'verified note.md'),original)
    await context.close()
    console.log(`${mobile?'Mobile':'Desktop'} shelf: states, source hash, inert HTML, Obsidian URI, edited verification, auth revocation, viewport fit PASS`)
  }
  assert.deepEqual(errors,[])
} finally { await browser.close(); await fs.rm(temp,{recursive:true,force:true}); await fs.rm(fixture.temp,{recursive:true,force:true}) }
