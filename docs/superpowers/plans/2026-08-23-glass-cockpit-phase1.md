# Glass Cockpit Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the dead three.js weight, fix the one real 120 Hz violation, build the four glass-cockpit primitives (`Tape`, `Annunciator`, `Field`, `Panel`) with unit-tested pure logic, prove them on `/styleguide`, then rebuild Home on top of them.

**Architecture:** `lib/cockpit-tokens.ts` emits the new CSS custom properties the same way `lib/tokens.ts` does today (a `buildCockpitTokenCss()` string injected by the root layout). `components/cockpit/` holds the four primitives, each split into a pure logic module (no DOM, unit-tested with `node --test`) and a thin render component. Home (`components/HomeDeck.tsx`) and the CPU/MEM/GPU/DISK dials in `components/views/RigHud.tsx` are rebuilt to consume them. `three`, `@react-three/fiber`, `@react-three/drei` and their three consumer files are deleted.

**Tech Stack:** Next.js App Router, React 19, TypeScript, `node --test` (with the existing `tests/helpers/ts-resolve.mjs` resolve hook for extension-free imports), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-21-glass-cockpit-design.md`

## Global Constraints

- Only `transform` and `opacity` may appear in any CSS `transition` or `@keyframes` block used by cockpit code — no `left`, `top`, `width`, `height`, `box-shadow`, `filter`, `background-position` (spec §5 rule 1).
- Zero ambient motion — animation only on state change or direct interaction (spec §5 rule 2).
- `prefers-reduced-motion: reduce` must disable all cockpit transitions (spec §5 rule 3).
- Utilisation (CPU %, GPU %) never uses the capacity colour scale; only capacity (memory, disk, VRAM) and genuine faults may colour (spec §3.1, §4.1).
- `--ct-warn` and `--ct-caution` are semantic only, never decorative — extends the project's standing "red is always semantic" rule (spec §3.1).
- Readouts use `font-variant-numeric: tabular-nums` — digits must not reflow (spec §3.2).
- No new fonts, no new dependencies (spec §9).
- `data/config.json` files with `elements3d.homeGlobe` / `elements3d.teamGraph` keys must keep loading without error even though those toggles are removed (spec §6).

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/cockpit-tokens.ts` | Raw token values (colour/type/space) + `buildCockpitTokenCss()`. Pure, no imports. |
| `lib/cockpit/tape-logic.ts` | Pure functions: clamp/scale a value to tick position, derive capacity tone. |
| `lib/cockpit/annunciator-logic.ts` | Pure functions: derive a lamp's `nominal/caution/warn/info` state from a boolean/threshold input. |
| `components/cockpit/Tape.tsx` | Renders one horizontal tape row from `lib/cockpit/tape-logic.ts` output. |
| `components/cockpit/Annunciator.tsx` | Renders the lamp grid from `lib/cockpit/annunciator-logic.ts` output. |
| `components/cockpit/Field.tsx` | `label · leader dots · value` row. No logic to extract — trivial render. |
| `components/cockpit/Panel.tsx` | Corner-tick chrome wrapper, replaces `Window` incrementally. |
| `tests/cockpit-tape-logic.test.mjs` | Unit tests for `tape-logic.ts`. |
| `tests/cockpit-annunciator-logic.test.mjs` | Unit tests for `annunciator-logic.ts`. |
| `app/styleguide/page.tsx` | Modified: add a Cockpit Primitives section rendering all four with representative props. |
| `components/HomeDeck.tsx` | Modified: hero slot becomes `Annunciator`; `CoreOrb3D` import/usage removed. |
| `components/views/RigHud.tsx` | Modified: `Dial`/`arcPath`/`polar` removed; CPU/MEMORY/GPU·N/DISK rows use `Tape`. |
| `components/Shell.tsx` | Modified: `AmbientNeuralField` import + usage removed. |
| `components/views/SubAgentPanel.tsx` | Modified: HOLO 3D toggle, `holoAllowed`/`holoOn`/`showHolo`, `HoloHud3D` import removed. Roster becomes the only view. |
| `lib/config.ts` | Modified: `elements3d` type/default drop `homeGlobe`/`teamGraph`, keep `memoryGraph`. |
| `components/ui-settings.tsx` | Modified: `DEFAULT_UI_SETTINGS.elements3d` drops `homeGlobe`/`teamGraph`. |
| `app/setup/page.tsx` | Modified: `Elements3d` type + HOME GLOBE / TEAM GRAPH buttons removed; MEMORY GRAPH stays. |
| `app/globals.css` | Modified: `.mc-feed-row { left: ... }` → `transform: translateX`; new `.cockpit-*` classes appended. |
| `package.json` | Modified: `three`, `@react-three/fiber`, `@react-three/drei` removed from `dependencies`. |
| Deleted | `components/AmbientNeuralField.tsx`, `components/views/CoreOrb3D.tsx`, `components/views/HoloHud3D.tsx` |

---

## Task 1: Delete three.js and fix the `.mc-feed` animation

Pure subtraction plus one CSS property swap — zero design risk, lands independently of everything else in this plan.

**Files:**
- Modify: `components/Shell.tsx` (remove `AmbientNeuralField` dynamic import + `<AmbientNeuralField />`)
- Modify: `components/HomeDeck.tsx` (remove `CoreOrb3D` dynamic import, the `elements3d.homeGlobe &&` conditional, leave `.mc-home-coreorb-holder` empty — matches its existing documented "off" behavior, so no visual change)
- Modify: `components/views/SubAgentPanel.tsx` (remove `HoloHud3D` dynamic import and everything gated by it — see Step 3)
- Modify: `lib/config.ts`, `components/ui-settings.tsx`, `app/setup/page.tsx` (drop `homeGlobe`/`teamGraph`)
- Delete: `components/AmbientNeuralField.tsx`, `components/views/CoreOrb3D.tsx`, `components/views/HoloHud3D.tsx`
- Modify: `package.json` (remove `three`, `@react-three/fiber`, `@react-three/drei`)
- Modify: `app/globals.css:2462-2472` (`.mc-feed-row` positioning)
- Find and audit: every `infinite` animation in `app/globals.css` for non-composited properties (Step 6)

**Interfaces:** None — this task produces no new exports. It only removes call sites.

- [ ] **Step 1: Confirm current `.mc-feed-row` animation property**

Run: `rg -n "mc-feed-row" app/globals.css`

