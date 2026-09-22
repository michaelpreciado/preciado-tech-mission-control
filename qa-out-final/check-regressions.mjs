import { chromium } from 'playwright'
const base = 'http://127.0.0.1:4175'
const browser = await chromium.launch()
const result = {}
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true })
const page = await context.newPage()
await page.goto(base + '/chat', { waitUntil: 'networkidle' })
await page.locator('button').filter({ hasText: 'SESSIONS' }).click()
await page.getByRole('button', { name: 'New chat', exact: true }).click()
await page.waitForTimeout(300)
const mobileNav = page.locator('.mc-mobile-nav')
await page.setViewportSize({ width: 412, height: 560 })
await page.evaluate(() => { document.documentElement.dataset.keyboard = 'open' })
await page.waitForTimeout(200)
result.phone = await page.evaluate(() => {
  const input = document.querySelector('textarea')?.getBoundingClientRect()
  const nav = document.querySelector('.mc-mobile-nav')?.getBoundingClientRect()
  const main = document.querySelector('.mc-main')
  const pane = document.querySelector('[class*="threadPane"]')
  const composer = document.querySelector('[class*="composerBar"]')
  const head = document.querySelector('[class*="pageHead"]')
  return { textareaBottom: input?.bottom ?? null, navTop: nav?.top ?? null, viewport: innerHeight, mainPaddingBottom: main ? getComputedStyle(main).paddingBottom : null, mainHeight: main?.getBoundingClientRect().height ?? null, pane: pane?.getBoundingClientRect().toJSON() ?? null, composer: composer?.getBoundingClientRect().toJSON() ?? null, head: head?.getBoundingClientRect().toJSON() ?? null }
})
await page.setViewportSize({ width: 412, height: 915 })
await page.waitForTimeout(200)
result.phoneRestored = await page.evaluate(() => ({ viewport: innerHeight, textareaBottom: document.querySelector('textarea')?.getBoundingClientRect().bottom ?? null }))
await context.close()

const tabletCtx = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true })
const tablet = await tabletCtx.newPage()
await tablet.goto(base + '/chat', { waitUntil: 'networkidle' })
await tablet.locator('button').filter({ hasText: 'SESSIONS' }).click()
await tablet.getByLabel('Conversations').getByRole('button', { name: 'New chat', exact: true }).click()
result.tablet = await tablet.evaluate(() => {
  const shell = document.querySelector('[data-stage]')
  const side = shell?.querySelector('[class*="sidebar"]')?.getBoundingClientRect()
  const thread = shell?.querySelector('[class*="thread"]')?.getBoundingClientRect()
  return { stage: shell?.getAttribute('data-stage'), sidebar: side ? { display: getComputedStyle(shell.querySelector('[class*="sidebar"]')).display, width: side.width } : null, thread: thread ? { width: thread.width } : null, shellWidth: shell?.getBoundingClientRect().width }
})

const requests = []
await tablet.route('**/api/chat', async route => {
  if (route.request().method() === 'POST') {
    requests.push(JSON.parse(route.request().postData() || '{}'))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'mock reply' }) })
  } else await route.continue()
})
await tablet.getByLabel('AI model for this chat').selectOption({ label: /gemma4:12b/i }).catch(async () => {
  const select = tablet.getByLabel('AI model for this chat')
  await select.selectOption({ value: (await select.locator('option').evaluateAll(options => options.find(option => option.textContent?.includes('gemma4:12b'))?.getAttribute('value') || '')) })
})
await tablet.locator('textarea').fill('probe')
await tablet.getByRole('button', { name: 'Send', exact: true }).click()
await tablet.waitForTimeout(300)
result.picker = { option: await tablet.getByLabel('AI model for this chat').inputValue(), request: requests.at(-1) ?? null, reply: await tablet.getByText('mock reply').count() }
console.log(JSON.stringify(result, null, 2))
await browser.close()
