'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-base'
import { CADENCE, type E } from '@/lib/pt/contract'
import type { PipelineRadar } from '@/lib/pt/pipeline'
import { compatibleEnvelope, presentationState } from '@/lib/pt/presentation-state.mjs'

export function usePipelineRadar(enabled = true) {
  const [envelope, setEnvelope] = useState<E<PipelineRadar> | null>(null)
  const [error, setError] = useState('')
  const [clock, setClock] = useState(Date.now())
  const version = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++version.current
    try {
      const response = await apiFetch('/api/pipeline?view=radar', { cache: 'no-store' })
      const result = await response.json()
      if (!compatibleEnvelope(result)) throw new Error(response.status === 401 ? 'Access denied' : 'Incompatible pipeline snapshot')
      if (response.status === 401 || response.status === 403) throw new Error('Access denied')
      if (!response.ok || result.data === null) throw new Error('Pipeline source unavailable')
      if (request === version.current) { setEnvelope(result); setError(''); setClock(Date.now()) }
    } catch (err) {
      if (request === version.current) setError(err instanceof Error ? err.message : 'Pipeline unavailable')
    }
  }, [])
  useEffect(() => {
    if (!enabled) return
    void refresh()
    const poll = window.setInterval(() => { if (!document.hidden) void refresh() }, CADENCE.pipeline.pollMs)
    const tick = window.setInterval(() => setClock(Date.now()), 1000)
    return () => { clearInterval(poll); clearInterval(tick); ++version.current }
  }, [enabled, refresh])
  const presentation = presentationState(envelope, clock, !!error, error === 'Access denied')
  return { envelope: presentation.error ? null : envelope, error: presentation.error ?? error, refresh, presentation }
}