Find the rule with `animation:` referencing a `@keyframes` block that animates `left`. Read that `@keyframes` block (e.g. `slide-in` or similar) via `sed -n '<start>,<end>p' app/globals.css` using the line numbers from the grep.

- [ ] **Step 2: Rewrite the keyframes to use `transform`**

If the block is e.g.:
```css
@keyframes feed-slide-in {
  from { left: -8px; opacity: 0; }
  to { left: 0; opacity: 1; }
}
```
change it to:
```css
@keyframes feed-slide-in {
  from { transform: translateX(-8px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```
Keep the rest of the rule (duration, easing, `animation-fill-mode`) unchanged. If the element also has a static `left` for layout (not animated), leave that alone — only the animated property changes.

- [ ] **Step 3: Remove the HOLO 3D toggle from SubAgentPanel**

In `components/views/SubAgentPanel.tsx`:
- Delete line 47: `const HoloHud3D = dynamic(...)`.
- Delete `const holoAllowed = elements3d.teamGraph`, `const [holoOn, setHoloOn] = useState(false)`, `const showHolo = holoAllowed && holoOn`.
- Delete the `{holoAllowed && (<Button ...>{holoOn ? 'ROSTER' : 'HOLO 3D'}</Button>)}` block.
- Delete the `{showHolo ? (<>...<HoloHud3D .../>...</>) : (` branch entirely, keeping only the roster branch's contents (the `)` that previously closed the ternary's else-branch now just closes the surrounding JSX normally — read the full ternary with `sed -n '270,420p' components/views/SubAgentPanel.tsx` before editing to get the exact boundaries).
- Simplify `<span className="mc-sub-kicker">{showHolo ? 'HOLO DISPATCH · 3D TREE' : 'TEAM · SHIFT ROSTER'}</span>` to the literal string `'TEAM · SHIFT ROSTER'`.
- Simplify `{!showHolo && (<span className="mc-shift-counts">...)}` to render unconditionally.
- Remove the now-unused `useUiSettings` import if nothing else in the file uses it (`rg -n "useUiSettings" components/views/SubAgentPanel.tsx` to check).

- [ ] **Step 4: Delete the three.js files and their imports**

```bash
git rm components/AmbientNeuralField.tsx components/views/CoreOrb3D.tsx components/views/HoloHud3D.tsx
```

In `components/Shell.tsx`, remove the `AmbientNeuralField` dynamic import (near line 15) and its render call (near line 250).

In `components/HomeDeck.tsx`, remove:
```ts
const CoreOrb3D = dynamic(() => import('./views/CoreOrb3D').then(m => m.default), { ssr: false, loading: () => null })
```
and change
```tsx
<div className="mc-home-coreorb-holder">
  {elements3d.homeGlobe && <CoreOrb3D />}
</div>
```
to
```tsx
<div className="mc-home-coreorb-holder" />
```
Also remove the now-unused `const { elements3d } = useUiSettings()` line and its import if nothing else in `HomeDeck.tsx` reads `elements3d` (check with `rg -n "elements3d" components/HomeDeck.tsx`).

- [ ] **Step 5: Drop `homeGlobe`/`teamGraph` from config, defaults, and Setup**

In `lib/config.ts`:
- Change the `elements3d` type (near line 90) from `{ homeGlobe: boolean; memoryGraph: boolean; teamGraph: boolean }` to `{ memoryGraph: boolean }`.
- In the default-building block (near line 267-271), remove the `homeGlobe:` and `teamGraph:` lines, keep only:
```ts
elements3d: {
  memoryGraph: file.appearance?.elements3d?.memoryGraph !== false,
},
```
(A `data/config.json` with old `homeGlobe`/`teamGraph` keys still parses fine — those keys are simply never read.)

In `components/ui-settings.tsx`, change `DEFAULT_UI_SETTINGS.elements3d` from `{ homeGlobe: true, memoryGraph: true, teamGraph: true }` to `{ memoryGraph: true }`.

In `app/setup/page.tsx`:
- Change `type Elements3d = { homeGlobe: boolean; memoryGraph: boolean; teamGraph: boolean }` to `type Elements3d = { memoryGraph: boolean }`.
- Delete the HOME GLOBE and TEAM GRAPH `<Button>` blocks (lines ~309-311 and ~315-317), keep the MEMORY GRAPH one.
- Update the trailing `<em>` help text to drop the "Home globe is pure decoration..." clause, keeping the Memory-graph-related part.

- [ ] **Step 6: Remove the three.js dependencies**

```bash
node node_modules/.bin/next --version >/dev/null 2>&1 || true  # sanity: next CLI resolvable before editing package.json
```
Edit `package.json`: remove the three lines for `"@react-three/drei"`, `"@react-three/fiber"`, `"three"` from `dependencies`.
```bash
npm install
```
(This regenerates the lockfile without the three.js tree — run it and let it complete; do not hand-edit the lockfile.)

- [ ] **Step 7: Audit remaining `infinite` animations for non-composited properties**

```bash
rg -n "animation:.*infinite" app/globals.css
```
For each match, find its `@keyframes` block and check whether it animates anything other than `transform`/`opacity`/`filter`:
```bash
rg -n "@keyframes" app/globals.css
```
For any block that is genuinely ambient (loops forever with no state-change trigger) and animates a non-composited property, convert it to `transform`/`opacity` following the same pattern as Step 2, or delete it if the spec's "zero ambient motion" rule means it shouldn't animate at all (check against spec §5 rule 2 — an `infinite` glow/pulse with no state trigger is exactly what that rule forbids). Do this conservatively: only touch a keyframes block if you can point to the exact non-composited property it animates. Leave state-triggered animations (e.g. `.mc-led.green`, hover states) alone even if `infinite` — re-read their trigger before deciding.

- [ ] **Step 8: Build and verify no dangling references**

```bash
node node_modules/.bin/next build
```
Expected: build succeeds with no "Module not found" errors for `three`, `@react-three/fiber`, `@react-three/drei`, `CoreOrb3D`, `HoloHud3D`, or `AmbientNeuralField`.

```bash
rg -n "CoreOrb3D|HoloHud3D|AmbientNeuralField|@react-three|from 'three'" --type ts --type tsx . -g '!node_modules' -g '!.next' -g '!.worktrees'
```
Expected: no output.

- [ ] **Step 9: Run the test suite**

