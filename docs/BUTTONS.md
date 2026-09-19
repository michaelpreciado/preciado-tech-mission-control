# Blue Matrix Glass buttons

The installed material is **B · Edge Light**. Compare all three real recipes at `/styleguide#button-glass`. Each concept renders primary, ghost, danger, confirm, active/on, loading, disabled, IconButton and Segmented at both sm and md densities, on a solid panel and directly over the existing Shell rain. Desktop shows the concepts side by side; smaller screens stack them. The wide link demonstrates how the quiet ghost material scales to a conversation bar.

## Concept comparison

| Concept | Material | Distinguishing mechanics |
| --- | --- | --- |
| A · Frosted Deck | A substantial physical pane | 84% dark base, broad blue-white reflection, two-pixel top highlight, 18px blur, deeper ambient shadow |
| **B · Edge Light — installed** | A dark, lit instrument | 72% dark base, near-clear neutral gradient, precise one-pixel rim, 12px blur, restrained bloom on primary/ghost hover |
| C · Liquid Fill | A directional fluid capsule | 82% dark base, stronger dodger gradient, diagonal reflection, 200% gradient field that slides on hover/press, 8px blur |

Why B won:

1. Its dark transparent body and illuminated rim match the house terminal-command material while preserving the existing capsule geometry.
2. Primary has a clear dodger fill; ghost stays neutral and quiet even at full width. Destructive and confirmation actions retain red and green meaning without decorative blue bloom.
3. Its gradient, hairline and inset lighting remain dimensional when touch devices drop blur; the appearance does not depend on phone GPU backdrop processing.

## Installed recipe

All values are emitted from `BUTTON_GLASS` in `lib/tokens.ts` as `--pt-btn-glass-*`. Both the root and Friday theme inherit this family; no existing accent, spacing or radius token changed. `--glass-*` variables are per-element recipe inputs, and `--specimen-*` variables only select the A/C comparison materials.

```css
/* Neutral / ghost. Primary and semantic variants replace the gradient stops. */
background-color: rgba(10,12,14,0.72);
background-image:
  linear-gradient(transparent, transparent),
  linear-gradient(180deg, rgba(190,215,255,0.045), rgba(190,215,255,0.01));
border-color: rgba(255,255,255,0.06);
box-shadow:
  inset 0 1px 0 rgba(190,215,255,0.18),
  inset 0 -1px 0 rgba(255,255,255,0.04),
  0 6px 16px rgba(0,0,0,0.24);
-webkit-backdrop-filter: blur(12px) saturate(120%);
backdrop-filter: blur(12px) saturate(120%);
color: #f4f7fb;
/* Individual paint/transform properties transition; never transition: all. */
transition-duration: 200ms;
transition-timing-function: cubic-bezier(0.4,0,0.2,1);
```

| Variant | Gradient top → bottom | Label |
| --- | --- | --- |
| primary | `rgba(30,144,255,.30)` → `rgba(30,144,255,.12)` | `#f4f7fb` |
| ghost | `rgba(190,215,255,.045)` → `rgba(190,215,255,.01)` | `#f4f7fb` |
| danger | `rgba(255,95,87,.18)` → `rgba(255,95,87,.06)` | `#ffd4d1` |
| confirm | `rgba(40,200,64,.18)` → `rgba(40,200,64,.06)` | `#ccf5d2` |

Hover changes the base to `rgba(10,12,14,.84)`, the border to white `.18`, and the top/bottom inset lighting to `rgba(190,215,255,.32)` / white `.06`. Primary and ghost additionally receive `0 0 30px rgba(30,144,255,.07)`. Semantic actions do not receive the dodger bloom. Selected controls retain the `.18` rim and an underline; selected ghost/segmented controls use the primary tint. Focus has a 2px `#1E90FF` outline with a 3px offset. Press is `scale(.985)` with `inset 0 2px 5px rgba(0,0,0,.24)`.

Loading keeps the variant fill and ink, shows the existing spinner, and uses a dashed white `.10` border. Disabled uses an 88% dark base, neutral tint and solid `#a5afbd` text at full element opacity. Existing disabled and loading behavior is unchanged. The outer border has only three alpha tiers: `.06`, `.10`, `.18`; inset specular lighting is a separate lighting treatment.

