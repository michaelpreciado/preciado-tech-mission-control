# T-A: Home landing polish (main tree — run in ~/Documents/mission-control)

Goal: the home landing screen (chat welcome panel) reads as "big pink header, tiny
grey text" on mobile. Fix the type hierarchy + contrast + tap targets. Keep the
existing design language (dark blue, neon cyan, mono accents). NO new components,
NO new files, NO changes to globals.css, NO changes to Shell/ActionFeed/
HomeTasks/HomeSystem.

Files you own (and nothing in them that falls outside these selectors):
- components/HomeChat.tsx
- components/HomeWorkspace.module.css — ONLY the chat-area selectors:
  .chat, .chatHeader, .kicker, .connection, .chatActions, .messages,
  .welcome, .orb, .suggestions, .message, .user, .assistant, .speaker,
  .thinking, .composer, .inputBox, .send, .composerHint, .error, error styles,
  and the @media (max-width: 820px)/600px rules that touch ONLY those selectors,
  plus the trailing `.chat[data-empty=...]` / `.welcome .composer` /
  `.welcome .suggestions` block at the end of the file.

Known defects to fix (verified against live screenshot, phone width ~390px):
1. `.kicker` in the chat header ("MISSION CONTROL") inherits a loud pink on mobile
   (theme class). Make the chat-header kicker calm: 10px, letter-spacing .18em,
   color #9fc3e4 (light steel), font-weight 500. It must NOT be pink.
2. `.connection` ("Agent connected") is 10px #8197ab — too faint. Raise to 11px,
   color #b7d3ea. In HomeChat.tsx render a leading status dot: a small 6px
   rounded span (module class) that is green (--pt-ok or #4ade80) when connected,
   amber (#e7b77a) while connecting, red (#ef7d7d) when unavailable. Pure CSS +
   one extra span; keep a11y (span aria-hidden, text stays the source of truth).
3. `.chatActions` buttons ("History", "＋ New chat"): 11px feels small and the
   44px min-height is too tall for a header on mobile. Set: font-size 12px,
   min-height 40px on desktop, min-height 38px + padding-inline 12px at ≤600px.
   Increase gap from 8px to 10px.
4. `.suggestions` buttons: 10px is too small. 12px, padding 12px 16px, keep
   min-height 44px, gap between arrow and label 10px (not 16px). Keep the
   full-width stacked grid at ≤600px.
5. `.welcome p` (subtitle): max-width 420px (was 360px), 13px (was 12px),
   color #8fa9c0 (slightly more contrast).
6. `.composerHint`: never smaller than 9px. At ≤600px it currently drops to 8px —
   remove that drop.
7. `.welcome h1`: fine content-wise; cap it at clamp(20px, 5.2vw, 30px) so it
   stops dominating the screen on tablets, and letter-spacing -.02em.
8. `.messages` empty-state vertical: ensure the welcome panel doesn't overflow on
   short phones: `.welcome` padding-block 24px top is fine, but tighten
   `.suggestions` margin-top to 20px at ≤600px.

Rules:
- Do not touch .home, .topbar, .menuButton, :global(.mc-urgent-*), .section*,
  .task*, .taskDot, .moreTasks, .live, .machine, .dials, .vitals, .empty.
- Keep every existing a11y attribute.
- No node_modules in this path if run in main tree they DO exist — you may run
  `npx tsc --noEmit` (it works in the main tree). If it fails, it must not be
  your files' fault.
- Commit ONLY the two files you touched. Commit message:
  "[ASTRA-LIGHT] T-A home landing polish: type hierarchy, contrast, tap targets"

REPORT (print at end): files changed, exact selectors changed, tsc status,
commit sha.