```bash
npm test
```
Expected: all existing tests still pass (this task touches no tested logic).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "perf: delete three.js (876KB, 2 WebGL contexts) and fix .mc-feed's non-composited animation"
```

---

## Task 2: Cockpit design tokens

**Files:**
- Create: `lib/cockpit-tokens.ts`
- Modify: `app/layout.tsx` (inject `buildCockpitTokenCss()` alongside the existing token injection — read the file first to find the exact injection point)

**Interfaces:**
- Produces: `COCKPIT_COLOR: Record<string, string>`, `COCKPIT_TYPE`, `COCKPIT_SPACE`, `buildCockpitTokenCss(): string`.

- [ ] **Step 1: Read how `lib/tokens.ts` is injected today**

```bash
rg -n "buildTokenCss|buildAccentCss" app/layout.tsx lib/tokens.ts
```
Note the exact pattern (a `<style>` tag with `dangerouslySetInnerHTML`, or similar) so `buildCockpitTokenCss()` is injected the same way.

- [ ] **Step 2: Write `lib/cockpit-tokens.ts`**

```ts
/**
 * lib/cockpit-tokens.ts — glass-cockpit design tokens (spec §3).
 *
 * Additive to lib/tokens.ts, not a replacement: existing --pt-* tokens are
 * untouched. --ct-ref derives from the same accent lib/theme.ts already
 * resolves from appearance.accentColor — nothing here hardcodes a color.
 */

export const COCKPIT_COLOR = {
  ground: '#05080d',
  panel: '#0a0f16',
  ref: 'var(--pt-neon)',
  read: '#e8eef5',
  nominal: '#3ddc84',
  caution: '#ffb020',
  warn: '#ff4d4d',
} as const

export const COCKPIT_TYPE = {
  readoutSizes: [34, 23, 17, 13] as const,
  labelSizes: [7, 8, 9] as const,
  proseSizes: [11, 13] as const,
} as const

export const COCKPIT_SPACE = {
  base: 4,
  panelPadding: 12,
  panelPaddingLg: 16,
  fieldRowHeight: 22,
  tapeHeight: 28,
  gapField: 4,
  gapGroup: 8,
  gapPanel: 16,
} as const

/** Capacity scale (spec §3.1, §4.1) — utilisation (CPU/GPU %) never uses this. */
export const CAPACITY_CAUTION_PCT = 75
export const CAPACITY_WARN_PCT = 90

export function buildCockpitTokenCss(): string {
  return `:root{
--ct-ground:${COCKPIT_COLOR.ground};
--ct-panel:${COCKPIT_COLOR.panel};
--ct-ref:${COCKPIT_COLOR.ref};
--ct-read:${COCKPIT_COLOR.read};
--ct-nominal:${COCKPIT_COLOR.nominal};
--ct-caution:${COCKPIT_COLOR.caution};
--ct-warn:${COCKPIT_COLOR.warn};
--ct-space-1:${COCKPIT_SPACE.base}px;
--ct-panel-pad:${COCKPIT_SPACE.panelPadding}px;
--ct-panel-pad-lg:${COCKPIT_SPACE.panelPaddingLg}px;
--ct-field-row-h:${COCKPIT_SPACE.fieldRowHeight}px;
--ct-tape-h:${COCKPIT_SPACE.tapeHeight}px;
--ct-gap-field:${COCKPIT_SPACE.gapField}px;
--ct-gap-group:${COCKPIT_SPACE.gapGroup}px;
--ct-gap-panel:${COCKPIT_SPACE.gapPanel}px;
}`
}
```

- [ ] **Step 3: Wire the injection into `app/layout.tsx`**

Following the exact pattern found in Step 1, add a second style injection for `buildCockpitTokenCss()` next to the existing one. Do not remove or alter the existing `lib/tokens.ts` injection.

- [ ] **Step 4: Build and visually sanity-check**

```bash
node node_modules/.bin/next build
```
Expected: succeeds. (No component consumes `--ct-*` yet — this task only makes the variables available.)

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit-tokens.ts app/layout.tsx
git commit -m "feat(cockpit): design tokens (color/type/space) per glass-cockpit spec"
```

---

## Task 3: `Tape` primitive

**Files:**
- Create: `lib/cockpit/tape-logic.ts`
- Create: `tests/cockpit-tape-logic.test.mjs`
- Create: `components/cockpit/Tape.tsx`
- Modify: `app/globals.css` (append `.ct-tape*` rules)

**Interfaces:**
- Consumes: `--ct-ref`, `--ct-caution`, `--ct-warn` from Task 2.
- Produces: `clampPct(pct: number): number`, `capacityTone(pct: number): 'ref' | 'caution' | 'warn'`, `bugOffsetPct(pct: number, tapeWidthPct?: number): number` from `lib/cockpit/tape-logic.ts`. `Tape` component props: `{ label: string; pct: number; value: string; detail?: string; capacity?: boolean }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/cockpit-tape-logic.test.mjs`:
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { clampPct, capacityTone, bugOffsetPct } from '../lib/cockpit/tape-logic.ts'

test('clampPct clamps below 0 and above 100', () => {
  assert.equal(clampPct(-5), 0)
  assert.equal(clampPct(140), 100)
  assert.equal(clampPct(42), 42)
})

test('capacityTone: ref below 75, caution 75-90, warn above 90', () => {
  assert.equal(capacityTone(0), 'ref')
  assert.equal(capacityTone(74.9), 'ref')
  assert.equal(capacityTone(75), 'caution')
  assert.equal(capacityTone(90), 'warn')
  assert.equal(capacityTone(100), 'warn')
})

test('bugOffsetPct maps 0-100 linearly onto the tape width', () => {
  assert.equal(bugOffsetPct(0), 0)
  assert.equal(bugOffsetPct(100), 100)
  assert.equal(bugOffsetPct(50), 50)
})

