# Mission Control: Matrix Blue Glass visual pass (VG)

Owner: Jarvis (review/judge). Workers: Claude Code `claude-sonnet-5-5` lanes. Base: `main@fbe00c5`.
Live: http://100.79.84.9:4176 (untouched until VG-5 deploy gate).

## Recon (2026-09-28, headless Playwright, all 10 routes x 4 viewports)
- All routes 200, zero horizontal overflow at 1440 / 412 / 884.
- **Background perf cliff:** MatrixRain canvas caps DPR at 2 → 3840x2160 backing store at 4K; headless fps fell 61 → 3 going 1440@1x → 1920@2x. Per-glyph `setTransform` draw, full-frame redraw, no fps cap by pixel budget.
- **Glass cost:** 42 `backdrop-filter` rules in globals.css + 7 module files, many stacked; expensive on Tensor-class GPUs.
- **Color:** mono-blue, low chroma; semantic colors (amber/green/red) inconsistent; body copy at 10-11px uppercase low-contrast (e.g. /costs footnotes); no wide-gamut (P3) accents.
- **Hierarchy:** top status strip + PRECIADO TECH bar + page hero = three stacked headers before content on every page; hero cards waste ~25% of first viewport.
- **Fold:** cover (412) is a stretched phone layout, chrome eats top third; inner (884x832) falls into the phone breakpoint and wastes the near-square canvas; no two-pane layout.
- Wordmark renders literal `**TECH**` (components/Sidebar.tsx:91).

## Waves
| Wave | Lane | Scope (file ownership) | Parallel? |
|---|---|---|---|
| VG-1 | L1 Background HD/4K | components/MatrixRainBackground.tsx only | yes |
| VG-1 | L2 Rich color + glass tokens | app/globals.css only (token layer + glass tiers) | yes |
| VG-1 | L3 UX audit (read-only) | writes qa/vg-ux-audit/** only | yes |
| VG-1 | L4 Fold + desktop shell | components/Shell.tsx, Sidebar.tsx, Sidebar.module.css, HomeWorkspace.module.css, new app/styles/fold.css + its one import in app/layout.tsx | yes |
| VG-2 | Page polish lanes | from L3 audit, one lane per page group, disjoint files | after VG-1 merge |
| VG-3 | Debug sweep | console errors, 4xx, pre-existing 3 test fails, security P0 re-land | after VG-2 |
| VG-4 | Loose ends | stale worktrees, blocked cards, docs | after VG-3 |
| VG-5 | Deploy gate | typecheck, build, full test, 4-viewport probe, then restart :4176 | Michael approves |

## Rules for every lane
- Own worktree + branch `vg/<lane>` off fbe00c5; node_modules via `cp -al`.
- Hard allow-list; anything else goes in the report, not the diff.
- Keep the existing background look (user likes it). Optimize, do not redesign it.
- Brand: periwinkle #9db4ec, near-black #07080b, scanline + halo. Respect html[data-motion='reduced'|'off'] and prefers-reduced-motion.
- No commit, push, restart, deploy. `npm run typecheck` + `npm run build` must pass in the worktree.
- Report file: `/home/mp/mc-lanes/vg-<lane>-out.md` with changed files, before/after numbers, and ✅/❌ per requirement.

## Acceptance (VG-1)
- 4K (1920@2x) background: backing store ≤ ~8.3 MP, fps parity with 1440@1x within 20% in the probe; visual parity screenshot.
- backdrop-filter surfaces reduced to ≤ 3 tiers, blur off under `pointer: coarse` + low-power.
- Text ≥ 12px for body/meta, WCAG AA 4.5:1 for body text on glass.
- Fold cover: chrome ≤ 15% of first viewport; fold inner (≥ 840px wide, touch): two-pane layout, no phone breakpoint.

Probe: `/home/mp/.hermes/profiles/jarvis/cache/scratch/mc-ux/ux-probe.mjs` (copy into worktree root to run; BASE env override).
