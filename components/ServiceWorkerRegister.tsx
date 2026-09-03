'use client'

import { useEffect } from 'react'

/**
 * Registers the PWA service worker (offline shell + static-asset caching).
 * Network-first for navigations; /api/* is never cached/intercepted, so live
 * data and SSE keep hitting the network. Installed only in production build.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registration failure must never break the dashboard */
    })
  }, [])
  return null
}
