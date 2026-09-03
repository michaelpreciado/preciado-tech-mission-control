/**
 * Session-cookie auth for non-loopback Mission Control access (portable/cloud
 * deployments, PWA/TWA on Android). Isomorphic: uses only Web Crypto + global
 * btoa/atob, so it runs identically in the Edge middleware and in Node route
 * handlers — no node: imports.
 *
 * A session is an HMAC-SHA256(signed) bearer held in an httpOnly, SameSite
 * cookie. Enabling: set MC_AUTH_PASSWORD (the UI login password). The signing
 * secret resolves MC_SESSION_SECRET > INTERNAL_API_SECRET > MC_AUTH_PASSWORD.
 * With no password set, auth is disabled and the app keeps its legacy open +
 * loopback/trusted-IP behavior (writes stay gated per-route).
 */

export const SESSION_COOKIE = 'mc_session'
export const SESSION_TTL_S = 60 * 60 * 24 * 30 // 30 days

export function authPassword(): string {
  return process.env.MC_AUTH_PASSWORD ?? ''
}

export function authEnabled(): boolean {
  return authPassword() !== ''
}

export function sessionSecret(): string {
  return (
    process.env.MC_SESSION_SECRET ||
    process.env.INTERNAL_API_SECRET ||
    process.env.MC_AUTH_PASSWORD ||
    ''
  )
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  const data = new TextEncoder().encode(`friday-session-v1:${secret}`)
  return crypto.subtle.importKey('raw', data, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_')
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
    const out = new Uint8Array(new ArrayBuffer(bin.length))
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/** Issue a fresh session token (base64url `v1.<exp>.<nonce>.<sig>`). */
export async function createSessionToken(): Promise<string> {
  const secret = sessionSecret()
  if (!secret) throw new Error('session auth not configured')
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S
  const nonce = crypto.getRandomValues(new Uint8Array(16))
  const payload = `v1.${exp}.${bytesToB64(nonce)}`
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(payload))
  return `${payload}.${bytesToB64(new Uint8Array(sig))}`
}

/** Verify (constant-time via subtle.verify + expiry check). */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') return false
  const [, expStr, nonceB64, sigB64] = parts
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  const secret = sessionSecret()
  if (!secret) return false
  const sig = b64ToBytes(sigB64)
  if (!sig) return false
  const payload = `v1.${expStr}.${nonceB64}`
  return crypto.subtle.verify('HMAC', await hmacKey(secret), sig, new TextEncoder().encode(payload))
}

/** Constant-time SHA-256 comparison of two plaintext strings (for the login form). */
export async function secureEquals(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(a)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(b)),
  ])
  const A = new Uint8Array(da)
  const B = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i]
  return diff === 0
}

/** Cookie options; `secure` is set only for https so HTTP Tailscale deploys work. */
export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_TTL_S,
  }
}

/** True if the request carries a valid session cookie. */
export async function hasValidSession(req: { cookies: { get(name: string): { value: string } | undefined } }): Promise<boolean> {
  if (!authEnabled()) return true
  const cookie = req.cookies.get(SESSION_COOKIE)?.value
  return verifySessionToken(cookie)
}
