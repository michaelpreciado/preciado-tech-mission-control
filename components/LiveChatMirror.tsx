'use client'

import { useEffect } from 'react'
import { apiFetch } from '@/lib/api-base'

/** Live changes refresh the single conversation list; there is no second thread viewer. */
export default function LiveChatMirror({ onActivity }: { onActivity: () => void }) {
  useEffect(() => {
    let alive = true
    let since = 0
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    const poll = async () => {
      try {
        if (document.visibilityState !== 'visible') return
        const response = await apiFetch(`/api/chats/live?since=${since}`, { signal: controller.signal })
        if (!response.ok) return // The main list owns visible fetch errors and retry.
        const body = await response.json()
        if (!alive) return
        if (since && body.sessions?.length) onActivity()
        since = body.generatedAt || since
      } catch { /* The authoritative conversation endpoint still polls and reports errors. */ }
      finally { if (alive) timer = setTimeout(() => void poll(), 5000) }
    }
    void poll()
    return () => { alive = false; controller.abort(); clearTimeout(timer) }
  }, [onActivity])
  return null
}
