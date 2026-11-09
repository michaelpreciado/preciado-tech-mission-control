'use client';
/* ──────────────────────────────────────────────────────────
   Visualization primitives — heatmap.
   SVG/CSS, theme-aware via CSS vars.
   ────────────────────────────────────────────────────────── */

interface HeatmapProps {
  data: number[][];
}

export function Heatmap({ data }: HeatmapProps) {
  // data: Array<weeks> of Array<7 days> of 0-4 level
  return (
    <div className="mc-heatmap">
      {data.map((week, wi) => (
        <div key={wi} className="col">
          {week.map((lvl, di) => (
            <span key={di} className={"cell lvl-" + lvl} />
          ))}
        </div>
      ))}
    </div>
  );
}
