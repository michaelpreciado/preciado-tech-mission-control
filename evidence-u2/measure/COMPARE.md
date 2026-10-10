# U2 before/after measurement

Before: `/tmp/u2-measure/before/` · After: `/tmp/u2-measure/after/` · Target: `http://127.0.0.1:4291`
Figures copied verbatim from the output files. Each script was run once per side.

## 1. audit-mobile (`audit-mobile.txt`)

Exit code: before `EXIT 1`, after `EXIT 1`.

| Row | Before | After |
|---|---|---|
| Final totals line | `4 tab(s) with problems` | `4 tab(s) with problems` |
| overflowing · phone · 375×812 (memory tab) | `overflowing: [object SVGAnimatedString]` | `overflowing: [object SVGAnimatedString]` |
| overflowing · fold-cover · 386×866 (memory tab) | `overflowing: [object SVGAnimatedString]` | `overflowing: [object SVGAnimatedString]` |
| overflowing · fold-inner · 944×978 (memory tab) | `overflowing: [object SVGAnimatedString]` | `overflowing: [object SVGAnimatedString]` |
| overflowing · fold-inner-wide · 1038×1076 (memory tab) | `overflowing: [object SVGAnimatedString]` | `overflowing: [object SVGAnimatedString]` |

Every tab row reports `main N/N  doc N/N` with equal values on both sides. The only differences in the file are the status marks and the console 503 lines, which are identical on both sides.

## 2. qa-touch-probe (`qa-touch-probe.txt`, 390×844)

Exit code: before `EXIT 0`, after `EXIT 0`. Output is `{before, after, moved}` per probe.

| Probe row | Before | After |
|---|---|---|
| manualTouchDrag_thread | `before: 25892, after: 25222, moved: true` | `before: 25892, after: 25218, moved: true` |
| manualTouchDrag_control | `before: 0, after: 0, moved: false` | `before: 0, after: 0, moved: false` |
| syntheticGesture_control | `before: 0, after: 0, moved: false` | `before: 0, after: 0, moved: false` |

## 3. qa-scroll-probe (`qa-scroll-probe.txt`, 390×844)

Exit code: before `EXIT 0`, after `EXIT 0`.

| Value | Before | After |
|---|---|---|
| thread rect | `{"top":271,"bottom":566}` | `{"top":271,"bottom":566}` |
| thread scrollTop | `24951` | `25892` |
| thread scrollH | `25865` | `26806` |
| thread clientH | `296` | `296` |
| before | `24951` | `25892` |
| afterTouch | `24951` | `25892` |
| afterWheel | `24415` | `25356` |
| afterDirect | `24115` | `25056` |
| docY | `0` | `0` |

## 4. perf-frames (`perf-frames.txt`, `--only desktop,phone --leak 1`)

Exit code: before `EXIT 0`, after `EXIT 0`.

### desktop · 1440×900

| Row | Before | After |
|---|---|---|
| idle rAF | `idle    rAF 16.7/16.8/16.8 ms (interval 16.7, 60fps, missed 0, >10.4ms 180)` | `idle    rAF 16.7/16.8/16.8 ms (interval 16.7, 60fps, missed 0, >10.4ms 180)` |
| idle stage | `stage 1.9/2.29/3.1` | `stage 1.88/2.45/3.84` |
| idle main | `main 0.9/1.24/3.1` | `main 0.91/1.14/2.84` |
| Home route `/` | `/        room   444  crit 3.06/6.05/7.22  main 2.34/3.93/4.67  comp 0.74/1.25/2.3  viz 0.61/1.15/1.15  gpu 3.06/6.05/7.22  >8.3ms 0/40` | `/        room   468  crit 3.24/4.75/6.08  main 2.33/4.35/4.75  comp 0.78/1.08/1.63  viz 0.73/0.91/0.92  gpu 3.21/4.57/6.08  >8.3ms 0/44` |
| probe home (dom / anims / cls) | `probe   home: dom 570 backdrop 0 anims 31 cls 0  ·  after nav: webgl live 0 created 0` | `probe   home: dom 490 backdrop 0 anims 31 cls 0  ·  after nav: webgl live 0 created 0` |
| leak home | `leak    per sweep → home: nodes 946 listeners 503 docs 1 gl 0 rAF/s 0` | `leak    per sweep → home: nodes 838 listeners 503 docs 1 gl 0 rAF/s 0` |
| scroll headline | `scroll  rAF 16.7/16.8/16.8 ms (60fps, missed 0/150, >10.4ms 150)  stage-p95 worst route 10.08  longest task 29.79` | `scroll  rAF 16.7/16.7/16.8 ms (60fps, missed 0/150, >10.4ms 150)  stage-p95 worst route 8.3  longest task 28.52` |
| nav headline | `nav     rAF 16.7/16.7/33.4 ms (60fps, missed 3)  longest task 34.15` | `nav     rAF 16.7/16.7/33.3 ms (60fps, missed 1)  longest task 29.59` |
| long tasks | `long tasks >50ms by route: none` | `long tasks >50ms by route: none` |
| reduce | `reduce  / anims 0 rAF/s 0  ·  /costs anims 0 rAF/s 0  ·  /kanban anims 0 rAF/s 0  ·  /crew anims 0 rAF/s 0  ·  /pipeline anims 0 rAF/s 0` | identical to before |

