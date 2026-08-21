# Glass Cockpit — a visual system for Mission Control

**Date:** 2026-08-21
**Status:** approved, not yet implemented
**Scope:** a shared instrument design system, built on Home first, then applied to the
13 other pages (14 total).

---

## 1. Why

The dashboard reads as "cyberpunk HUD": near-black ground, one bright accent, glow,
corner brackets, round dials. It is competent but it is also the default look every
AI-generated dashboard converges on, and measurement shows it is spending its budget
in the wrong places.

Measured on the running app at 390px (2026-08-21):

| Finding | Evidence |
|---|---|
| Half the JS is three.js, and it renders nothing | 876 KB chunk (`WebGLRenderer`, `BufferGeometry`); ambient canvas is `0×0`, home orb canvas is `300×150` (the HTML default) inside a `316×118` box |
| Performance is not the constraint | Idle main thread: **0.52 ms/frame = 6%** of the 8.33 ms budget for 120 Hz |
| One genuine 120 Hz blocker | `.mc-feed` animates `left` — not compositable; 193 layouts / 300 style recalcs per 5 s |
| Instruments are sparse where it counts | CPU, GPU-0 and GPU-1 each occupy a 128 px dial to display `0%` |

So the goal is not more effects. It is to stop paying for decoration that does not
render, and spend the reclaimed space and budget on density.

## 2. Direction

The app's own vocabulary is Mission Control, and its documented methodology is
Flight Director. Glass-cockpit avionics is therefore not a costume — it is the
subject's own instrument language, and it comes with real rules: a caution
hierarchy, tapes for bounded values, annunciators for state, fixed-field data
blocks. It reads as futuristic because it is dense and calm, not because it glows.

**The one risk taken:** delete three.js entirely (876 KB, two WebGL contexts, four
components) and spend nothing on ambient decoration. Motion happens only when
something happened.

## 3. Tokens

### 3.1 Colour

The four state colours are semantic constants. The reference colour continues to
derive from `appearance.accentColor` via `lib/theme.ts` — the accent stays
user-configurable and nothing here hardcodes dodger blue.

| Token | Value | Meaning | Rule |
|---|---|---|---|
| `--ct-ground` | `#05080d` | panel ground | |
| `--ct-panel` | `#0a0f16` | raised surface | |
| `--ct-ref` | `var(--pt-neon)` | reference data, selection | derived from config |
| `--ct-read` | `#e8eef5` | primary readout | the default colour for a number |
| `--ct-nominal` | `#3ddc84` | live / healthy | never decorative |
| `--ct-caution` | `#ffb020` | needs awareness | stale cron, budget, thermal |
| `--ct-warn` | `#ff4d4d` | needs action now | extends the existing rule in `lib/tokens.ts` |

`--ct-warn` inherits the project's standing constraint: **red is always semantic,
never decorative.** `--ct-caution` takes on the same constraint.

Utilisation (CPU %, GPU %) is deliberately excluded from the caution scale. A
pegged core is the machine doing its job. Only capacity (memory, disk, VRAM) and
genuine faults (thermal, staleness, failure) may colour.

### 3.2 Type

No new font files — a webfont would work against the load goal that deleting
three.js exists to serve. Three roles, two faces already loaded:

| Role | Face | Treatment | Sizes |
|---|---|---|---|
| Readout | JetBrains Mono | `font-variant-numeric: tabular-nums`, 700 | 34 / 23 / 17 / 13 |
| Label | Inter | uppercase, 600, `letter-spacing: 0.18em` | 7 / 8 / 9 |
| Prose | Inter | 400, normal case | 11 / 13 |

All-caps grotesque at 7–9 px *is* the instrument-label idiom; it needs no novelty
face to be distinctive. Tabular figures are non-negotiable on readouts — digits
must not reflow as values change.

### 3.3 Space

A 4 px base unit. Panel padding 12/16. Field row height 22. Tape height 28.
Gaps: 4 within a field, 8 within a group, 16 between panels.

## 4. Primitives

Four components in `components/cockpit/`, each with one job, each independently
testable. Every page is rebuilt from these.

### 4.1 `Tape`

Horizontal scale with a bug marker and tick marks. Replaces the round dial for any
bounded 0–100 value.

```
CPU  ▕▂     ▏  2%   5.15GHz  38°C
MEM  ▕████▊ ▏ 18%   8.6/46.9G
```

- **28 px tall against the dial's 128 px.** Four rig dials collapse into one strip,
  and a metric at 0% stops costing a third of a phone screen.
- Bug position animates via `transform: translateX` only.
- Colour: `--ct-ref` for utilisation. Capacity metrics use the **capacity scale**,
  defined once here and nowhere else: `--ct-ref` below 75%, `--ct-caution` at
  75–90%, `--ct-warn` above 90%. Utilisation never uses it (see 3.1).
