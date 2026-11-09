'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { apiUrl } from '@/lib/api-base'
import { Prompt } from '@/components/ui'
import styles from '@/components/login.module.css'

/**
 * /login — session login for non-loopback deployments (MC_AUTH_PASSWORD set).
 * A thin standalone pane; the app Shell still renders behind it, so an
 * unauthenticated visitor can reach this page even though the shell's live data
 * calls 401 until they sign in.
 */
export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'checking' | 'ready' | 'signing-in' | 'error'>('checking')
  const [error, setError] = useState<string | null>(null)
  const [authed, setAuthed] = useState(false)
  const [authEnabled, setAuthEnabled] = useState(true)

  const nextPath = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('next') || '/') : '/'

  useEffect(() => {
    let alive = true
    fetch(apiUrl('/api/auth/check'), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return
        const enabled = j?.authEnabled !== false
        setAuthEnabled(enabled)
        setAuthed(!!j?.ok)
        if (j?.ok) {
          router.replace(nextPath)
          return
        }
        if (!enabled) setError('Authentication is not enabled on this server.')
        setStatus('ready')
      })
      .catch(() => {
        if (alive) {
          setAuthEnabled(true)
          setStatus('ready')
        }
      })
    return () => {
      alive = false
    }
  }, [router, nextPath])

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!password.trim()) return
      setStatus('signing-in')
      setError(null)
      try {
        const res = await fetch(apiUrl('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        })
        const j = await res.json().catch(() => ({}))
        if (res.ok) {
          router.replace(nextPath)
        } else {
          setError((j as { error?: string }).error || 'Sign-in failed.')
          setStatus('ready')
        }
      } catch {
        setError('Could not reach the server.')
        setStatus('ready')
      }
    },
    [password, router, nextPath],
  )

  const signOut = useCallback(async () => {
    try {
      await fetch(apiUrl('/api/auth/logout'), { method: 'POST' })
    } finally {
      setAuthed(false)
      setStatus('ready')
    }
  }, [])

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <Image className={styles.logo} src="/brand/preciado-tech-logo.jpg" alt="Preciado Tech" width={64} height={64} priority />
        <hr className={styles.rule} aria-hidden="true" />
        <Prompt host="friday" cmd="login" />
        <div className={styles.brand}>F.R.I.D.A.Y.</div>
        <div className={styles.kicker}>MISSION CONTROL</div>

        {status === 'checking' ? (
          <p className={styles.muted}>checking access…</p>
        ) : authed ? (
          <>
            <p className={styles.muted}>You are signed in.</p>
            <div className={styles.actions}>
              <button type="button" className={styles.btn} onClick={() => router.replace(nextPath)}>
                Return to dashboard
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={signOut}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="mc-login-password" className={styles.label}>
              Password
            </label>
            <input
              id="mc-login-password"
              className={styles.input}
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={status === 'signing-in'}
              placeholder="••••••••"
            />
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.btn} disabled={status === 'signing-in' || !authEnabled}>
              {status === 'signing-in' ? 'Signing in…' : 'Sign in'}
            </button>
          </>
        )}
      </form>
    </main>
  )
}