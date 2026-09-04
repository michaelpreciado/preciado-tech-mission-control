# Task 5 performance report

## Build

`npx tsc --noEmit`: passed.

`npm run build`: passed. Next.js 16.2.10 emitted its existing workspace-root/NFT-trace warning and middleware deprecation warning. This Turbopack build did not print a `First Load JS` table; route HTML script manifests were measured instead.

## Warm route timings

Each route received five sequential warm `curl -o /dev/null -s -w '%{time_total}\\n'` hits. Median is the middle value after sorting.

| Route | Before hits (s) | Before median (s) | After hits (s) | After median (s) |
|---|---|---:|---|---:|
| `/` | 0.006915, 0.005872, 0.006031, 0.007590, 0.005862 | 0.006031 | 0.067528, 0.011585, 0.011058, 0.009773, 0.009502 | 0.011058 |
| `/costs` | 0.005631, 0.005661, 0.005918, 0.005957, 0.005869 | 0.005869 | 0.015637, 0.008953, 0.011473, 0.010095, 0.007707 | 0.010095 |
| `/kanban` | 0.005514, 0.005543, 0.005616, 0.005556, 0.006697 | 0.005556 | 0.010995, 0.006187, 0.007688, 0.006566, 0.007265 | 0.007265 |

## Shell JavaScript

The shared route-script intersection (the JS every measured route pays) changed from **677,942 bytes / 662.05 KB** to **674,861 bytes / 659.04 KB**, a delta of **-3,081 bytes / -3.01 KB**.

The lazy split removes the hidden command palette from the shared shell payload; Costs, Kanban, and Bots remain separate lazy chunks with themed loading states, while canvas/WebGL remains client-only.

Screenshot: `artifacts-2026-09-04-task5-home.png` (captured after the production page settled; no skeleton visible).
