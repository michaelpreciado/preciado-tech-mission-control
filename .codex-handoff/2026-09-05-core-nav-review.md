# CORE-NAV — review pass (top model: gpt-5.6-sol)

Base diff source: `/tmp/t_fce0e253-codex-lane` branch `codex/t_fce0e253/20260906035527` on 1086ac1.
This is the **review pass** only — do NOT modify code, tests, or any source file. Inspect, report, and write a short review memo to your output message.

## What was built (by Codex exec from `2026-09-05-core-nav-build.md`)

CORE-ORB became the Home navigation button:
- **Desktop:** `<HomeControl placement="desktop">` replaces bare `<CoreOrb>` in `Sidebar()`, first above `.mc-brand`. Link wraps the orb visual (pointer-events none) + static brand-fallback glyph. Sidebar nav section data filters out `/`.
- **Mobile:** Home is now a **third dock cell** between Chat and Bots (Kanban / Chat / Home / Bots / More). Canonical `visiblePrimary` still lists `/` but it's excluded; the new `<HomeControl placement="mobile" />` fills the slot. The old absolute-notch CSS rules are removed.
- **CSS:** New `/* ── CORE-NAV … ── */` section with `.mc-home-control`, `.mc-mobile-home`, compact rail 48px override — no `text-shadow` declarations added (base count stays at 24).
- **Setup page:** coreOrb toggle explicitly labeled "turns off 3D heartbeat visual; Home navigation remains available".

## Your job (review only — NO code changes)

### A. Architecture + correctness scan
1. **HomeControl component:** Is `isActive()` logic correct for exact-root `/`? Check that `pathname === '/'` works with Next.js Router's path comparison; if it uses `asPath`, ensure trailing-slash edge cases are handled.
2. **aria-current:** Only on when `active`; never on fallback glyph or visual div. Verify the Link itself owns aria-current, not child spans.
3. **Sidebar section filtering:** Does `.filter(sec => sec.items.length > 0)` safely handle the edge case where a hidden tab (e.g. `/`) was the last item in a section? It shouldn't produce orphan empty section headers.
4. **Mobile dock order:** Is the canonical `PRIMARY`/`NAV` arrays untouched? Confirm `/` is still in canonical data for other consumers (Setup, route metadata).

### B. Accessibility scan (lightweight)
- The `<Link>` wraps a 3D canvas child with `aria-hidden`. Does any screen-reader path double-match aria elements? Confirm no `div[role=button]` or duplicate focusable children.
- Is `.mc-home-control:focus-visible` visible and not clipped to the sidebar content box (the orb sits in the sidebar chrome)?

### C. Regression scan
- Does `useLiveData()` fire any extra re-renders from the new HomeControl wiring? Confirm no new polling frequency or event handler added to the data provider.
- Is CoreOrb dynamic import (`next/dynamic`) still present at the point of render (no SSR risk)? Verify the component definition hasn't been accidentally converted to a sync import.

### D. CSS regression check
- `.mc-home-control:focus-visible` — confirm z-index and padding don't shift the sidebar content box or cause layout jump.
- `.mc-mobile-home .mc-home-control-visual { width: 44px; height: 44px; flex: 0 0 44px }` — is this inside a `clamp` on the dock cell to prevent overflow?
- Verify the compact-orb `@media (max-width:980px)` block doesn't break the sidebar at that breakpoint range.

## Gate verification (you confirm what's already passed)

Codex reports gates 1–4,6 as pass:
1. typecheck — clean
2. test — 214/214 (one telemetry-state test fails on worktree node_modules only; base repo passes 20/20 assertions inside that file — it wasn't touched by this branch)
3. build — clean
4. text-shadow count == `grep -c 'text-shadow' app/globals.css` — confirms 24 (unchanged)
5. Playwright assertions at 1440 / 821-980 / 700 / 390 — verify port, not the test suite output
6. No commits made

## Output format (plain text reply)

Provide a numbered report:

A. **Architecture:** [pass/fail + any concern or "no issues detected"]  
B. **Accessibility:** [pass/fail + any concern]  
C. **Regression:** [pass/fail + any concern]  
D. **CSS:** [pass/fail + any concern]  
E-1. **Playwright geometry notes** (port 4176 vs 4177 — state what you'd check live)  
F. **Accept / Request changes:** [either `accept` or `request_changes: <one-line reason>`]
