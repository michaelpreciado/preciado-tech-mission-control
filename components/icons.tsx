'use client'

import React from 'react'

/**
 * Monochrome SVG icon set for navigation and status.
 *
 * Rules:
 *  - Stroke-only, Lucide/Phosphor-style, single optical weight (1.8px).
 *  - Every path uses `stroke="currentColor"` / `fill="none"` so icons inherit
 *    whatever state colour the surrounding element carries (hover, active,
 *    ok / warn / error / info). No hardcoded hex anywhere in here.
 *  - One 24x24 viewBox for consistent optical alignment.
 */

export type IconName =
  | 'deck'      // dashboard grid
  | 'kanban'    // board columns
  | 'approvals' // check-circle
  | 'tasks'     // clipboard
  | 'calendar'  // calendar
  | 'chat'      // message bubble
  | 'github'    // octocat (single-tone silhouette)
  | 'costs'     // bar chart
  | 'projects'  // folder
  | 'pipeline'  // globe / web
  | 'ml'        // cpu / bot
  | 'memory'    // archive brain
  | 'team'      // users
  | 'setup'     // sliders
  | 'brand'     // mission-control mark (radar dish, not the Deck house)
  | 'ok'        // check
  | 'warn'      // triangle exclamation
  | 'error'     // octagon slash / circle-x
  | 'info'      // info circle

const P: Record<IconName, React.ReactNode> = {
  deck: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  kanban: (
    <>
      <rect x="3" y="3" width="4.5" height="18" rx="1" />
      <rect x="9.75" y="3" width="4.5" height="13" rx="1" />
      <rect x="16.5" y="3" width="4.5" height="10" rx="1" />
    </>
  ),
  approvals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.2 12.4l2.6 2.6 5-5.4" />
    </>
  ),
  tasks: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M8.5 10h7M8.5 14h7M8.5 18h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 2.8V6.5M16 2.8V6.5" />
      <path d="M8 14h3v3H8z" />
    </>
  ),
  chat: (
    <>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.8-.3-4-.9L3 21l1.9-5.5a8.5 8.5 0 1 1 16.1-4z" />
      <path d="M8.5 12h7M8.5 15.5h4" />
    </>
  ),
  github: (
    <>
      <path d="M12 2.6a9.4 9.4 0 0 0-3.1 18.3c.5.1.6-.2.6-.5v-1.8c-2.6.6-3.1-1.2-3.1-1.2-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.2-4.5-1.1-4.5-4.8 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.7-2.3 4.6-4.5 4.8.3.3.6.9.6 1.8v2.7c0 .3.1.6.6.5A9.4 9.4 0 0 0 12 2.6z" />
    </>
  ),
  costs: (
    <>
      <path d="M4 20V9M9.3 20V4.5M14.6 20v-8M20 20V7" />
    </>
  ),
  projects: (
    <>
      <path d="M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M3.5 11h17" />
    </>
  ),
  pipeline: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.5 4 5.6 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.6-4-9s1.4-6.5 4-9z" />
    </>
  ),
  ml: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  memory: (
    <>
      <path d="M12 5a3.5 3.5 0 0 0-3.5 3.5c0 .8.3 1.5.7 2.1A3.5 3.5 0 0 0 8 13.5 3.5 3.5 0 0 0 12 19c1.5 0 2.8-1 3.3-2.4.8.3 1.7.6 2.7.6 2.2 0 4-1.5 4-3.4 0-1.5-1-2.8-2.4-3.3.3-.8.5-1.7.6-2.6a4 4 0 0 0-7.6-2.2A3.9 3.9 0 0 0 9 5z" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.8 20a6.5 6.5 0 0 1 12.4 0" />
      <path d="M15.5 5.6a3.5 3.5 0 0 1 0 6.7M17.4 14.6a6.5 6.5 0 0 1 3.8 5.4" />
    </>
  ),
  setup: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </>
  ),
  brand: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5M12 3.5V2M12 20.5A8.5 8.5 0 0 1 3.5 12M12 20.5V22" />
      <path d="M4 12h16" />
    </>
  ),
  ok: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warn: (
    <>
      <path d="M12 3.5L2.5 20h19z" />
      <path d="M12 9.5v5M12 17.5v.01" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.8v.01" />
    </>
  ),
}

export function Icon({
  name,
  size = 16,
  className,
  title,
}: {
  name: IconName
  size?: number
  className?: string
  title?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {P[name]}
    </svg>
  )
}
