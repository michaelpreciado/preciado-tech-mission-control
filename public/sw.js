/* F.R.I.D.A.Y. Mission Control — PWA service worker (foundation for Android/TWA).
 *
 * Conservative by design so it can never break live data or SSE:
 *   - /api/* requests are NEVER intercepted → always network.
 *   - Navigations are network-first with an offline fallback to the cached shell.
 *   - Static hashed assets (_next/static) are stale-while-revalidate.
 *   - Bump this comment/cache name to force a clean rollout.
 */
const CACHE = 'friday-mc-v1'
const API_PREFIXES = ['/api/']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add('/').catch(() => {})),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (API_PREFIXES.some((p) => url.pathname.startsWith(p))) return // never cache /api

  const { pathname } = url
  const isNavigation = req.mode === 'navigate'
  const isStaticAsset = pathname.startsWith('/_next/static/') || /\.(?:png|jpg|svg|webp|ico|woff2?|css|js)$/.test(pathname) && pathname !== '/rain.js'

  if (isNavigation) {
    // Network-first: return the live shell; fall back to the cached app on failure.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/index-offline', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('/') || caches.match('/index-offline')),
    )
    return
  }

  if (isStaticAsset) {
    // Stale-while-revalidate: serve cached instantly, refresh in background.
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
            }
            return res
          })
          .catch(() => cached)
        return cached || network
      }),
    )
  }
  // Other same-origin GETs (manifest, favicon, pages) go straight to network.
})