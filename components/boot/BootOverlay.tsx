'use client'

import { useEffect, useState } from 'react'
import { BootSequence } from './BootSequence'

const SESSION_KEY = 'mc:boot:w2i'

export function BootOverlay() {
  const [phase, setPhase] = useState<'hidden' | 'active' | 'leaving'>('hidden')

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches) return
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return
      sessionStorage.setItem(SESSION_KEY, 'seen')
    } catch {
      // Without a reliable session gate, leave the shell immediately available.
      return
    }
    setPhase('active')
  }, [])

  useEffect(() => {
    if (phase === 'hidden') return
    if (phase === 'leaving') {
      const timer = window.setTimeout(() => setPhase('hidden'), 300)
      return () => window.clearTimeout(timer)
    }
    const dismiss = () => setPhase('leaving')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const reduce = () => { if (motion.matches) setPhase('hidden') }
    const timer = window.setTimeout(dismiss, 1200)
    window.addEventListener('keydown', dismiss)
    motion.addEventListener('change', reduce)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', dismiss)
      motion.removeEventListener('change', reduce)
    }
  }, [phase])

  if (phase === 'hidden') return null
  return (
    <div className={`boot-overlay${phase === 'leaving' ? ' boot-leaving' : ''}`} onClick={() => setPhase('leaving')}>
      <BootSequence />
      <span className="boot-skip">CLICK / ANY KEY TO SKIP</span>
    </div>
  )
}