test('bugOffsetPct clamps out-of-range input the same as clampPct', () => {
  assert.equal(bugOffsetPct(-10), 0)
  assert.equal(bugOffsetPct(200), 100)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/cockpit/tape-logic.ts'`.

- [ ] **Step 3: Implement `lib/cockpit/tape-logic.ts`**

```ts
/**
 * lib/cockpit/tape-logic.ts — pure logic for the Tape primitive (spec §4.1).
 * No DOM, no imports — the bug-position math and capacity-tone thresholds
 * are unit-tested here so components/cockpit/Tape.tsx stays a thin render.
 */
import { CAPACITY_CAUTION_PCT, CAPACITY_WARN_PCT } from '../cockpit-tokens'

export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0
  return Math.min(100, Math.max(0, pct))
}

/**
 * Capacity scale (memory/disk/VRAM only — never utilisation, spec §3.1).
 * ref below 75%, caution 75-90%, warn above 90%.
 */
export function capacityTone(pct: number): 'ref' | 'caution' | 'warn' {
  const p = clampPct(pct)
  if (p >= CAPACITY_WARN_PCT) return 'warn'
  if (p >= CAPACITY_CAUTION_PCT) return 'caution'
  return 'ref'
}

/** Bug marker's translateX offset as a percentage of tape width. */
export function bugOffsetPct(pct: number): number {
  return clampPct(pct)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — all 4 new tests green, all prior tests still green.

- [ ] **Step 5: Implement `components/cockpit/Tape.tsx`**

```tsx
'use client'

/**
 * Tape — horizontal bounded-value scale (spec §4.1). Replaces the round
 * dial: 28px tall vs. 128px, and a 0% metric no longer costs a third of a
 * phone screen.
 */
import { clampPct, capacityTone, bugOffsetPct } from '@/lib/cockpit/tape-logic'

const TONE_VAR: Record<'ref' | 'caution' | 'warn', string> = {
  ref: 'var(--ct-ref)', caution: 'var(--ct-caution)', warn: 'var(--ct-warn)',
}

export function Tape({ label, pct, value, detail, capacity }: {
  label: string
  pct: number
  value: string
  detail?: string
  /** True for memory/disk/VRAM (colours via the capacity scale). Utilisation stays --ct-ref always. */
  capacity?: boolean
}) {
  const clamped = clampPct(pct)
  const tone = capacity ? capacityTone(clamped) : 'ref'
  const color = TONE_VAR[tone]
  const offset = bugOffsetPct(clamped)

  return (
    <div className="ct-tape" title={`${label} — ${value}${detail ? ` (${detail})` : ''}`}>
      <span className="ct-tape-label">{label}</span>
      <div className="ct-tape-track">
        <div className="ct-tape-fill" style={{ width: `${clamped}%`, background: color }} />
        <div className="ct-tape-bug" style={{ transform: `translateX(${offset}%)`, background: color }} />
      </div>
      <span className="ct-tape-value" style={{ color }}>{value}</span>
      {detail && <span className="ct-tape-detail">{detail}</span>}
    </div>
  )
}
```

- [ ] **Step 6: Add CSS**

Append to `app/globals.css`:
```css
.ct-tape { display: flex; align-items: center; height: var(--ct-tape-h); gap: var(--ct-gap-field); }
.ct-tape-label { width: 52px; flex-shrink: 0; font: 600 8px/1 var(--pt-font-ui); letter-spacing: 0.18em; text-transform: uppercase; color: var(--pt-text-dim); }
.ct-tape-track { position: relative; flex: 1; height: 6px; background: var(--ct-panel); border: 1px solid var(--pt-border); overflow: hidden; }
.ct-tape-fill { position: absolute; inset: 0 auto 0 0; }
.ct-tape-bug { position: absolute; top: -2px; left: -1px; width: 2px; height: 10px; transform: translateX(0); }
.ct-tape-value { font: 700 13px/1 var(--pt-font-mono); font-variant-numeric: tabular-nums; min-width: 3.5ch; text-align: right; color: var(--ct-read); }
.ct-tape-detail { font: 400 11px/1 var(--pt-font-ui); color: var(--pt-text-dim); white-space: nowrap; }
```
(Verify `--pt-font-ui`/`--pt-font-mono` are the actual variable names in use: `rg -n "\-\-pt-font" app/globals.css | head -5` — adjust names in the CSS above to match if different.)

- [ ] **Step 7: Commit**

```bash
git add lib/cockpit/tape-logic.ts tests/cockpit-tape-logic.test.mjs components/cockpit/Tape.tsx app/globals.css
git commit -m "feat(cockpit): Tape primitive with unit-tested scale/tone logic"
```

---

## Task 4: `Annunciator` primitive

**Files:**
- Create: `lib/cockpit/annunciator-logic.ts`
- Create: `tests/cockpit-annunciator-logic.test.mjs`
- Create: `components/cockpit/Annunciator.tsx`
- Modify: `app/globals.css` (append `.ct-annun*` rules)

**Interfaces:**
- Produces: `type LampState = 'nominal' | 'caution' | 'warn' | 'info'`, `deriveLampState(input: { active: boolean; severity?: 'caution' | 'warn' | 'info' }): LampState` from `lib/cockpit/annunciator-logic.ts`. `Annunciator` component props: `{ lamps: Array<{ key: string; label: string; state: LampState; href?: string }> }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/cockpit-annunciator-logic.test.mjs`:
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveLampState } from '../lib/cockpit/annunciator-logic.ts'

test('inactive lamp is always nominal regardless of requested severity', () => {
  assert.equal(deriveLampState({ active: false }), 'nominal')
  assert.equal(deriveLampState({ active: false, severity: 'warn' }), 'nominal')
})

test('active lamp defaults to warn when no severity given', () => {
  assert.equal(deriveLampState({ active: true }), 'warn')
})

test('active lamp honors an explicit severity', () => {
  assert.equal(deriveLampState({ active: true, severity: 'caution' }), 'caution')
  assert.equal(deriveLampState({ active: true, severity: 'info' }), 'info')
  assert.equal(deriveLampState({ active: true, severity: 'warn' }), 'warn')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/cockpit/annunciator-logic.ts`**

```ts
/**
 * lib/cockpit/annunciator-logic.ts — pure lamp-state derivation (spec §4.2).
 * Dark (nominal) is the default state; a lamp only lights when its
 * condition is active. No DOM, no imports.
 */
export type LampState = 'nominal' | 'caution' | 'warn' | 'info'

export function deriveLampState(input: { active: boolean; severity?: 'caution' | 'warn' | 'info' }): LampState {
  if (!input.active) return 'nominal'
  return input.severity ?? 'warn'
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Implement `components/cockpit/Annunciator.tsx`**

```tsx
'use client'

/**
 * Annunciator — the signature primitive (spec §4.2). Dark grid = nominal.
 * A lit lamp always carries a text label and links to the page that
 * resolves it; color never carries meaning alone. State change animates
 * opacity over 120ms; lamps never blink.
 */
import Link from 'next/link'
import type { LampState } from '@/lib/cockpit/annunciator-logic'

export type Lamp = { key: string; label: string; state: LampState; href?: string }

const STATE_VAR: Record<LampState, string> = {
  nominal: 'transparent',
  caution: 'var(--ct-caution)',
  warn: 'var(--ct-warn)',
  info: 'var(--ct-ref)',
}

function LampCell({ lamp }: { lamp: Lamp }) {
  const lit = lamp.state !== 'nominal'
  const color = STATE_VAR[lamp.state]
  const content = (
    <>
      <span className="ct-annun-dot" style={{ background: color, opacity: lit ? 1 : 0.35 }} aria-hidden="true" />
      <span className="ct-annun-label">{lamp.label}</span>
    </>
  )
  if (lamp.href && lit) {
    return <Link href={lamp.href} className={`ct-annun-lamp is-${lamp.state}`}>{content}</Link>
  }
  return <div className={`ct-annun-lamp is-${lamp.state}`}>{content}</div>
}

export function Annunciator({ lamps }: { lamps: Lamp[] }) {
  return (
    <div className="ct-annun" role="status" aria-label="System annunciator panel">
      {lamps.map(l => <LampCell key={l.key} lamp={l} />)}
    </div>
  )
}
```

- [ ] **Step 6: Add CSS**

Append to `app/globals.css`:
```css
.ct-annun { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(120px, 100%), 1fr)); gap: 1px; background: var(--pt-border); border: 1px solid var(--pt-border); }
.ct-annun-lamp { display: flex; align-items: center; gap: var(--ct-gap-field); padding: var(--ct-space-1) var(--ct-gap-group); background: var(--ct-panel); text-decoration: none; color: inherit; transition: opacity 120ms ease; }
.ct-annun-lamp.is-nominal { color: var(--pt-text-dim); }
.ct-annun-lamp.is-warn { color: var(--ct-warn); }
.ct-annun-lamp.is-caution { color: var(--ct-caution); }
.ct-annun-lamp.is-info { color: var(--ct-ref); }
.ct-annun-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; transition: opacity 120ms ease; }
.ct-annun-label { font: 600 8px/1 var(--pt-font-ui); letter-spacing: 0.18em; text-transform: uppercase; }
@media (prefers-reduced-motion: reduce) { .ct-annun-lamp, .ct-annun-dot { transition: none; } }
```

- [ ] **Step 7: Commit**

```bash
git add lib/cockpit/annunciator-logic.ts tests/cockpit-annunciator-logic.test.mjs components/cockpit/Annunciator.tsx app/globals.css
git commit -m "feat(cockpit): Annunciator primitive with unit-tested lamp-state logic"
```

---

## Task 5: `Field` and `Panel` primitives

Both are pure render with no meaningful branching logic to unit-test — covered by the styleguide smoke render in Task 6 instead of dedicated unit tests (consistent with the plan's own "smallest unit worth a gate" rule: there is no pure-logic deliverable here to separate out).

**Files:**
- Create: `components/cockpit/Field.tsx`
- Create: `components/cockpit/Panel.tsx`
- Modify: `app/globals.css` (append `.ct-field*`, `.ct-panel*` rules)

**Interfaces:**
- Produces: `Field` props `{ label: string; value: string }`. `Panel` props `{ title: string; meta?: React.ReactNode; children: React.ReactNode }`.

- [ ] **Step 1: Implement `components/cockpit/Field.tsx`**

```tsx
/**
 * Field — label · leader dots · value on a fixed grid (spec §4.3), so
 * values align down a column regardless of label length.
 */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="ct-field">
      <span className="ct-field-label">{label}</span>
      <span className="ct-field-leader" aria-hidden="true" />
      <span className="ct-field-value">{value}</span>
    </div>
  )
}
```

- [ ] **Step 2: Implement `components/cockpit/Panel.tsx`**

```tsx
/**
 * Panel — replaces Window (spec §4.4). Corner ticks instead of full
 * brackets, tighter chrome, optional right-aligned meta slot. Window stays
 * available during rollout; this does not remove it.
 */
