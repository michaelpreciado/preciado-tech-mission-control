# T-C: Home below-the-fold — tasks, system, dials (worktree /tmp/mc-0907-d)

Goal: below the chat on Home, the Tasks and System sections are textually dense:
10–12px everything, cramped padding, 2-col tasks that feel tight on phone. Bring
it up to comfortable mobile readability without losing the cockpit look (dark
blue, steel/cyan, mono accents). This is a SOURCE-ONLY worktree: no
node_modules — do NOT run tsc or builds; just edit and commit.

Files you own:
- components/HomeTasks.tsx — markup/a11y only if a class is needed (prefer pure CSS).
- components/HomeSystem.tsx — markup/a11y only if needed (prefer pure CSS).
- components/HomeWorkspace.module.css — ONLY these selectors:
  .section, .sectionHeader, .tasks, .task, .task > div, .task strong,
  .task div span, .taskDot, .moreTasks, .live, .machine, .dials, .vitals,
  .empty, and the @media rules that touch only these (the ≤600px block lines
  touching .tasks/.sectionHeader/.dials; the ≤820px .section padding rule).

Changes:
1. `.sectionHeader h2`: 20px→16px, letter-spacing -.02em; the trailing `<span>`
   detail 14px→12px. Section "View all" a: 11px→12px.
2. `.section` padding: 18px mobile (≤600px), keep 24px desktop. `.section`
   margin-top 32px→24px mobile.
3. `.task`: padding 16px→14px; `.task strong` 12px→13px, line-height 1.55;
   `.task div span` 10px→11px, color #92aabf; gap between rows: .tasks gap
   10px→12px desktop, keep 1-col at ≤600px with gap 10px.
4. `.taskDot` 5px→6px.
5. `.moreTasks`: 11px→12px, min-height 44px kept.
6. `.live`: 10px→11px.
7. `.machine`: 10px→11px, line-height 1.6, gap 8px 16px.
8. `.dials`: on mobile (≤600px) it is 2-col — keep 2 cols. On 601–820px it
   currently stays 4-col which is cramped: add a ≤820px rule making it 2 cols
   (this is a NEW rule, do not edit the 600px block). Dial values/labels:
   find the dials value/label styles (may be in this module file or inline in
   HomeSystem.tsx) — values at minimum 15px, labels 10px→11px uppercase
   letter-spacing .1em steel. If dial value styles live in HomeSystem.tsx
   inline/module classes, restyle via the module file selectors.
9. `.vitals`: 10px→11px, line-height 1.7, strong color #c4d8ea.
10. `.empty`: 11px→12px.

Rules:
- Do not touch the chat-area selectors (.chat*, .welcome*, .suggestions,
  .composer*, .kicker, .connection, .chatActions, .messages, .message, .inputBox,
  .send, .error, .chat[data-empty]) — owned by T-A.
- Do not touch .home, .topbar, .menuButton, :global(.mc-urgent-*) — owned by T-B.
- Keep 44px tap targets. Keep every a11y attribute.
- Commit ONLY files you changed. Commit message:
  "[ASTRA-LIGHT] T-C home below-fold: tasks/system typography and dials"

REPORT (print at end): files changed, selectors changed, commit sha, note that
tsc must be run in the main repo after merge.