No height, padding, font size, width or radius changes were made to shared controls. The existing `ob-btn-sm` class provides the small specimen; md uses the default. Existing coarse/mobile minimum targets still win. IconButton has no size prop and intentionally retains its existing 44px target in both density contexts. Segmented uses its real sm/md props and keyboard behavior. Borderless primitives use an inset outline for a hairline without adding box dimensions.

## Touch, motion and fallback

Under `@media (pointer: coarse)`, both backdrop filter properties are `none`, for **all** concepts and production controls. Layered translucent gradients, top/bottom rim and ambient shadow remain. No new rain canvas or animation loop was added; transparent specimens use the existing ambient rain. A browser without backdrop-filter support retains the same layers.

Reduced motion removes the new transitions, press scaling and loading spinner rotation. Static loading still has its spinner glyph, label and dashed rim. A 200ms background-position transition supplies C's fluid movement without a bounce or perpetual animation.

## Contrast verification

Ratios below are calculated from the actual token values using sRGB alpha compositing and WCAG relative luminance: `(lighter + .05) / (darker + .05)`. They are numerical material measurements, **not browser pixel samples**. Every gradient position is sampled at 1% intervals. The A/C check conservatively applies the maximum sheen opacity everywhere, including where it cannot coincide with the strongest tint.

| Edge Light body label | Panel `#0e1117` minimum | Pure-white backdrop lower bound |
| --- | ---: | ---: |
| primary | 11.73:1 | 5.83:1 |
| ghost | 16.81:1 | 6.85:1 |
| danger | 11.57:1 | 5.16:1 |
| confirm | 12.17:1 | 5.37:1 |

All enabled variant labels in all concepts clear 4.5:1 even over the white bound: A minimum **5.22:1**, B **5.16:1**, C **4.97:1**. This bound covers the ambient rain and touch fallback: any filtered backdrop channel is at most 255, and the dark base bounds its contribution before tinting. Hover/press use a darker base; loading preserves the same label color and fill. Rim pixels sit outside the body-label region.

To reproduce: composite the backdrop under the RGBA base, then the premultiplied gradient tint, then the optional A/C sheen; compare the resulting RGB against the label. Convert channels to [0,1]; use `c/12.92` for `c <= .04045`, otherwise `((c+.055)/1.055)^2.4`; luminance weights are `.2126`, `.7152`, `.0722`. The blur contributes no additional assumption to the white bound.

## Cascade and scope

`app/globals.css` has one appended Lane D material layer. Its `:is()` selector includes the existing kanban toolbar path to exceed the legacy Friday recipes consistently. Legacy gray declarations are preserved as historical source, but the appended layer replaces their computed material. No unrelated line was removed: additive gate **0**.

Coverage includes `.mc-btn` / `.ob-btn`, legacy window/week/task/tab controls, content and project toggles, chat actions, memory links and sheet close controls. IconButton and Segmented are matched through their existing CSS Module class fragments; no shared component or ARIA contract changed. Keep these fragments in sync if those component class names are renamed.

Only the styleguide introduces local demo interactions. No new npm dependencies, button variants or APIs were added. Dodger remains the sole decorative accent. Red and green are semantic. The existing capsule radius is retained under the explicit material-only brief; specimen corners use existing 12px tokens.

