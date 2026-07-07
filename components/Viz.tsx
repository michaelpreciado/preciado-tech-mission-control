'use client';
/* ──────────────────────────────────────────────────────────
   Visualization primitives — sparkline, donut, heatmap, bars.
   All SVG, theme-aware via CSS vars.
   ────────────────────────────────────────────────────────── */

/* ── Type definitions ── */

interface SparklineProps {
  data: number[];
  w?: number;
  h?: number;
  pos?: boolean;
  fill?: boolean;
}

interface Slice {
  name: string;
  value: number;
  color: string;
}

interface DonutProps {
  slices: Slice[];
  size?: number;
  thickness?: number;
}

interface DonutLegendProps {
  slices: Slice[];
}

interface HeatmapProps {
  data: number[][];
}

interface HBarProps {
  label: string;
  value: number;
  max?: number;
  sublabel?: string;
  tint?: string;
}

interface GaugeProps {
  value: number;
  label?: string;
  size?: number;
  color?: string;
}

/* ── Components ── */

export function Sparkline({ data, w = 110, h = 28, pos = true, fill = true }: SparklineProps) {
  if (!data || !data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, h - ((v - min) / span) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg className={"mc-sparkline " + (pos ? "pos" : "neg")} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {fill ? <path d={`${d} L${last[0]},${h} L0,${h} Z`} className="mc-sparkline-fill" /> : null}
      <path d={d} className="mc-sparkline-line" />
      <circle cx={last[0]} cy={last[1]} r="2" className="mc-sparkline-dot" />
    </svg>
  );
}

export function Donut({ slices, size = 130, thickness = 14 }: DonutProps) {
  const total = slices.reduce((a, b) => a + b.value, 0) || 1;
  const R = size / 2 - thickness / 2;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="mc-donut-wrap" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={R} className="mc-donut-track" strokeWidth={thickness} />
        {slices.map((s, i) => {
          const len = (s.value / total) * C;
          const el = (
            <circle key={i}
              cx={size/2} cy={size/2} r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${C}`}
              strokeDashoffset={-offset}
              style={{ filter: `drop-shadow(0 0 4px ${s.color})` }}
              transform={`rotate(-90 ${size/2} ${size/2})`}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="mc-donut-center">
        <div className="lbl">TOTAL</div>
        <div className="val">{slices.length}</div>
      </div>
    </div>
  );
}

export function DonutLegend({ slices }: DonutLegendProps) {
  const total = slices.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div className="mc-donut-legend">
      {slices.map((s, i) => (
        <div key={i} className="row">
          <span className="sw" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
          <span className="name">{s.name}</span>
          <span className="pct">{Math.round((s.value / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
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

export function HBar({ label, value, max = 100, sublabel, tint }: HBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="mc-hbar">
      <div className="head">
        <span className="lbl">{label}</span>
        {sublabel ? <span className="sub">{sublabel}</span> : null}
        <span className="val">{value}</span>
      </div>
      <div className="track">
        <span className="fill" style={{
          width: pct + "%",
          background: tint ? tint : undefined,
          boxShadow: tint ? `0 0 8px ${tint}` : undefined,
        }} />
      </div>
    </div>
  );
}

/* Stacked vertical bar chart — daily model token usage */
interface StackedBarDatum {
  label: string
  segments: { value: number; color: string; key: string }[]
}
interface StackedBarChartProps {
  data: StackedBarDatum[]
  h?: number
}
export function StackedBarChart({ data, h = 80 }: StackedBarChartProps) {
  if (!data.length) return null
  const maxVal = Math.max(...data.map(d => d.segments.reduce((s, sg) => s + sg.value, 0)), 1)
  const barW = 10
  const gap = 3
  const w = data.length * (barW + gap)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block', overflow: 'visible' }}>
      {data.map((d, i) => {
        const total = d.segments.reduce((s, sg) => s + sg.value, 0)
        const fullH = (total / maxVal) * (h - 12)
        let yOff = h - 12
        return (
          <g key={i} transform={`translate(${i * (barW + gap)},0)`}>
            {d.segments.filter(sg => sg.value > 0).map(sg => {
              const segH = (sg.value / maxVal) * (h - 12)
              yOff -= segH
              return (
                <rect key={sg.key} x={0} y={yOff} width={barW} height={segH}
                  fill={sg.color} opacity={0.85}
                  style={{ filter: `drop-shadow(0 0 3px ${sg.color})` }}
                />
              )
            })}
            {i % Math.ceil(data.length / 8) === 0 && (
              <text x={barW / 2} y={h - 1} textAnchor="middle"
                style={{ fontSize: 5, fill: 'var(--pt-text-mute)', fontFamily: 'monospace' }}>
                {d.label.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/* Radial "gauge" — single-value % */
export function Gauge({ value, label, size = 78, color }: GaugeProps) {
  const R = size / 2 - 6;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="mc-gauge" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={R} className="mc-gauge-track" />
        <circle cx={size/2} cy={size/2} r={R}
          className="mc-gauge-fill"
          stroke={color}
          strokeDasharray={`${(pct/100)*C} ${C}`}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ filter: color ? `drop-shadow(0 0 4px ${color})` : undefined }}
        />
      </svg>
      <div className="mc-gauge-val">{pct}%</div>
      {label ? <div className="mc-gauge-lbl">{label}</div> : null}
    </div>
  );
}