- Props: `label`, `pct`, `value`, `detail?`, `tone?`.

### 4.2 `Annunciator` — the signature

A grid of labelled lamps. **Dark is the nominal state.** A black grid means
everything is fine; light means act.

```
┌ ANNUNCIATOR ────────────────────┐
│ ·APPROVAL  ·CRON  ·DISK  ·AGENT │
│ ·BUDGET    ·SYNC  ·TEMP  ■STALE │
└─────────────────────────────────┘
  dark = nominal · lit = needs you
```

This replaces the current "NEEDS YOU / ALL CLEAR" text row with something readable
in one glance from across the room, and it is where the design spends its boldness.
Everything around it stays quiet.

- Lamp states: `nominal` (dark), `caution` (amber), `warn` (red), `info` (ref).
- A lit lamp is a link to the page that resolves it.
- State change animates `opacity` over 120 ms. Lamps never blink — blinking is
  reserved and this system has nothing that earns it.
- Each lamp carries a text label at all times. Colour never carries meaning alone.

### 4.3 `Field`

`label · leader dots · value` on a fixed grid, so values align down a column
regardless of label length.

```
plan ................... Claude Pro
openrouter billed .......... $16.71
```

### 4.4 `Panel`

Replaces `Window`. Corner ticks rather than full brackets, tighter chrome, an
optional right-aligned meta slot. `Window` is kept during rollout and removed when
the last page stops importing it.

## 5. The 120 Hz contract

Enforced as a rule, not an aspiration.

1. **Only `transform` and `opacity` animate.** No `left`, `top`, `width`, `height`,
   `box-shadow`, `filter`, or `background-position` in any transition or keyframe.
2. **Zero ambient motion.** Animation occurs on state change or direct interaction
   only. This is also the avionics logic: nothing moves unless something happened.
3. `prefers-reduced-motion: reduce` disables all remaining transitions.
4. `content-visibility: auto` stays on long lists.

Fixes required by rule 1:
- `.mc-feed` `left` → `transform: translateX` (the only current violation).
- Audit the 44 existing `infinite` animation declarations (across 50 `@keyframes`
  blocks); delete every ambient one, convert any survivor to transform/opacity.

## 6. Deletions

| File | Reason | Consequence |
|---|---|---|
| `components/AmbientNeuralField.tsx` | renders a `0×0` canvas | none; it is already invisible |
| `components/views/CoreOrb3D.tsx` | renders `300×150` in a `316×118` box | Home hero slot is taken by `Annunciator` |
| `components/views/HoloHud3D.tsx` | only consumers are the two above and `SubAgentPanel` | `SubAgentPanel` falls back to its existing `ListView`, a path already built and shipped |
| deps: `three`, `@react-three/fiber`, `@react-three/drei` | 876 KB, ~50% of JS | two fewer WebGL contexts |

`components/views/MemoryGraph.tsx` is **not** affected — it is d3-force + SVG and
never imported three.

`appearance.elements3d` loses `homeGlobe` and `teamGraph`; `memoryGraph` remains and
still toggles the force graph. `lib/config.ts` continues to accept the removed keys
and ignore them, so an existing `data/config.json` keeps loading unchanged. The two
dead toggles are removed from `/setup`.

## 7. Sequence

**Phase 1 — system + Home.** Tokens, the four primitives with unit tests for their
pure logic (tape scaling, lamp state derivation), Home rebuilt, three.js deleted,
`.mc-feed` fixed. Ends with a screenshot for review before anything else changes.

**Phase 2 — rollout.** The 13 remaining pages, one commit each, in descending order
of use: chat, costs, kanban, projects, github, pipeline, calendar, team, memory,
content-creation, ml-content, setup, and finally styleguide — which is updated last
and becomes the living reference for the primitives.

## 8. Verification

Per phase, not at the end:

- `npm test` — unit tests for primitive logic.
- **Composited-property audit** — walk `document.getAnimations()` and assert every
  animated property is `transform`/`opacity`/`filter`. Fails the build rule if not.
- **Frame-budget probe** — `Performance.getMetrics` over a 5 s idle window; assert
  `TaskDuration` per 120 Hz frame stays under 8.33 ms with margin. Baseline today:
  0.52 ms (6%).
- **Real-touch smoke test** — `Input.dispatchTouchEvent`, not `element.click()`.
  A synthetic click bypasses hit-testing and reported a clean pass on a chat page
  that was entirely inert to a finger. Every interactive surface gets a real tap.
- **Overflow check** at 375 px — `.mc-main` scrollWidth must equal clientWidth.
- Screenshots at 390 px and 1440 px per page.

## 9. Out of scope

- The universal chat hub (separate design, already brainstormed).
- Any change to collectors, APIs, or data semantics.
- New fonts, new dependencies, new pages.
