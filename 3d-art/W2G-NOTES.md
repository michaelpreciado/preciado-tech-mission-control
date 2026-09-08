# W2-G — Brand ASCII upgrade

## Replacements

- `AsciiWordmark` now uses the supplied ansi_shadow MISSION / CONTROL artwork instead of the hand-drawn M. The redundant plain-text title is removed; the HUMAN + MACHINE line remains.
- New `AsciiPortrait` embeds the supplied Michael portrait. `HomeDeck` passes it through a decorative slot into `NeuralUplink`, which owns the existing hero photo.
- Sidebar `AsciiSkyline` and footer `AsciiCity` retain their mounting points but replace the city doodles with the shared CORE and VAULT monoliths.
- All three supplied text assets are embedded verbatim in `app/vf/AsciiArt.ts` as template literals, with escaped backslashes. Their trailing whitespace is intentional and retained from the source files.
- Kicker routing, divider, panel trim, terminal art, and console structure and behavior remain intact. Existing ornament strings now use template literals without changing their rendered text.

## Responsive behavior and styling

The actual `.cyber-*` rules are in `app/vf/cyberpunk.css`, imported after `app/globals.css`; changes are made at that source rather than adding competing global overrides.

The wordmark uses JetBrains Mono, `clamp(4px, 1.05vw, 8px)`, line-height `1.02`, zero letter-spacing, periwinkle `#9db4ec`, and a maximum 12px glow at 35% alpha. Below 700px, CSS hides ansi_shadow and displays the supplied pure-ASCII slant variant. Both are rendered statically; no hydration-dependent measurement is needed.

The portrait uses a fixed `56ch` width, `clamp(3px, .9vw, 7px)`, periwinkle at 55% alpha on `#07080b`, and no text shadow. Its wrapper has 30% opacity and sits offset behind/beside the photo. The offset tightens at the existing 820px hero breakpoint. Absolute positioning preserves the existing `height: clamp(220px, 32vw, 420px)` and photo dimensions before and after image load. The layer is aria-hidden and ignores pointer events.

## Emblem rationale

Every emblem occupies exactly 19 columns by 7 rows, with an identical outer frame, four centered subject rows, and one caption. CORE uses a central diamond/cell, NET connected junctions, SIG mirrored transmission brackets, VAULT nested lock frames, and BUILD structural bays. Shared strokes and bilateral symmetry replace the previous varied sizes and decorative fills. Route mapping is unchanged; route art is periwinkle with no blur.

## Validation

- `npx tsc --noEmit` — passed.
- `npm run build` — passed. Next emitted workspace-root, middleware-deprecation, and NFT tracing warnings; Node emitted experimental SQLite warnings.
- Transpiled the TypeScript artwork and compared all three exported asset strings against their source files: exact matches, including backslashes and whitespace.
- Checked every route emblem: exactly 7 rows, every row exactly 19 characters.
- `git diff --check` reports only intentional trailing whitespace inside the verbatim supplied artwork.
- No API, collector, token, 3D component, or public brand-image files changed.