### phone · 390×844 · touch · cpu×4

| Row | Before | After |
|---|---|---|
| idle rAF | `idle    rAF 16.7/16.8/16.8 ms (interval 16.7, 60fps, missed 0, >10.4ms 180)` | `idle    rAF 16.7/16.8/16.8 ms (interval 16.7, 60fps, missed 0, >10.4ms 180)` |
| idle stage | `stage 1.97/3.28/11.5` | `stage 2.03/3.39/8.21` |
| idle main | `main 1.97/3.28/11.5` | `main 1.92/2.67/8.21` |
| Home route `/` | `/        room   867  crit 3.15/4.33/10.52  main 3.15/4.33/10.52  comp 0.35/0.53/0.96  viz 0.62/0.85/1.05  gpu 1.44/1.79/2.76  >8.3ms 2/87` | `/        room   874  crit 2.35/3.58/8.25  main 2.32/3.2/8.25  comp 0.3/0.61/0.75  viz 0.51/0.64/0.73  gpu 1.41/2.78/3.58  >8.3ms 0/87` |
| probe home (dom / anims / cls) | `probe   home: dom 570 backdrop 0 anims 11 cls 0  ·  after nav: webgl live 0 created 0` | `probe   home: dom 490 backdrop 0 anims 11 cls 0  ·  after nav: webgl live 0 created 0` |
| leak home | `leak    per sweep → home: nodes 937 listeners 499 docs 1 gl 0 rAF/s 0` | `leak    per sweep → home: nodes 826 listeners 499 docs 1 gl 0 rAF/s 0` |
| scroll headline | `scroll  rAF 16.7/16.7/16.8 ms (60fps, missed 0/150, >10.4ms 150)  stage-p95 worst route 4.33  longest task 7.46` | `scroll  rAF 16.7/16.7/16.8 ms (60fps, missed 0/150, >10.4ms 150)  stage-p95 worst route 4.56  longest task 6.65` |
| nav headline | `nav     rAF 16.7/33.3/133.4 ms (54fps, missed 42)  longest task 119.27` | `nav     rAF 16.7/33.3/133.3 ms (54fps, missed 42)  longest task 111.53` |
| long tasks | `long tasks >50ms by route: /chat 79, /costs 50, /pipeline 52, /memory 119, /deliverables 63, /system 76, /setup 89, /styleguide 78` | `long tasks >50ms by route: /chat 83, /pipeline 58, /memory 111, /deliverables 63, /system 77, /setup 100, /styleguide 95` |
| reduce | `reduce  / anims 0 rAF/s 0  ·  /costs anims 0 rAF/s 0  ·  /kanban anims 0 rAF/s 0  ·  /crew anims 0 rAF/s 0  ·  /pipeline anims 0 rAF/s 0` | identical to before |

## Notes

- Each script ran once per side, so the differences are single-run numbers. Nothing here was repeated to check variance.
- `audit-mobile` exits 1 on both sides because the script reports `4 tab(s) with problems`. The problem is the same `overflowing: [object SVGAnimatedString]` line on the memory tab at all four viewports, before and after.
- Nothing was edited under `/home/mp/Documents/mc-lane-U2`, and no process was started, stopped, or killed.
