'use client'

import { useEffect } from 'react'
import { startMotionVisibility } from '@/lib/motion-visibility'
import './MotionVisibility.css'

export function MotionVisibility() {
  useEffect(() => startMotionVisibility({
    root: document.documentElement,
    body: document.body,
    doc: document,
    IO: IntersectionObserver,
    MO: MutationObserver,
  }), [])
  return null
}
