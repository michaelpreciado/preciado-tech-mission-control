# U2 "before" measurements — http://127.0.0.1:4291

Raw figures copied verbatim from the script output files in this directory. Nothing rounded or derived.

## 1. audit-mobile.mjs — `audit-mobile.txt` — EXIT 1

No line in the output is literally tagged `FAIL`. The non-passing signals are:

| Line | Viewport / tab | Output |
|---|---|---|
| 1 | phone · 375×812 (memory or team tab, see note) | `overflowing: [object SVGAnimatedString]` |
| 2 | fold-cover · 386×866 | `overflowing: [object SVGAnimatedString]` |
| 3 | fold-inner · 944×978 | `overflowing: [object SVGAnimatedString]` |
| 4 | fold-inner-wide · 1038×1076 | `overflowing: [object SVGAnimatedString]` |

Note: the script prints the `overflowing:` line after the `memory` row and before the `team` row in each viewport block, so the per-tab attribution is ambiguous from the output alone.

Also printed (warning, not failure): `console: Failed to load resource: the server responded with a status of 503 (Service Unavailable)` after the `pipeline` row in each viewport.

Every tab row reports `main` and `doc` widths equal to each other, e.g. `✓ deck main 375/375 doc 375/375`. Notable non-equal rows:
- fold-inner · `deck`, `kanban`, `calendar`, `chat`, `github`, `costs`, `projects`, `pipeline`, `content-creation`, `memory`, `team`, `setup`: `main 872/872  doc 944/944`
- fold-inner-wide · same tabs: `main 966/966  doc 1038/1038`

Final totals line: `4 tab(s) with problems`

Exit: `EXIT 1`

## 2. qa-touch-probe.mjs (390×844) — `qa-touch-probe.txt` — EXIT 0

| Probe | before | after | moved |
|---|---|---|---|
| manualTouchDrag_thread | 25892 | 25222 | true |
| manualTouchDrag_control | 0 | 0 | false |
| syntheticGesture_control | 0 | 0 | false |

## 3. qa-scroll-probe.mjs (390×844) — `qa-scroll-probe.txt` — EXIT 0

| Measure | value |
|---|---|
| thread rect | top 271, bottom 566 |
| thread scrollTop / scrollH / clientH | 24951 / 25865 / 296 |
| before | 24951 |
| afterTouch | 24951 |
| afterWheel | 24415 |
| afterDirect | 24115 |
| docY | 0 |

## 4. perf-frames.mjs (`--only desktop,phone --leak 1`) — `perf-frames.txt`, `perf-frames.json` — EXIT 0

Figures are slash-separated triplets exactly as printed; the script's own output does not label what each position means, so none is assigned here.

### desktop · 1440×900 — Home (`/`) and idle scenario

| Figure | Printed value |
|---|---|
| idle rAF | 16.7/16.8/16.8 ms (interval 16.7, 60fps, missed 0, >10.4ms 180) |
| idle stage | 1.9/2.29/3.1 |
| idle main | 0.9/1.24/3.1 |
| idle longest task | not printed on the idle line (see note) |
| Home route row (`/`) | room 444; crit 3.06/6.05/7.22; main 2.34/3.93/4.67; comp 0.74/1.25/2.3; viz 0.61/1.15/1.15; gpu 3.06/6.05/7.22; >8.3ms 0/40 |
| probe home DOM | dom 570 |
| probe home backdrop | 0 |
| probe home running animations | anims 31 |
| probe home cls | 0 |
| leak home per sweep | nodes 946, listeners 503, docs 1, gl 0, rAF/s 0 |

Headline lines (scroll / nav, desktop):
- `scroll  rAF 16.7/16.8/16.8 ms (60fps, missed 0/150, >10.4ms 150)  stage-p95 worst route 10.08  longest task 29.79`
- `nav     rAF 16.7/16.7/33.4 ms (60fps, missed 3)  longest task 34.15`
- `long tasks >50ms by route: none`
- `hidden  data-page-hidden=true running animations 0`
- `reduce  / anims 0 rAF/s 0 · /costs anims 0 rAF/s 0 · /kanban anims 0 rAF/s 0 · /crew anims 0 rAF/s 0 · /pipeline anims 0 rAF/s 0`

### phone · 390×844 · touch · cpu×4 — Home (`/`) and idle scenario

| Figure | Printed value |
|---|---|
| idle rAF | 16.7/16.8/16.8 ms (interval 16.7, 60fps, missed 0, >10.4ms 180) |
| idle stage | 1.97/3.28/11.5 |
| idle main | 1.97/3.28/11.5 |
| idle longest task | not printed on the idle line (see note) |
| Home route row (`/`) | room 867; crit 3.15/4.33/10.52; main 3.15/4.33/10.52; comp 0.35/0.53/0.96; viz 0.62/0.85/1.05; gpu 1.44/1.79/2.76; >8.3ms 2/87 |
| probe home DOM | dom 570 |
| probe home backdrop | 0 |
| probe home running animations | anims 11 |
| probe home cls | 0 |
| leak home per sweep | nodes 937, listeners 499, docs 1, gl 0, rAF/s 0 |

Headline lines (scroll / nav, phone):
- `scroll  rAF 16.7/16.7/16.8 ms (60fps, missed 0/150, >10.4ms 150)  stage-p95 worst route 4.33  longest task 7.46`
- `nav     rAF 16.7/33.3/133.4 ms (54fps, missed 42)  longest task 119.27`
- `long tasks >50ms by route: /chat 79, /costs 50, /pipeline 52, /memory 119, /deliverables 63, /system 76, /setup 89, /styleguide 78`
- `hidden  data-page-hidden=true running animations 0`
- `reduce  / anims 0 rAF/s 0 · /costs anims 0 rAF/s 0 · /kanban anims 0 rAF/s 0 · /crew anims 0 rAF/s 0 · /pipeline anims 0 rAF/s 0`

Note on idle longest task: the idle line does not print a longest-task figure in either viewport. The closest printed figures are the scroll-scenario `longest task` (desktop 29.79, phone 7.46) and the nav-scenario `longest task` (desktop 34.15, phone 119.27). Those are not idle figures and are not substituted for one here.

Output file: `perf-frames.json` written (per the script's final line).
