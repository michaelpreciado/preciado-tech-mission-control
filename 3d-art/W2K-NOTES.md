# W2-K — panel frames and section trim

Base: `a7acf35`.

## Audit

- Read `components/ui.tsx` in full. There are no separate Panel/Card exports at this revision: `Window` is the shared glass panel, with CSS border/radius, terminal title bar, and an existing `AsciiPanelTrim` footer in docked and floating modes. `SectionHead` uses empty spans painted as CSS rules. SkeletonPanel and EmptyTerminal also use `.mc-window`; they are outside this change.
- `Shell.tsx` has four ASCII references counting its import, and three rendered placements: sidebar `AsciiSkyline`, mobile more-sheet `AsciiPanelTrim`, and main-content footer `AsciiCity`. These decorate the shell; they do not provide card borders.
- Styleguide uses `AsciiKicker`, a reusable Section that pairs `AsciiDivider` with SectionHead, and explicit trim examples. Its specimen cards retain CSS borders/radii. Setup uses a route kicker and four AsciiDivider placements within configuration groups; its form/card outlines are CSS. Neither page needed migration.
- AgentDeck uses CSS module glass borders/radii for the deck and buttons, with an existing deck-level AsciiPanelTrim. Kanban columns and GitHub repo links use CSS borders. Bot cards inherit Window borders and trim. Costs Stat is an unbordered metric container inside bordered Windows.
- HomeDeck currently delegates to HomeChat, HomeTasks and HomeSystem rather than containing a legacy tile grid. HomeTasks owns the existing two-column task grid. Home section/card borders are CSS module styles. NeuralUplink and its portrait/hero internals remain untouched.
- Legacy `v4-lane.css` hides AsciiDivider when motion is off. Scoped new separator CSS makes the requested static page dividers visible in either motion mode, without editing the exports or their stylesheets.

## Frame system

`<TFrame>{surface}</TFrame>` in `components/ui.tsx` decorates one existing DOM surface (or Window). It merges the existing className and injects four aria-hidden, pointer-inert spans. It adds no layout container, dependencies, handlers, or focus targets; existing links, buttons, grid items, and border styles retain their roles.

All frame CSS starts with `.tframe-`. Each tick is a 6×6px L with two 1px edges, inset 6px to remain visible inside rounded/overflow-clipped panels. Ink matches the existing periwinkle RGB 157,180,236: opacity .55 at rest, .85 on host hover/focus-within, transitioning over 150ms. Reduced-motion preference removes that transition. Stat content gets 12px padding to keep text clear of ticks.

Window forwards the frame class and carries corner decorations separately from its content so floating cards keep ticks on the outer portal window, outside the scrolling body. Existing AsciiPanelTrim remains in place and is faint periwinkle on framed Windows. Existing glass borders remain authoritative.

Applied surfaces:

- HomeDeck's delegated HomeTasks grid container (one frame around the grid).
- AgentDeck's outer agent tile buttons.
- KanbanBoard's Column outer containers, including dynamically discovered statuses.
- BotsPanel's BotCard outer Window, docked and floating.
- CostsPanel's shared Stat outer containers.
- GithubPanel's outer repository links.

## Section rules

`SectionRule` renders a full-width flex line of clipped box-drawing `─` text at .30 alpha, a monospace uppercase label chip at .55, and a right-aligned, zero-padded index (`[03]`) at .55. It uses a real h2; decorative strokes and indices are hidden from assistive technology. Long labels wrap, while the flexible line shrinks without expanding the page. Optional metadata/actions appear below the line.

Home's delegated headers use [01] Mission Control, [02] Open Tasks, [03] System, preserving task counts, board navigation, connection status and section IDs. Bots replaces the roster SectionHead and preserves its live summary. Costs replaces its eight SectionHeads with stable indices in page reading order; conditional sections can leave intentional index gaps.

Projects and pipeline each receive AsciiDivider below their header and above their content, using `.srule-divider` to keep the existing export's glyphs and lines faint (.30). All new CSS selectors start with `.tframe-` or `.srule-`.

## Validation

- `npx tsc --noEmit`: passed.
- `npm run build`: passed; non-fatal notices concern workspace-root inference, middleware deprecation, broad file tracing and experimental Node SQLite.
- `git diff --check`: passed.
- No browser visual verification was performed.
- No changes to API routes, collectors, token definitions, vf export internals, 3D components, hero internals, login or error/loading components. Existing untracked handoff spec preserved.
