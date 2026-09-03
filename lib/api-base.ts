/**
 * Client-side API base resolution (portable/cloud mode).
 *
 * The dashboard UI is served from the same origin that answers /api/* in the
 * default local/Tailscale layout. In cloud mode the page may be served from a
 * different origin (or behind a relay prefix), so every client fetch/EventSource
 * must resolve the API base instead of hardcoding '/api/...'.
 *
 * Resolution order (highest wins):
 *   1. window.__MC_API_BASE__  — injected per request by layout.tsx from the
 *      server env MC_API_BASE (runtime knob, no rebuild; the cloud profile sets
 *      MC_API_BASE=/api/upstream so the /api/upstream/[...path] relay proxies
 *      to the home instance).
 *   2. NEXT_PUBLIC_API_BASE    — build-time knob (baked into the bundle; use
 *      for static/CDN hosts that can't run the server-side injector).
 *   3. '' — same-origin default; every deployment's safe fallback.
 *
 * A base may be a path prefix ('/api/upstream') or a full origin
 * ('https://mc.example.com'); never set a cross-origin base without also
 * extending connect-src in next.config.ts.
 */
export function runtimeApiBase(): string {
  if (typeof window !== 'undefined') {
    const injected = (window as unknown as { __MC_API_BASE__?: string }).__MC_API_BASE__
    if (injected) return injected.replace(/\/+$/, '')
  }
  return (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/+$/, '')
}

/** Resolve an absolute API path against the configured base. */
export function apiUrl(path: string): string {
  const base = runtimeApiBase()
  if (!base) return path
  const rest = path.startsWith('/') ? path : `/${path}`
  return `${base}${rest}`
}

/** Wrapper for same-origin relative fetches that must not be cached. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), { ...init, cache: 'no-store' })
}