export function Panel({ title, meta, children }: {
  title: string
  meta?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="ct-panel">
      <div className="ct-panel-head">
        <span className="ct-panel-title">{title}</span>
        {meta && <span className="ct-panel-meta">{meta}</span>}
      </div>
      <div className="ct-panel-corner tl" aria-hidden="true" />
      <div className="ct-panel-corner tr" aria-hidden="true" />
      <div className="ct-panel-corner bl" aria-hidden="true" />
      <div className="ct-panel-corner br" aria-hidden="true" />
      <div className="ct-panel-body">{children}</div>
    </div>
  )
}
```

- [ ] **Step 3: Add CSS**

Append to `app/globals.css`:
```css
.ct-field { display: grid; grid-template-columns: max-content 1fr max-content; align-items: baseline; height: var(--ct-field-row-h); gap: var(--ct-gap-field); font: 400 13px/1 var(--pt-font-ui); }
.ct-field-label { color: var(--pt-text-dim); text-transform: lowercase; }
.ct-field-leader { border-bottom: 1px dotted var(--pt-border); margin: 0 var(--ct-gap-field) 3px; }
.ct-field-value { font-family: var(--pt-font-mono); font-variant-numeric: tabular-nums; color: var(--ct-read); }

.ct-panel { position: relative; background: var(--ct-panel); border: 1px solid var(--pt-border); padding: var(--ct-panel-pad); }
.ct-panel-head { display: flex; align-items: center; gap: var(--ct-gap-group); margin-bottom: var(--ct-gap-group); }
.ct-panel-title { font: 600 9px/1 var(--pt-font-ui); letter-spacing: 0.18em; text-transform: uppercase; color: var(--pt-text-dim); }
.ct-panel-meta { margin-left: auto; font: 400 11px/1 var(--pt-font-ui); color: var(--pt-text-dim); }
.ct-panel-corner { position: absolute; width: 8px; height: 8px; border-color: var(--pt-border-strong); pointer-events: none; }
.ct-panel-corner.tl { top: -1px; left: -1px; border-top: 1px solid; border-left: 1px solid; }
.ct-panel-corner.tr { top: -1px; right: -1px; border-top: 1px solid; border-right: 1px solid; }
.ct-panel-corner.bl { bottom: -1px; left: -1px; border-bottom: 1px solid; border-left: 1px solid; }
.ct-panel-corner.br { bottom: -1px; right: -1px; border-bottom: 1px solid; border-right: 1px solid; }
```
(Confirm `--pt-border-strong` exists: `rg -n "\-\-pt-border-strong" app/globals.css | head -3` — it's already referenced by `RigHud.tsx`'s dial brackets, so it should exist.)

- [ ] **Step 4: Build**

```bash
node node_modules/.bin/next build
```
Expected: succeeds (no page imports these yet, so this only checks for syntax errors).

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/Field.tsx components/cockpit/Panel.tsx app/globals.css
git commit -m "feat(cockpit): Field and Panel primitives"
```

