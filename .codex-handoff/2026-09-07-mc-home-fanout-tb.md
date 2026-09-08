# T-B: Mobile chrome — top strip, ☰ drawer, More sheet (worktree /tmp/mc-0907-c)

Goal: the mobile Home chrome is ugly: a bare "☰" button floating next to a 10px
"7 need attention" strip, a plain dialog drawer with a raw header, and a bottom
More sheet that could be more comfortable. This is a SOURCE-ONLY worktree: no
node_modules — do NOT run tsc or builds; just edit and commit.

Files you own:
- components/Shell.tsx — the HomeNavDrawer component (the <dialog> rendered by
  the ☰ button) and the MoreSheet visual structure ONLY if a one-line change is
  needed. Do not change the drawer's event logic (mc:open-home-nav etc.).
- components/ActionFeed.tsx — the COMPACT branch markup only (the <details
  className="mc-urgent-strip"> block). Keep the data logic and full (non-compact)
  branch untouched.
- app/globals.css — ONLY rules for: .mc-home-nav-drawer, .mc-urgent-strip,
  .mc-more-* mobile sizing, .mc-mobile-nav items. Grep to find them before
  editing.
- components/HomeWorkspace.module.css — ONLY these selectors (someone else owns
  the rest of this file): .topbar, .menuButton, and the .home :global(.mc-urgent-*)
  block (lines ~4-12).

Changes:
1. ActionFeed.tsx compact summary: restructure to a two-line-friendly layout:
   - `<strong>` count label: keep text `{n} need attention`.
   - Add a leading label span (module-class agnostic; use the existing
     mc-urgent-* classes with inline tweaks in globals.css) so the summary reads:
     [dot] NEEDS ATTENTION (small caps 9px, steel) • {n} items (12px, warm amber
     #efc582) ... preview ... chevron.
   Concretely: wrap the count in <strong class via existing strong> and keep one
   new <span className="mc-urgent-eyebrow">NEEDS ATTENTION</span> before it.
     CSS: .mc-urgent-eyebrow font-size 9px, letter-spacing .14em, color #7e93a8.
     strong: font-size 12px (was 10px), color #efc582, font-weight 500.
     summary font-size 12px (strip rule in globals.css sets 11px — raise the
     .mc-urgent-strip base to 12px). mc-urgent-dot 5px→6px.
2. HomeWorkspace.module.css .menuButton: keep the 44px square (tap target) but
   make it look intentional: border-radius 10px, icon vertically centered
   (display:grid; place-items:center), font-size 18px, color #b6cddd.
   .topbar: align-items: center (was flex-start) so the ☰ and strip are
   vertically centered together; radius on strip 10px is fine.
3. HomeNavDrawer (Shell.tsx): restyle content:
   - header: two-part — <strong>NAVIGATION</strong> becomes small-caps 10px
     letter-spacing .16em steel color via existing styles (add a class like
     mc-home-nav-drawer-title if needed), close button 40x40 grid-centered.
   - section <p> labels: 9px uppercase letter-spacing .14em color #7e93a8.
   - nav rows: min-height 44px, display flex, gap 12px, align center, font
     size 14px, color #b6cddd; icon 18px steel. Add :active background #142a40.
   - dialog box: max-height 85dvh, overflow-y auto, border-radius 16px 16px
     0 0, border 1px solid var(--pt-border-dim), background #07111dfa,
     backdrop #02060ca0. All drawer CSS lives in globals.css (search
     mc-home-nav-drawer) — edit there, keep the component markup minimal.
4. More sheet: in globals.css verify .mc-more-cell min tap 44px and label 12px;
   if currently smaller, raise. Do not restructure the component.

Rules:
- Do not touch the chat-area selectors in HomeWorkspace.module.css (.chat*,
  .welcome*, .suggestions, .composer*, .kicker, .connection, .chatActions,
  .messages, .message, .inputBox, .send, .error, .chat[data-empty]).
- Do not touch .section*, .task*, .dials, .vitals, .machine, .live, .empty in
  the module css (owned by T-C).
- Commit ONLY files you changed. Commit message:
  "[ASTRA-LIGHT] T-B mobile chrome: attention strip, nav drawer, tap sizes"

REPORT (print at end): files changed, selectors changed, commit sha, note that
tsc must be run in the main repo after merge.
