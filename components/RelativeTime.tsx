'use client'

import { useEffect, useState } from 'react'

/**
 * RelativeTime — compact elapsed/last-seen clock used across the Team tab.
 *
 * Renders a relative label ("2m 14s") that ticks in place, with the absolute
 * local time as a title tooltip (hover). Supports "elapsed since <ts>"
 * (default) or "ago" framing for last-seen labels.
 */
export function RelativeTime({
  ts,
  frame = 'elapsed',
  now: nowProp,
}: {
  /** Epoch ms (or seconds — auto-detected like the kanban reader). */
  ts: number | null | undefined
  frame?: 'elapsed' | 'ago'
  now?: number
}) {
  const [now, setNow] = useState<number>(nowProp ?? Date.now())

  useEffect(() => {
    if (nowProp !== undefined) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [nowProp])

  if (!ts || !Number.isFinite(ts)) return <span className="mc-reltime" data-empty>—</span>
  const ms = ts > 1e12 ? ts : ts * 1000
  if (ms <= 0) return <span className="mc-reltime" data-empty>—</span>

  const diff = Math.max(0, now - ms)
  const sec = Math.floor(diff / 1000)
  const label = sec < 60
    ? `${sec}s`
    : sec < 3600
      ? `${Math.floor(sec / 60)}m ${sec % 60}s`
      : sec < 86400
        ? `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
        : `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`

  const absolute = new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  return (
    <span className="mc-reltime" title={absolute}>
      {frame === 'elapsed' ? label : `${label} ago`}
    </span>
  )
}