---

## Task 6: Wire all four primitives onto `/styleguide`

**Files:**
- Modify: `app/styleguide/page.tsx`

**Interfaces:**
- Consumes: `Tape` (Task 3), `Annunciator`+`Lamp` (Task 4), `Field`, `Panel` (Task 5).

- [ ] **Step 1: Read the current styleguide structure**

```bash
sed -n '1,232p' app/styleguide/page.tsx
```
Note the `Section`/`VariantCard` helpers already defined (from earlier exploration: `Section({id,label,children})`, `VariantCard({title,children})`) and how the page composes sections at the bottom (likely a default export rendering each `Section` in order — read the tail of the file to find the composition point).

- [ ] **Step 2: Add a Cockpit Primitives specimen function**

Insert near the other specimen functions (after `StatusSpecimens` or similar):
```tsx
import { Tape } from '@/components/cockpit/Tape'
import { Annunciator, type Lamp } from '@/components/cockpit/Annunciator'
import { Field } from '@/components/cockpit/Field'
import { Panel } from '@/components/cockpit/Panel'

function CockpitSpecimens() {
  const lamps: Lamp[] = [
    { key: 'agent', label: 'AGENT', state: 'nominal' },
    { key: 'cron', label: 'CRON', state: 'warn', href: '/calendar' },
    { key: 'sync', label: 'SYNC', state: 'nominal' },
    { key: 'data', label: 'DATA', state: 'caution', href: '/' },
    { key: 'task', label: 'TASK', state: 'nominal' },
    { key: 'live', label: 'LIVE', state: 'info' },
  ]
  return (
    <>
      <VariantCard title="Tape — utilisation (never colours by capacity)">
        <Tape label="CPU" pct={38} value="38%" detail="5.15GHz · 61°C" />
      </VariantCard>
      <VariantCard title="Tape — capacity, ref band (<75%)">
        <Tape label="MEM" pct={42} value="19.6G" detail="of 46.9G" capacity />
      </VariantCard>
      <VariantCard title="Tape — capacity, caution band (75-90%)">
        <Tape label="DISK" pct={81} value="810G" detail="of 1.0T" capacity />
      </VariantCard>
      <VariantCard title="Tape — capacity, warn band (>90%)">
        <Tape label="VRAM" pct={94} value="15.0G" detail="of 16.0G" capacity />
      </VariantCard>
      <VariantCard title="Annunciator — dark is nominal">
        <Annunciator lamps={lamps} />
      </VariantCard>
      <VariantCard title="Field">
        <Field label="plan" value="Claude Pro" />
        <Field label="openrouter billed" value="$16.71" />
      </VariantCard>
      <VariantCard title="Panel">
        <Panel title="EXAMPLE PANEL" meta="12 ITEMS">
          <Field label="status" value="nominal" />
        </Panel>
      </VariantCard>
    </>
  )
}
```

- [ ] **Step 3: Render the new section in the page composition**

