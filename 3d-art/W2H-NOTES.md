# W2-H — ASCII everywhere

## Route emblems

| Route | Family | Artwork / caption |
| --- | --- | --- |
| HOME `/` | core | core / CORE |
| KANBAN `/kanban` | network | network / NET |
| BOTS `/bots` | network | roster / ROSTER |
| PIPELINE `/pipeline` | build | orbit / ORBIT |
| PROJECTS `/projects` | build | build / BUILD |
| COSTS `/costs` | signal | ledger / LEDGER |
| GITHUB `/github` | signal | commits / COMMITS |
| MEMORY `/memory` | archive | archive / VAULT |
| CALENDAR `/calendar` | archive | grid / GRID |
| CHAT `/chat` | signal | waveform / WAVEFORM |
| CONTENT `/content-creation` | signal | broadcast / BROADCAST |
| SETUP `/setup` | build | schematic / SCHEMATIC |

`ROUTE_EMBLEMS` and `emblemFor()` in AsciiArt.ts are shared by kickers and pathname-aware EmptyState. Nested pathnames use their first segment; unknown views (including STYLEGUIDE/CORE demos) fall back to core. All artwork is at most 19 columns by seven rows. The five W2-G originals remain verbatim. Home keeps its existing wordmark and HomeDeck composition; its core mapping is available without adding a kicker to the completed hero.

## Audit and placement

All eleven non-home shell pages have a kicker above their principal content, usually immediately after CommandHeader. Pipeline uses the framed kicker. Home mounts AsciiWordmark and HomeDeck mounts AsciiPortrait inside NeuralUplink.

CostsPanel has eight dividers separating spend, activity, billing, subscriptions, fair use, models, local AI and burn landscape sections. GithubPanel divides repositories and recent activity. Content creation separates queue, studio and feed. Setup divides identity, customization, credentials and repeated configuration groups. Styleguide demonstrates kickers, framing and dividers, with a divider in its reusable Section wrapper.

Shared ui.tsx mounts trim on ordinary and portaled floating windows and terminal art in EmptyTerminal. AgentDeck puts trim before its header. Shell puts trim in the mobile destinations sheet. EmptyState previously mounted the generic monitor; it now mounts the current route emblem, preserving all existing props and actions. Loading retains the SCANNING console. Error and not-found retain their state console and replace the legacy flat mark with the horizon.

Unlike the brief's orphan description, the pinned Shell still mounted AsciiSkyline in the sidebar footer and AsciiCity after page content. These mounts are removed. Both old no-prop exports remain as compatibility wrappers around the single AsciiHorizon implementation.

## Styling

cyberpunk.css owns `--pt-ascii-bright` (.85), `--pt-ascii-mid` (.55), and `--pt-ascii-faint` (.30), all rgba(157,180,236,x). Wordmark uses bright; kickers, emblems, terminal art, consoles and horizon use mid; divider and trim use faint. Ink does not inherit multicolor status accents. Unrelated surface/status styling remains untouched.

JetBrains Mono comes from `--pt-font-mono`. Shared ASCII line-height is 1.15, with zero art letter spacing and ligatures disabled. Kicker text scales 10–12px, emblems 9–11px, dividers/trim/consoles use 10px. Only the wordmark has a text-shadow. The protected HomeDeck portrait retains its W2-G 1.02 metrics and existing .55 ink. No HomeDeck, login, 3D, API, collector or token source changes.

Motion-off still shows static dividers and consoles. Forced colors use system ink. Responsive route labels preserve the existing full/short swap.

## Horizon

A fixed 58-column, eight-row silhouette combines three server racks, a central antenna and a wireframe orb using +, -, |, /, backslash and = strokes. The final row is `[ PRECIADO // SECTOR 7 ]`. It is aria-hidden, centered at mid opacity and scales 6–10px to fit fault panels, with overflow protection.

## Validation

- `npx tsc --noEmit`: passed.
- Transpiled AsciiArt.ts with the installed TypeScript compiler and imported it in Node: all 12 route names and pathnames resolve correctly, all 12 are distinct, every emblem fits 19×7, and the horizon is exactly 58×8.
- CSS parsed successfully with the installed PostCSS parser.
- `npm run build`: passed. Non-fatal workspace-root, middleware deprecation, file-tracing and experimental SQLite warnings remain.
