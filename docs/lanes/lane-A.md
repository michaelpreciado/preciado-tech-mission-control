# Lane A — shared theme, primitives, shell, home (Mission Control aurora polish)

You are Lane A of a three-lane refactor of Mission Control, a Next.js 16 app at
`/home/mp/Documents/mission-control` (served on :4176 by systemd user unit `mission-control`).

**Read `/home/mp/Documents/mission-control/docs/polish-plan-2026-11-09.md` IN FULL first.**
It is the spec. Also read `docs/widget-theme-reference.md` (the launcher divider-theme it encodes) and
`docs/DESIGN-SYSTEM.md` if present.

## Your exclusive file lane

You own ONLY these files. Do not edit anything else. Lanes B and C are running against your output and
will import your primitives — they never edit your files, and you never edit theirs.

- `lib/tokens.ts`, `lib/theme.ts`, `lib/config.ts`
- `app/layout.tsx`, `app/globals.css`, `public/manifest.json`
- `app/styles/**` (incl. deleting nothing that is live), `app/vf/**` (DELETE `app/vf/v1-core.css`), `app/w2l.css`
- `app/kanban/deck.css` (DELETE)
- `app/page.tsx`, `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx`
- `app/styleguide/**`
- `components/Shell.tsx`, `components/Sidebar.tsx`, `components/Sidebar.module.css`,
  `components/MobileChrome.tsx`, `components/MobileChrome.module.css`
- `components/atmosphere/**` (DELETE the directory; move `PromptBar.tsx` -> `components/PromptBar.tsx`,
  and move/rewrite its module CSS accordingly)
- `components/aurora/**`
- `components/boot/**`
- `components/PageHeader.tsx`, `components/ui.tsx`, `components/ui.module.css`
- `components/CommandPalette.tsx`, `components/icons.tsx`
- `components/charts/SegBar.tsx` (NEW), `components/charts/MiniHist.tsx` (NEW),
  `components/charts/charts.module.css` (remove the `.emph` glow at :25 ONLY; do not restructure)
- `components/Sparkline.tsx` (remove the `<linearGradient>` area fill)
- `components/chat-continuity.css` (DELETE), `components/AgentDeck.module.css` (DELETE)
- `tests/motion-css.test.mjs`, `tests/shell-scroll.test.mjs`, `tests/aurora.test.mjs`
- `docs/DESIGN-SYSTEM.md`, `docs/widget-theme-reference.md`

Everything else belongs to Lane B (`components/Kanban*`, `components/views/SystemPage|CostsPanel|LocalAiPage|shared`,
`lib/flight-strip.ts`, `lib/chart-colors.ts`, `lib/host-metrics.ts`, ...) or Lane C (`components/ChatConsole`,
`components/crew/**`, `components/TickTickCalendar`, `components/Deliverables*`, `components/Pipeline*`,
`components/views/GithubPanel|Memory*|ProjectGrid`, `app/<route>` pages for chat/crew/bots/calendar/content-creation/
deliverables/pipeline/github/projects/memory/setup/login). **Never touch their files.**

## Order of work (do not reorder — B and C branch at your commit)

1. **§1.1–1.4 tokens** — write the widget token layer into `lib/tokens.ts` (bg `#000`, card `#0A0F1A`,
   border `#1E293B`, radius 16px, accent `#3B82F6`, cyan `#00A3FF` ≤1 per card, mono `JetBrains Mono`
   via `--pt-font-mono`, verdict numerals `Instrument Sans`). Wire `lib/theme.ts` + `app/layout.tsx`
   (theme-color `#000000`, `public/manifest.json` to match). Fix issue #1 in the plan (§4).
