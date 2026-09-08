// Run against an existing dev server and Chromium --remote-debugging-port=9332.
// Uses only Node built-ins. Writes a screenshot and observed browser checks here.
import { writeFile } from 'node:fs/promises'
const pages = await (await fetch('http://127.0.0.1:9332/json')).json()
const socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl)
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
let serial = 0
const pending = new Map(), errors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text)
  if (message.id) { const p = pending.get(message.id); pending.delete(message.id); message.error ? p.reject(message.error) : p.resolve(message.result) }
})
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value
await call('Runtime.enable'); await call('Log.enable'); await call('Page.enable')
await call('Emulation.setDeviceMetricsOverride', { width: 1560, height: 1240, deviceScaleFactor: 1, mobile: false })
await call('Page.navigate', { url: 'http://localhost:4182/threed-preview' })
for (let i = 0; i < 90; i++) {
  if (await evaluate(`document.querySelectorAll('.a2-gallery canvas[data-draw-calls="2"]').length===6`)) break
  await new Promise(resolve => setTimeout(resolve, 1000))
}
await evaluate(`document.querySelector('.a2-gallery').scrollIntoView()`)
const report = { desktop: await evaluate(`({canvases:document.querySelectorAll('.a2-gallery canvas').length, draws:[...document.querySelectorAll('.a2-gallery canvas')].map(c=>c.dataset.drawCalls),fallback:document.body.innerText.includes('3D preview unavailable')})`) }
await evaluate(`document.querySelector('[aria-label="Activate small glass button"]').click(); document.querySelector('.a2-next').click()`)
await new Promise(resolve => setTimeout(resolve, 500))
report.interactions = await evaluate(`({button:document.querySelector('.a2-gallery [role=status]').textContent,focus:document.querySelector('.a2-next').previousElementSibling.textContent})`)
report.afterInteractions = await evaluate(`({fallback:document.querySelector('.a2-gallery').innerText.includes('3D preview unavailable'),draws:[...document.querySelectorAll('.a2-gallery canvas')].map(c=>c.dataset.drawCalls)})`)
await evaluate(`document.querySelector('[aria-label="Activate medium glass button"]').focus()`)
await call('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' })
await call('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
await new Promise(resolve => setTimeout(resolve, 150))
report.keyboard = await evaluate(`document.querySelector('.a2-gallery [role=status]').textContent`)
await evaluate(`document.activeElement.blur()`)
const screenshot = await call('Page.captureScreenshot', { format: 'png' })
await writeFile(new URL('./preview-desktop.png', import.meta.url), Buffer.from(screenshot.data, 'base64'))
await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await new Promise(resolve => setTimeout(resolve, 800))
report.mobile = await evaluate(`({width:document.querySelector('.a2-gallery').clientWidth,scrollWidth:document.querySelector('.a2-gallery').scrollWidth,draws:[...document.querySelectorAll('.a2-gallery canvas')].map(c=>c.dataset.drawCalls)})`)
await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
report.reducedMotion = await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`)
report.errors = errors
await writeFile(new URL('./browser-checks.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
socket.close()
if (report.keyboard !== 'M PLATE ENGAGED' || report.desktop.canvases !== 6 || report.desktop.fallback || report.afterInteractions.fallback || report.desktop.draws.some(n => n !== '2') || errors.some(e => /Shader|THREE|Error compiling/.test(e))) process.exitCode = 1
