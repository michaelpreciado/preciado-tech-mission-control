'use client'

import { useLayoutEffect, useState } from 'react'

export function CountUp({ value, prefix = '', suffix = '', decimals = 0 }: {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
}) {
  const [progress, setProgress] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setProgress(0)
    const start = performance.now()
    let frame: number
    const tick = (now: number) => {
      const elapsed = Math.min((now - start) / 700, 1)
      setProgress(elapsed === 1 ? null : 1 - (1 - elapsed) ** 3)
      if (elapsed < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const formatted = (progress == null ? value : value * progress).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return <span className="mc-count">{prefix}{formatted}{suffix}</span>
}
