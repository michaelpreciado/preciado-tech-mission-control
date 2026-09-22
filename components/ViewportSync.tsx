'use client'

import { useEffect } from 'react'

/**
 * Keep the app shell tied to the currently visible viewport. Mobile browsers
 * resize `visualViewport` when the IME opens, while `100dvh` can remain tied
 * to the layout viewport for a frame (or for the lifetime of the keyboard).
 * Root-level sizing lets route content, including the chat composer, respond
 * to the same measurement and restores the full shell when the IME closes.
 */
export function ViewportSync() {
  useEffect(() => {
    const root = document.documentElement
    let frame = 0

    const sync = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const viewport = window.visualViewport
        const height = Math.max(0, Math.round(viewport?.height ?? window.innerHeight))
        root.style.setProperty('--mc-visual-height', `${height}px`)
        root.style.setProperty('--mc-visual-offset-top', `${Math.round(viewport?.offsetTop ?? 0)}px`)
        root.dataset.keyboard = height < window.innerHeight - 80 ? 'open' : 'closed'
      })
    }

    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)
    window.addEventListener('pageshow', sync)
    document.addEventListener('visibilitychange', sync)
    window.visualViewport?.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('scroll', sync)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
      window.removeEventListener('pageshow', sync)
      document.removeEventListener('visibilitychange', sync)
      window.visualViewport?.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('scroll', sync)
      root.style.removeProperty('--mc-visual-height')
      root.style.removeProperty('--mc-visual-offset-top')
      delete root.dataset.keyboard
    }
  }, [])

  return null
}