The material references the local Blue Matrix Glass and Liquid Glass UX design skills and [Apple's materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials). The owner's additive-only rule takes precedence over the Liquid Glass skill's generic instruction to remove old selector blocks.

## Verification limitations

Live browser and device checks are blocked in this sandbox: Next dev cannot bind (`listen EPERM`), and Chromium cannot create its required sockets. No Pixel hardware performance claim or live DOM/pixel claim is made. The styleguide is implemented for review in an unrestricted app session. The default Turbopack build stalled during compilation; Webpack is used as the alternative production-build verification. Test failures outside this lane are documented in the delivery report.

## Added tokens

Every new token uses the prefix `--pt-btn-glass-`:

| Suffix | Value |
| --- | --- |
| `fill` | `rgba(10,12,14,0.72)` |
| `fill-hover` | `rgba(10,12,14,0.84)` |
| `fill-disabled` | `rgba(10,12,14,0.88)` |
| `neutral-top` | `rgba(190,215,255,0.045)` |
| `neutral-bottom` | `rgba(190,215,255,0.01)` |
| `primary-top` | `rgba(30,144,255,0.30)` |
| `primary-bottom` | `rgba(30,144,255,0.12)` |
| `danger-top` | `rgba(255,95,87,0.18)` |
| `danger-bottom` | `rgba(255,95,87,0.06)` |
| `confirm-top` | `rgba(40,200,64,0.18)` |
| `confirm-bottom` | `rgba(40,200,64,0.06)` |
| `ink` | `#f4f7fb` |
| `ink-danger` | `#ffd4d1` |
| `ink-confirm` | `#ccf5d2` |
| `ink-disabled` | `#a5afbd` |
| `line-subtle` | `rgba(255,255,255,0.06)` |
| `line-base` | `rgba(255,255,255,0.10)` |
| `line-strong` | `rgba(255,255,255,0.18)` |
| `rim` | `inset 0 1px 0 rgba(190,215,255,0.18), inset 0 -1px 0 rgba(255,255,255,0.04)` |
| `rim-lit` | `inset 0 1px 0 rgba(190,215,255,0.32), inset 0 -1px 0 rgba(255,255,255,0.06)` |
| `shadow` | `0 6px 16px rgba(0,0,0,0.24)` |
| `bloom` | `0 0 30px rgba(30,144,255,0.07)` |
| `press-shadow` | `inset 0 2px 5px rgba(0,0,0,0.24)` |
| `blur` | `blur(12px) saturate(120%)` |
| `focus` | `#1E90FF` |
| `ease` | `cubic-bezier(0.4,0,0.2,1)` |
| `frost-fill` | `rgba(10,12,14,0.84)` |
| `frost-sheen` | `linear-gradient(180deg, rgba(190,215,255,0.16), rgba(190,215,255,0.035) 48%, transparent)` |
| `frost-rim` | `inset 0 2px 0 rgba(190,215,255,0.30), inset 0 -1px 0 rgba(255,255,255,0.06)` |
| `frost-shadow` | `0 8px 24px rgba(0,0,0,0.32)` |
| `frost-blur` | `blur(18px) saturate(120%)` |
| `liquid-fill` | `rgba(10,12,14,0.82)` |
| `liquid-primary-top` | `rgba(30,144,255,0.42)` |
| `liquid-primary-bottom` | `rgba(30,144,255,0.14)` |
| `liquid-sheen` | `linear-gradient(115deg, rgba(190,215,255,0.14), transparent 35%, rgba(190,215,255,0.07) 65%, transparent)` |
| `liquid-rim` | `inset 0 1px 0 rgba(190,215,255,0.12), inset 0 -1px 0 rgba(255,255,255,0.04)` |
| `liquid-blur` | `blur(8px) saturate(120%)` |

## Verification results

- `npx tsc --noEmit`: exit 0.
- `npm run build`: the default Turbopack retry timed out after 120 seconds (exit 124) at “Creating an optimized production build”. The earlier attempt also stalled.
- `npm run build -- --webpack`: exit 0; compilation, TypeScript, static-page generation and production build completed.
- `npm test`: 28 passing test files, 3 failing files. Two failures are the known `resolveClaudeBin` / `getClientIpFromHeaders` drift; the additional handoff fixture fails at `spawnSync git EPERM` under this sandbox. None of those files were changed.
- Actual styleguide components were rendered through React server rendering into a temporary fixture. A static CSS cascade check passed 1,920 cases across 120 controls: desktop/touch, normal/reduced motion, rest/hover/press/focus. This verifies selectors and material tokens; it does not replace a browser layout or device performance check.
- `git diff --check`: clean. `git diff app/globals.css | grep -c '^-[^-]'`: **0**. Work is unstaged.