2. **§1.5 primitives + React wrappers** — the shared widget contract, exported so B/C can import them:
   - CSS classes in `globals.css` (A owns it): `.mc-widget`, `.mc-widget--tight`, `.mc-prompt`,
     `.mc-prompt--foot`, `.mc-divider`, `.mc-verdict`, `.mc-glyph`, `.mc-dots`, `.mc-kv`, `.mc-wrow`,
     `.mc-hist`, `.mc-segbar` (+ `--thin`), `.mc-led` retired.
   - React: `components/ui.tsx` gets `Prompt`, `Divider`, `Verdict`, `Glyph`, `Kv`, `WRow`, `KvRow`.
   - New: `components/charts/SegBar.tsx`, `components/charts/MiniHist.tsx`.
   - **Commit here** (`feat(theme): widget token layer + primitives`) — this is the branch point for B/C.
     Make this commit even if the rest is unfinished; B and C need the primitives to exist.
3. **§1.6/1.7 removals** — delete dead CSS (plan lists exact line ranges: `.mc-led` glow, `.cmdp` glow,
   `.mc-mobile-nav*`/`.mc-more-*`/`.mc-mobile-pill` ~123 rules, legacy shell rules `.mc-side`/`.mc-cockpit`/
   `.mc-rain`/`.mc-ambient3d`/`.mc-scanlines`/`.mc-vignette`). Delete keyframes WITH the rules that used them —
   `tests/motion-css.test.mjs:125-128` fails on any unused `@keyframes`, and `:38-41` requires the blur-kill
   rule + `data-motion` fallbacks for `.launch-chart-line` / `.boot-draw-path`. Keep boot/launch rules.
4. **Shell** — `Sidebar`, `MobileChrome`, `PromptBar`, `PageHeader`, CommandPalette per plan §2 "Shell".
   Fix issue #3 (232 vs 236 rail width — make both 232) and #4 (720–820px tab-bar padding).
5. **Home** — `components/aurora/**` + `app/page.tsx` per plan §2 `/` Home. This is the flagship route:
   prompt headers, `.mc-verdict` numerals, glyph rows, hourly `.mc-hist` sky.
6. **Styleguide** — add the "Widgets" section rendering every primitive (plan §2 `/styleguide`).
7. **Breakpoint ladder** — collapse to **1400 / 1200 / 980 / 820 / 520** (+ `(pointer: coarse)` and
   reduced-motion). Tab bar appears at ≤820px everywhere; the 64px fold icon rail covers 821–1100px.

## Non-negotiables

- **Literal budget in `globals.css` is yours.** Targets: hex literals 176 → <20 (the friday block lives in
  `lib/tokens.ts`), `gradient(` 114 → 0 outside boot/launch film, `box-shadow` 228 → <10 (focus rings only),
  `backdrop-filter` 54 → 2 (the blur-kill rule the test requires).
- Fonts: everything JetBrains Mono except verdict numerals. `var(--font-mono)` must become 0 occurrences
  repo-wide on your side (`grep -rn "var(--font-mono)" components app` → 0 for files you own).
- No emoji anywhere. No macOS traffic lights. No figlet wordmarks. No blur, glow, gradient, vignette,
  scanline, rain, or bloom on any chrome surface.
- `document.body` background is pure `#000` with `background-image: none`.
- Cyan `#00A3FF` appears at most once per card, never as a border.
- Keep every route rendering under `prefers-reduced-motion` and `data-motion="off"`.
- Do NOT break `app/setup` accent presets: "Widget (default)" must produce NO `<style id="friday-accent">`
  block; "Launcher slate" and "Omarchy" must still stamp `data-palette` and look like themselves.

## Gates — run these yourself, fix failures, and report the raw numbers

```bash
npm run typecheck
npm test                # baseline 542 pass (~3 min); tests/motion-css.test.mjs is the keyframe/blur gate
node node_modules/.bin/next build
```

Then the literal-budget greps from plan §5 step 2. Do NOT restart the systemd service and do NOT commit
beyond the step-2 branch commit — the orchestrator runs final gates and merges.

## Return format

Write `docs/lane-a-report.md` with: what changed per file, the raw output of the four gates, the literal-budget
grep counts before/after, anything in the plan you could not do and why, and a list of `globals.css` rules you
left in place for Lane B/C to have removed. Then reply with a <=15 line summary.
