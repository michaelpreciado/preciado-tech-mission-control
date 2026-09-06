'use client'

/**
 * CoreHalo — the Home command-core motif.
 *
 * A pure-CSS sonar scope that lives inside `.mc-home-coreorb-holder`: three
 * concentric radar rings that ping outward, a slow conic sweep, a breathing
 * centre, a drifting scanline and a faint field grid. It is decoration only —
 * it reads one derived bit of live state (is any crew agent working right
 * now) to shift hue from a dim idle blue to an energetic bright one, and
 * touches no data, API or logic.
 *
 * The legacy Home-core instrument is retained for lightweight reuse.
 *
 * Motion contract (mirrors the v1 lane):
 *  - `prefers-reduced-motion` → static frame (CSS media query).
 *  - app motion setting reduced/off → static frame (`is-static`).
 *  - `document.hidden` → animations paused (`is-paused`), zero main-thread
 *    cost while backgrounded.
 *  - all animation is compositor-only (transform / opacity), no per-frame JS.
 */
import { useEffect, useState } from 'react'
import { useLiveData } from '../LiveDataProvider'
import { useUiSettings } from '../ui-settings'
import { wantsStaticMotion } from '@/lib/motion-pref'
import '../../app/vf/v1-core.css'

export function CoreHalo() {
  const { data } = useLiveData()
  const { motion } = useUiSettings()
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const sync = () => setHidden(document.hidden)
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  const active = (data?.crew ?? []).some(c => c.status === 'active' || c.status === 'on-demand')
  const cls = [
    'v1-corehalo',
    wantsStaticMotion(motion) ? 'is-static' : '',
    hidden ? 'is-paused' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} data-active={active ? '' : undefined} aria-hidden="true">
      <span className="v1-corehalo-grid" />
      <span className="v1-corehalo-ring" />
      <span className="v1-corehalo-ring" />
      <span className="v1-corehalo-ring" />
      <span className="v1-corehalo-sweep" />
      <span className="v1-corehalo-core" />
      <span className="v1-corehalo-scan" />
    </div>
  )
}
