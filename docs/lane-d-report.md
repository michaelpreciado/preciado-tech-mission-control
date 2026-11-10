# Lane D — route CSS out of `app/globals.css` (2026-11-09)

Plan: `docs/polish-plan-2026-11-09.md` §8.3 D. Single writer on `app/globals.css`.

## What changed

`app/globals.css` had 4831 lines at the start of this pass and every lane needed to
touch it (plan §8.5 called it the repo's merge hotspot). Route-owned rule families now
live in per-area sheets under `app/styles/routes/`, imported once from `app/layout.tsx`
immediately after `./globals.css` — i.e. **before** the `vf`/`w2l` override lanes, which
preserves the cascade position those rules had inside the global sheet.

| sheet | families | rules | lines |
|---|---|---|---|
| `content.css` | `.mc-content-*`, `.mc-studio-*`, `.mc-signal-*`, `.mc-pipe-*` | 108 | 456 |
| `home.css` | `.mc-proj-*`, `.mc-tile*`, `.mc-urgent*`, `.mc-feed*` | 71 | 195 |
| `costs.css` | `.cp-*`, `.mc-heatmap*` | 70 | 149 |
| `memory.css` | `.mc-mem-*`, `.mc-commit*` | 49 | 153 |
| `buttons.css` | `.ob-btn*` | 36 | 224 |
| `setup.css` | `.mc-setup-*` | 35 | 85 |
| `github.css` | `.mc-gh-*` | 18 | 60 |
| `markdown.css` | `.cc-md-*` | 15 | 47 |
| `chat.css` | `.mc-chat*` | 14 | 48 |
| `login.css` | `.mc-login-*` | 13 | 82 |

**429 rules moved.** Multi-selector rules whose selectors spanned two owners were split;
the shared selectors stayed behind in `globals.css`.

Line counts: `4831` → `4107` (dead launch/rain/HomeDeck prune, commit `b34cc34`) →
**`2673`** after extraction. Zero hex colour literals in globals.css (unchanged from the
prune) and zero in the new sheets: everything resolves through `--pt-*` / `--vg-*`.

## Line target not met, deliberately

§8.3 D asked for ≤ 2,000 lines and "delete rules with zero callers". Neither is safely
reachable:

- The 430 rules left in `globals.css` are shared shell primitives — `.mc-shell`,
  `.mc-main`, `.mc-window*`, `.mc-btn*`, `.mc-modal*`, `.mc-glyph*`, `.mc-prompt*`,
  `.mc-kv`, `.mc-verdict`, `.mc-segbar`, `.mc-hist`, `.mc-wrow` — used by every route.
  Moving them would just rebuild a global sheet under a different filename.
- `scripts/route-css-deadprune.mjs` (written, dry-run only) finds **6** rules whose every
  class token is unreferenced from `.tsx/.ts/.mjs/.js`: `.boot-overlay`,
  `.boot-overlay.boot-leaving`, `.boot-skip`, the reduced-motion `.boot-overlay`, the
  `body:has(dialog)` `.boot-overlay` guard, and one `html:root :is(.brandMark, …)` rule.
  The first five are boot screens, which §1.7 explicitly keeps; the last is reached
  through `[class*="brandMark"]` against a CSS-module hash, so a literal-source scan
  cannot prove it dead. Deleting any of them is a regression risk for zero user value,
  so none were removed. The script stays in the tree as a dry-run audit tool.

## Bug found and fixed during the split

The first extraction pass filed
`html:root body *:not(.mc-cockpit):not(.mc-drawer):not(.mc-login-card):not(.cmdp):not(.mc-modal)`
into `login.css`, because the classifier read `.mc-login-card` *inside `:not()`* as
ownership. That silently removed the backdrop-filter kill rule from the global sheet and
`tests/motion-css.test.mjs` caught it (`blur-kill rule present`). Fixed two ways:

1. the rule (all three selectors, in the original order/line breaks the test asserts on)
   was restored to `globals.css` and removed from `login.css`;
2. `scripts/route-css-extract.mjs` `classify()` now strips `:not()/:is()/:has()/:where()`
   arguments before looking for owning classes, so a future run cannot repeat it.

## Tooling left behind

- `scripts/route-css-audit.mjs` — which families still live in globals.css (existing).
- `scripts/route-css-prune.mjs`, `scripts/route-css-cleanup.mjs` (existing, from the prune).
- `scripts/route-css-extract.mjs` — the splitter; `--write` applies, default is a dry run.
- `scripts/route-css-census.mjs` — rule counts per family + dead-class census.
- `scripts/route-css-deadprune.mjs` — conservative dead-rule dry run (see above).

## Gates

- `npx tsc --noEmit` — clean.
- `node --test` — 517 tests, 0 fail (after the blur-kill restore).
- `npm run build` — green.
- Live DOM (service restarted 17:13 PST): `/costs`, `/crew`, `/kanban`, `/system`,
  `/chat`, `/pipeline`, `/setup`, `/deliverables` all 200, `.mc-widget` counts unchanged
  where they already existed, `scrollWidth - clientWidth === 0` at 1440 and 412.

## Closed to new writes

Per §8.5: `globals.css` is now closed to round-2 additions. New route styling goes in
`app/styles/routes/<area>.css` or the route's own module CSS.
