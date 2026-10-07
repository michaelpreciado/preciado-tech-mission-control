/** Isolated browser QA for the real palette + mobile trigger, with fixture APIs.
 * No Next service, business readers, live UI or watched directories are used. */
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { buildTokenCss, buildFridayThemeCss, buildDensityCss } from '../lib/tokens.ts'
const require = createRequire(import.meta.url)
const webpack = require('next/dist/compiled/webpack/webpack-lib')
const { chromium } = require('playwright')
const root = path.resolve(new URL('..', import.meta.url).pathname)
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pt-command-browser-'))
const output = path.resolve(root, '../logs/lane-03')
await fs.mkdir(output, { recursive: true })
const write = (name, content) => fs.writeFile(path.join(temp, name), content)
await write('ts-loader.cjs', `const ts = require(${JSON.stringify(require.resolve('typescript'))});module.exports = function(source) { return ts.transpileModule(source,{ compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText }`)
await write('css-loader.cjs', `module.exports = function() { return 'export default new Proxy({}, { get: (_, key) => key })' }`)
await write('navigation.js', `export const usePathname = () => '/'; export const useRouter = () => ({ push: path => window.__routes.push(path) });`)
await write('link.jsx', `import React from 'react';export default function Link({href,children,...props}) {return <a href={href} {...props}>{children}</a>}`)
await write('ui.js', `export const useUiSettings = () => ({hiddenTabs:[],tabOrder:[]})`)
await write('kanban.js', `export const useKanbanSnapshot = () => ({summary:{needsYou:0}})`)
await write('sidebar.js', `export const FOLD_INNER_MEDIA_QUERY = '(min-width:720px) and (max-width:1100px)'`)
await write('entry.tsx', `import React from 'react';import {createRoot} from 'react-dom/client';import {CommandPalette} from ${JSON.stringify(root+'/components/CommandPalette.tsx')};import {MobileChrome} from ${JSON.stringify(root+'/components/MobileChrome.tsx')};window.__routes=[];createRoot(document.getElementById('root')).render(<><button id="launcher" onClick={() => window.dispatchEvent(new Event('mc:open-cmdp'))}>Commands</button><main>Fixture workspace</main><CommandPalette/><MobileChrome/></>)`)
const config = {
  plugins: [new webpack.DefinePlugin({'process.env.NEXT_PUBLIC_API_BASE': JSON.stringify('')})],
  mode: 'development', devtool: false, entry: path.join(temp, 'entry.tsx'),
  output: { path: temp, filename: 'bundle.js' },
  resolve: { extensions: ['.tsx','.ts','.jsx','.js','.mjs'], modules: [path.join(root,'node_modules')], alias: {
    '@': root, 'next/navigation$': path.join(temp,'navigation.js'), 'next/link$': path.join(temp,'link.jsx'),
    [path.join(root,'components/ui-settings')]: path.join(temp,'ui.js'),
    [path.join(root,'components/KanbanSnapshot')]: path.join(temp,'kanban.js'),
    [path.join(root,'components/Sidebar')]: path.join(temp,'sidebar.js'),
  } },
  module: { rules: [ { test: /\.[jt]sx?$/, exclude: /node_modules/, use: path.join(temp,'ts-loader.cjs') }, {test:/\.css$/,use:path.join(temp,'css-loader.cjs')} ] },
}
await new Promise((resolve,reject) => webpack(config,(err,stats) => err || stats.hasErrors() ? reject(err || Error(stats.toString({all:false,errors:true}))) : resolve()))
const bundle = await fs.readFile(path.join(temp,'bundle.js'),'utf8')
const styles = (await Promise.all(['app/globals.css','app/styles/fold.css','app/vf/v4-lane.css','app/vf/cyberpunk.css','app/w2l.css','app/styles/matrix-blue.css','components/MobileChrome.module.css'].map(f => fs.readFile(path.join(root,f),'utf8')))).join('\n')
const tokens = buildTokenCss() + buildFridayThemeCss() + buildDensityCss()
const cases = JSON.parse(await fs.readFile(path.join(root,'tests/pt-parity/command-envelopes.json'),'utf8'))
const browser = await chromium.launch({headless:true})
const errors=[]
try {
  for (const mobile of [false,true]) {
    const context = await browser.newContext({viewport:{width:mobile?390:1280,height:mobile?844:900},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'})
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({time:new Date(cases[0].now)})
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/commands') return route.fulfill({json:cases[0].envelope})
      if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="friday" data-motion="reduced"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'})
      return route.abort()
    })
    await page.goto('http://command-fixture.test/')
    await page.addStyleTag({content:styles + '\n' + tokens})
    await page.addScriptTag({content:bundle})
    await page.locator('#launcher').waitFor()
    if (mobile) {
      await page.getByRole('button',{name:'More',exact:true}).click()
      await page.getByRole('button',{name:'Open command palette',exact:true}).click()
    } else {
      await page.locator('#launcher').focus()
      await page.keyboard.press('Control+k')
    }
    const search = page.getByRole('combobox')
    await search.waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox')
    await page.waitForFunction(() => document.querySelector('[data-command-id="pipeline"]')?.getAttribute('aria-disabled') === 'false')
    assert.equal(await page.getByRole('option').count(),4)
    assert.deepEqual(await page.locator('.cmdp-group').allTextContents(),['Web Development','AI Solutions','Tech Advisory'])
    for (const id of ['command']) {
      const row = page.locator(`[data-command-id="${id}"]`)
      assert.equal(await row.getAttribute('aria-disabled'),'true')
      assert.match(await row.innerText(),/Disabled · destination_not_implemented/)
      await row.click({force:true})
      await page.keyboard.press('Enter')
      assert.deepEqual(await page.evaluate(() => window.__routes),[])
    }
    await search.fill('Tech Advisory')
    assert.equal(await page.getByRole('option').count(),1)
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate(() => window.__routes),[])
    await page.mouse.move(1,1)
    await search.fill('')
    await page.waitForFunction(() => document.querySelector('[data-command-id="pipeline"]')?.getAttribute('aria-selected') === 'true')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),'Close command palette')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')),'combobox')
    assert.equal(await page.locator('.cmdp').evaluate(el => getComputedStyle(el).animationName),'none')
    assert.notEqual(await page.locator('.cmdp-label').first().evaluate(el => getComputedStyle(el).color), 'rgb(0, 0, 0)')
    assert.ok(await page.locator('.cmdp').evaluate(el => el.getBoundingClientRect().right <= innerWidth))
    await page.screenshot({path:path.join(output,mobile?'command-mobile.png':'command-desktop.png')})
    await page.keyboard.press('ArrowDown') // Lane 04 now has a staged page.
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate(() => window.__routes),['/deliverables'])
    await page.getByRole('dialog',{name:'Command palette'}).waitFor({state:'hidden'})
    await page.keyboard.press('Control+k')
    await search.waitFor()
    await page.mouse.move(1,1)
    await search.fill('Pipeline')
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate(() => window.__routes),['/deliverables','/pipeline'])
    await page.getByRole('dialog',{name:'Command palette'}).waitFor({state:'hidden'})
    await page.keyboard.press('Control+k')
    await search.waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog',{name:'Command palette'}).waitFor({state:'hidden'})
    if (!mobile) assert.equal(await page.evaluate(() => document.activeElement?.id),'launcher')
    console.log(`${mobile?'Mobile More trigger':'Desktop Ctrl+K'}: focus, groups, disabled click/Enter, navigation, Escape, Tab trap, reduced motion, fit PASS`)
    await context.close()
  }
  assert.deepEqual(errors,[])
} finally { await browser.close() }
