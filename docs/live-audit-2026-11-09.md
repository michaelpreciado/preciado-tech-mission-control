# Live DOM audit — Mission Control, 2026-11-09 15:5x PST

Raw data: `docs/live-audit-2026-11-09.json` (34 loads = 17 routes x 1440x900 and 412x915,
real Chromium against the live :4176 service on commit dbe8684).

## Passes (every route, both widths)
- horizontal overflow `scrollWidth - clientWidth` = **0** on all 34 loads
- elements with a computed `box-shadow` = **0**; with `backdrop-filter` = **0**
- `body` background `#000`; every `.mc-widget` sample resolves to a monospace family
- no emoji in UI chrome (the `/memory` glyphs are Obsidian note titles = user data)

## Residual / flagged, not fixed
- `/costs` has 5 elements whose `background-image` matches `gradient`: these are the chart grid
  rules in `components/charts/charts.module.css:14-16` (1px `linear-gradient` / `repeating-linear-gradient`
  hairlines used as a grid, not decorative fills). Functional; left in place deliberately.
- Routes with no `.mc-widget` in the desktop DOM: `/kanban`, `/system`, `/chat`, `/pipeline`, `/setup`.
  Their widget heads are a Lane B / Lane C depth item (see follow-up card).
- `/deliverables` renders 9 widgets at 1440 but 0 at 412 (responsive branch) - verify intent.

## Fixed from this audit
- `components/ContentCreationBoard.tsx`: removed the last real emoji (film-camera x2, high-voltage,
  warning) in favour of the widget glyph vocabulary (`>`, `x`).