Find where existing sections are composed (e.g. `<Section id="status" label="STATUS TONES"><StatusSpecimens /></Section>`) and add, in the same pattern:
```tsx
<Section id="cockpit" label="COCKPIT PRIMITIVES">
  <CockpitSpecimens />
</Section>
```
Place it after the existing token sections, before any component-variant sections that come last (match the file's existing ordering convention — read the tail of the file to confirm placement).

- [ ] **Step 4: Build and screenshot**

```bash
node node_modules/.bin/next build
```
Expected: succeeds.

Start the app (or use the running dev instance) and capture `/styleguide` at 390px and 1440px for review — this is the checkpoint before touching Home or RigHud.

- [ ] **Step 5: Commit**

```bash
git add app/styleguide/page.tsx
git commit -m "feat(cockpit): render Tape/Annunciator/Field/Panel specimens on /styleguide"
```

---

## Task 7: Rebuild `RigHud`'s CPU/MEMORY/GPU/DISK dials as `Tape`

**Files:**
- Modify: `components/views/RigHud.tsx`

**Interfaces:**
- Consumes: `Tape` (Task 3).
- Removes: `Dial` component, `DIAL`/`R_ARC`/`R_TICK`/`START_DEG`/`SWEEP_DEG`/`TICKS` constants, `polar`/`arcPath` functions, `bandColor` (superseded by `capacityTone` from `lib/cockpit/tape-logic.ts` for capacity metrics — utilisation metrics no longer call `bandColor` at all, matching spec §3.1's exclusion of utilisation from the capacity scale).
- Everything else in `RigHud.tsx` (Trace/scope, CoreDie, Vital, vitals row, network/volumes blocks) is **unchanged** — the spec only calls for the dial replacement.

- [ ] **Step 1: Confirm the full extent of `Dial` usage**

```bash
rg -n "<Dial|function Dial|DIAL =|R_ARC|R_TICK|START_DEG|SWEEP_DEG|TICKS =|function polar|function arcPath" components/views/RigHud.tsx
```
This should match the four `<Dial ...>` call sites (CPU, MEMORY, the `gpus.map` GPU loop, DISK) plus the definitions to delete.

- [ ] **Step 2: Replace the CPU dial**

Change:
```tsx
<Dial
  label="CPU"
  pct={s?.cpuPct ?? 0}
  value={(s?.cpuPct ?? 0).toFixed(0)}
  unit="%"
  sub={[...].filter(Boolean).join(' · ') || 'n/a'}
  color="var(--pt-neon-bright)"
  subTone={tempTone(s?.cpuTempC)}
/>
```
to:
```tsx
<Tape
  label="CPU"
  pct={s?.cpuPct ?? 0}
  value={`${(s?.cpuPct ?? 0).toFixed(0)}%`}
  detail={[
    s?.cpuMhzMax ? `${(s.cpuMhzMax / 1000).toFixed(2)}GHz` : null,
    s?.cpuTempC != null ? `${s.cpuTempC.toFixed(0)}°C` : null,
  ].filter(Boolean).join(' · ') || 'n/a'}
/>
```
Note: no `capacity` prop — CPU is utilisation, stays on `--ct-ref` regardless of value (spec §3.1). The thermal `subTone`/`tempTone` coloring is dropped from the tape's value color (Tape doesn't expose a separate sub-tone slot); temperature stays visible in `detail` text. If you want thermal to still visually warn, that is a Phase-2-or-later Tape enhancement — do not add an ad hoc prop here; out of scope for this task.

- [ ] **Step 3: Replace the MEMORY dial**

Change:
```tsx
<Dial
  label="MEMORY"
  pct={memPct}
  value={s ? fmtGbFromKb(s.memUsedKb) : '—'}
  sub={s ? `of ${fmtGbFromKb(s.memTotalKb)} · ${fmtGbFromKb(s.memCachedKb)} cached` : 'n/a'}
  color="var(--pt-info)"
  capacity
/>
```
to:
```tsx
<Tape
  label="MEM"
  pct={memPct}
  value={s ? fmtGbFromKb(s.memUsedKb) : '—'}
  detail={s ? `of ${fmtGbFromKb(s.memTotalKb)} · ${fmtGbFromKb(s.memCachedKb)} cached` : 'n/a'}
  capacity
/>
```

- [ ] **Step 4: Replace the GPU dial loop**

Change:
```tsx
{gpus.map(g => (
  <Dial
    key={g.index}
    label={`GPU·${g.index}`}
    pct={g.utilPct}
    value={String(g.utilPct)}
    unit="%"
    sub={`${g.name} · ${g.tempC}°C${g.powerW != null ? ` · ${g.powerW.toFixed(0)}W` : ''}`}
    color="var(--pt-neon)"
    subTone={tempTone(g.tempC)}
  />
))}
```
to:
```tsx
{gpus.map(g => (
  <Tape
    key={g.index}
    label={`GPU·${g.index}`}
    pct={g.utilPct}
    value={`${g.utilPct}%`}
    detail={`${g.name} · ${g.tempC}°C${g.powerW != null ? ` · ${g.powerW.toFixed(0)}W` : ''}`}
  />
))}
```
(No `capacity` — GPU utilisation, per spec §3.1.)

- [ ] **Step 5: Replace the DISK dial**

Change:
```tsx
<Dial
  label="DISK"
  pct={diskPct}
  value={rootMount ? fmtBytes(rootMount.usedBytes, 0) : '—'}
  sub={rootMount ? `of ${fmtBytes(rootMount.totalBytes, 0)} on ${rootMount.mount}` : 'n/a'}
  color="var(--pt-ok)"
  capacity
/>
```
to:
```tsx
<Tape
  label="DISK"
  pct={diskPct}
  value={rootMount ? fmtBytes(rootMount.usedBytes, 0) : '—'}
  detail={rootMount ? `of ${fmtBytes(rootMount.totalBytes, 0)} on ${rootMount.mount}` : 'n/a'}
  capacity
/>
```

- [ ] **Step 6: Delete the now-unused `Dial` machinery**

Delete the `Dial` function, the `DIAL`/`R_ARC`/`R_TICK`/`START_DEG`/`SWEEP_DEG`/`TICKS` constants, and the `polar`/`arcPath` functions (the whole "Radial dial" section header block). Keep `bandColor` — it's still used by the VRAM row (`mc-rig-vram-track`) and the volumes row (`mc-rig-mount`) later in the same file (`rg -n "bandColor" components/views/RigHud.tsx` to confirm those call sites survive).

- [ ] **Step 7: Add the `Tape` import and update the dials container class**

Add near the top:
```ts
import { Tape } from '../cockpit/Tape'
```
The surrounding `<div className="mc-rig-dials">...</div>` wrapper can keep its class name (no CSS conflict — `.mc-rig-dials` just becomes a flex/grid container of `.ct-tape` rows instead of `.mc-rig-dial` blocks). Check `app/globals.css` for `.mc-rig-dials` layout rules:
```bash
rg -n "\.mc-rig-dials" app/globals.css
```
If it's a grid tuned for 128px-square dials, update it to stack `Tape` rows vertically instead:
```css
.mc-rig-dials { display: flex; flex-direction: column; gap: var(--ct-gap-field); }
```
(Replace whatever grid rule is there — read it first with the line number from the `rg` output before editing.)

- [ ] **Step 8: Remove now-dead CSS for the deleted dial markup**

```bash
rg -n "\.mc-rig-dial\b|\.mc-rig-dial-face|\.mc-rig-dial-svg|\.mc-rig-dial-core|\.mc-rig-dial-value|\.mc-rig-dial-label|\.mc-rig-dial-sub|\.mc-rig-dial-arc" app/globals.css
```
Delete each matched rule — `RigHud.tsx` no longer renders any element with these classes.

- [ ] **Step 9: Build and verify**

```bash
node node_modules/.bin/next build
```
Expected: succeeds, no unused-import warnings for `bandColor`/`tempTone` remaining call sites (both should still be referenced — `tempTone` by nothing now if Step 2/4 dropped its only call sites; check `rg -n "tempTone" components/views/RigHud.tsx` — if `tempTone` has zero remaining callers, delete the function too, since an unused exported-but-unconsumed function is dead code this plan should not leave behind).

- [ ] **Step 10: Run tests**

```bash
npm test
```
Expected: all pass (no unit tests target `RigHud.tsx` directly; this verifies nothing else broke).

- [ ] **Step 11: Screenshot Home at 390px and 1440px**

With the dev server running, capture `/` (Home, which renders `RigHud`) at both widths for review — the dial-to-tape swap is the most visible change in this task.

- [ ] **Step 12: Commit**

```bash
git add components/views/RigHud.tsx app/globals.css
git commit -m "feat(cockpit): replace RigHud's round dials with Tape (128px -> 28px per metric)"
```

---

## Task 8: Rebuild Home's hero slot with `Annunciator`

**Files:**
- Modify: `components/HomeDeck.tsx`
- Modify: `components/ActionFeed.tsx` (or leave in place — see Step 1 decision)
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `Annunciator`, `Lamp` (Task 4).

- [ ] **Step 1: Decide ActionFeed's fate and confirm data sources**

The spec (§4.2) says Annunciator "replaces the current NEEDS YOU / ALL CLEAR text row" — that row is `ActionFeed`. `ActionFeed` already computes a richer per-item list (urgent/warn/note rows with links) from `health.services`, `data.crew`, `data.tasks`, `data.warnings`, and Hermes `blockedTasks`. Annunciator's 6-8 lamp grid is a *category* summary, not a replacement for that per-item detail.

Keep `ActionFeed` rendering below the Annunciator, unchanged — it still answers "what specifically needs me". Annunciator answers "which systems, at a glance" and sits in the hero slot. This is not scope creep: the spec's own mockup shows Annunciator as a compact grid, and `ActionFeed`'s per-item rows serve a purpose Annunciator's fixed lamp labels structurally cannot (arbitrary text + a specific link per issue). Do not delete or modify `ActionFeed.tsx` in this task.

- [ ] **Step 2: Derive lamp state in `HomeDeck.tsx`**

Add a new component in `components/HomeDeck.tsx`, near `StatusTiles`:
```tsx
import { Annunciator, type Lamp } from './cockpit/Annunciator'
import { deriveLampState } from '@/lib/cockpit/annunciator-logic'

function HomeAnnunciator() {
  const { data, isLive } = useLiveData()
  const lamps: Lamp[] = useMemo(() => {
    if (!data) return []
    const crew = data.crew ?? []
    const agentAttention = crew.some(c => c.status === 'attention')
    const tasks = data.tasks ?? []
    const taskAttention = tasks.some(t => t.status === 'attention')
    const cronFails = (data.cron ?? []).filter(c => c.enabled !== false && c.lastRunStatus === 'error').length
    const integrations = data.integrations ?? []
    const syncDown = integrations.some(i => i.status === 'attention' || i.status === 'missing')
    const hasWarnings = (data.warnings ?? []).length > 0

    return [
      { key: 'agent', label: 'AGENT', href: '/team', ...lampFor(agentAttention) },
      { key: 'task', label: 'TASK', href: '/kanban', ...lampFor(taskAttention) },
      { key: 'cron', label: 'CRON', href: '/calendar', ...lampFor(cronFails > 0) },
      { key: 'sync', label: 'SYNC', href: '/', ...lampFor(syncDown) },
      { key: 'data', label: 'DATA', href: '/', ...lampFor(hasWarnings, 'caution') },
      { key: 'live', label: 'LIVE', href: '/', ...lampFor(!isLive) },
    ]
  }, [data, isLive])

  if (!data) return null
  return <Annunciator lamps={lamps} />
}

function lampFor(active: boolean, severity?: 'caution' | 'warn' | 'info'): { state: Lamp['state'] } {
  return { state: deriveLampState({ active, severity }) }
}
```

- [ ] **Step 3: Place it in the hero slot**

In `HomeDeck()`'s return, change:
```tsx
<div className="mc-home-corewrap">
  <div className="mc-home-coreorb-holder" />
  <div className="mc-home-corebody">
    <SectionHead label="SYSTEM CORE · RIG" />
    <RigHud />
  </div>
</div>
```
to:
```tsx
<div className="mc-home-corewrap">
  <div className="mc-home-coreorb-holder">
    <HomeAnnunciator />
  </div>
  <div className="mc-home-corebody">
    <SectionHead label="SYSTEM CORE · RIG" />
    <RigHud />
  </div>
</div>
```

- [ ] **Step 4: Check `.mc-home-coreorb-holder` CSS fits the annunciator**

```bash
rg -n "\.mc-home-coreorb-holder" app/globals.css
```
That rule was sized/styled for the 3D canvas (likely a fixed aspect-ratio box with a gradient border). Replace its sizing rules with ones appropriate for a compact lamp grid — read the existing rule first, then adjust `min-height`/`aspect-ratio` to fit `Annunciator`'s natural height instead of a square canvas. Keep any border/gradient frame styling that still reads as "empty state" chrome if useful, or drop it since `Annunciator` supplies its own `.ct-annun` border.

- [ ] **Step 5: Build**

```bash
node node_modules/.bin/next build
```
Expected: succeeds.

- [ ] **Step 6: Run tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 7: Real-touch smoke test on the new lamp links**

Per the spec's verification section and the standing rule from prior mobile work, verify lit lamps are actually tappable with a real touch event (`Input.dispatchTouchEvent` over CDP), not `element.click()` — a synthetic click bypasses hit-testing and previously produced a false pass on an unrelated page. Confirm at least one `warn`-state lamp navigates to its `href` under a real tap.

- [ ] **Step 8: Screenshot Home at 390px and 1440px**

Capture `/` for review — this is the primary Phase 1 deliverable screenshot the spec calls for (§7: "Ends with a screenshot for review before anything else changes").

- [ ] **Step 9: Commit**

```bash
git add components/HomeDeck.tsx app/globals.css
git commit -m "feat(cockpit): Home hero slot becomes Annunciator, replacing the empty CoreOrb3D holder"
```

---

## Self-Review Notes

**Spec coverage:**
- §3 Tokens → Task 2. ✓
- §4.1 Tape → Task 3, wired in Task 7. ✓
- §4.2 Annunciator → Task 4, wired in Task 8. ✓
- §4.3 Field → Task 5, specimen in Task 6. ✓ (not wired into a real page yet — Phase 2 rollout per spec §7; Task 6's styleguide specimen is the Phase 1 deliverable for these two, matching the spec's own phase boundary.)
- §4.4 Panel → Task 5, specimen in Task 6. ✓ Same note as Field — `Window` is explicitly kept per spec §4.4 ("kept during rollout and removed when the last page stops importing it"), so no Window replacement happens in Phase 1.
- §5 120Hz contract → Task 1 (audit + `.mc-feed` fix), enforced structurally in Tasks 3/4 (`transform`/`opacity` only in new CSS).
- §6 Deletions → Task 1.
- §7 Sequence → Task ordering matches: deletion+fix first, primitives-on-styleguide before Home, Home last, ending in a screenshot.
- §8 Verification → build + test run in every task; composited-property audit and real-touch test called out explicitly in Task 1 Step 7 and Task 8 Step 7. Frame-budget probe and full overflow-check automation are not scripted as a repeatable command anywhere in this plan — flagging as a gap: if you want these as CI-runnable checks rather than manual spot-checks, that's additional scope not currently in any task.
- §9 Out of scope → respected; no chat-hub, collector, or API changes appear in any task.

**Known gap called out above:** the frame-budget probe and overflow-check from spec §8 are described as manual verification steps in Task 8 (screenshot + real-touch test) but not automated. Flagging rather than silently omitting.

**Type consistency:** `Lamp['state']` / `LampState` used consistently across Task 4 and Task 8. `Tape` props (`label`, `pct`, `value`, `detail?`, `capacity?`) match between Task 3's definition and every call site in Task 7. `deriveLampState`'s signature matches its two call sites (test in Task 4, usage in Task 8).
