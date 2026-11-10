import sharp from 'sharp'
const ROUTES = ['home','kanban','chat','calendar','github','costs','system','local-ai','memory','setup','pipeline','crew','deliverables','bots']
async function build(W, tw, out) {
  const th = Math.round(tw * (W === 1440 ? 900 / 1440 : 915 / 412))
  const cols = 5, gap = 8, rows = Math.ceil(ROUTES.length / cols)
  const W2 = cols * tw + (cols + 1) * gap, H2 = rows * th + (rows + 1) * gap
  const comps = []
  for (let i = 0; i < ROUTES.length; i++) {
    const buf = await sharp(`artifacts/2026-11-09/pass2-shots/${ROUTES[i]}-${W}.png`).resize(tw, th).toBuffer()
    const x = gap + (i % cols) * (tw + gap), y = gap + Math.floor(i / cols) * (th + gap)
    comps.push({ input: buf, top: y, left: x })
  }
  await sharp({ create: { width: W2, height: H2, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } }).composite(comps).toFile(out)
  console.log(`${out}  ${W2}x${H2}`)
}
await build(1440, 480, 'docs/screenshots/contact-1440-2026-11-09-pass2.png')
await build(412, 246, 'docs/screenshots/contact-412-2026-11-09-pass2.png')
