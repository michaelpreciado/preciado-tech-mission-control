# Widget theme reference — from Michael's launcher screenshots (2026-11-09)

Two reference captures live on disk:
- Desktop widgets: `/home/mp/.hermes/profiles/friday/cache/documents/native-inputs/e2ca91fcd92145c09e6b9872ca4a25b0ef1f4b775c19a9d2b81a2328eee7ddcb/img_df75eacb46f2.jpg`
- Phone launcher: `/home/mp/.hermes/profiles/friday/cache/documents/native-inputs/0150d42f7a725c04aa1cf9e2e6ea9688883d1d50cacab2814b75ce8d6e622688/img_f452b077f68e.jpg`

## Shared design language (both captures)

- App bg: `#000000` / `#050505`
- Card bg: `#0A0F1A` (range to `#111827`; phone capture reads `#0a111a`)
- Card borders: 1px solid, `#1E293B` (phone capture: `#1e3a5f`), slight glow allowed, no drop shadows
- Radii: cards 12–16px; search/command bar = pill (`rounded-full`)
- Accent: dodger blue `#3B82F6` primary; soft sky `#5C9CE6` for text/icons on phone; cyan `#00A3FF` for ONE highlight only
- Semantic colors: amber `#F59E0B`/`#FBBF24` = warning/high usage; red `#EF4444` = alert; green only for "all clear"-type states
- Text: white `#FFFFFF` primary, `#94A3B8` secondary, `#64748B` muted; mostly lowercase
- Fonts: JetBrains Mono dominant; sans (Inter) reserved for big verdict numerals (e.g. `71°`)
- Charts: FLAT, no gradients. Two bar styles seen:
  - segmented solid bars (`flex gap-[2px] h-2`, segments `bg-border`, active `bg-accent`)
  - dot-matrix progress rows (filled bright-blue dots vs dim dots + % label right) — used for day/week/month/year progress
- Terminal motifs: prompts `desk:~$`, `friday:~$`, `phone:~$`; ASCII dividers `-- tasks ----`; status glyphs `> · x ↻ ↑ ↓`
- Calendar: today = white bg + black text chip; other days dim chips; header `NOVEMBER 2026` + `mon 9`
- Task manager: big `all clear` verdict line, `0 done`, thin progress line, `NEXT` row with radio-dot, footer `10 done this week · 1d streak`
- Pixel-art element allowed (bot desk / fish tank) as a charm card
- Command/search bar: full-width pill, `claude ▾ open an app or ask claude...`, mic icon right
- App icons: circular, bg `#13273F`, light-blue glyphs, 2-col grid
- Spacing: card padding 12–16px, grid gaps 8–12px

## Component classes (Tailwind)

```
.terminal-card: bg-card border border-border rounded-card p-4 font-mono text-sm text-secondary
.terminal-header: text-accent-blue mb-2 flex gap-2
.terminal-divider: text-border my-2 overflow-hidden whitespace-nowrap
.segmented-bar: flex gap-[2px] h-2
.segmented-bar-segment: flex-1 bg-border rounded-sm (+ .active bg-accent-blue / .warning bg-accent-yellow)
.dot-progress-row: label + dot track + % right-aligned
```
