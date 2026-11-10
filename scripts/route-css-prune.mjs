// Single-writer prune of route CSS out of app/globals.css (task t_3345d3d9, item 2/4).
// Deletes only rule families that no longer have a TSX/DOM owner, plus Lane B's
// explicit "globals.css rules to remove" list. Mixed selectors are split so live
// selectors in the same rule survive. Unreferenced @keyframes + empty @media go too.
// Usage: node scripts/route-css-prune.mjs [--check]
import postcss from "postcss";
import fs from "node:fs";

const GLOBALS = "app/globals.css";
const CHECK = process.argv.includes("--check");

// [label, regex] — selector is dead when it matches
const DEAD = [
  [".mc-rig", /\.mc-rig/],
  [".mc-health", /\.mc-health/],
  [".mc-led", /\.mc-led/],
  [".mc-hbar", /\.mc-hbar/],
  [".mc-donut", /\.mc-donut/],
  [".mc-sparkline", /\.mc-sparkline/],
  [".mc-repo", /\.mc-repo/],
  [".mc-kb-sync", /\.mc-kb-sync/],
  [".mc-gh-sync", /\.mc-gh-sync/],
  [".mc-hl-sync", /\.mc-hl-sync/],
  [".mc-rain", /\.mc-rain/],
  [".mc-rise-in", /mc-rise-in/],
  [".launch-", /\.launch-/],
  [".film-", /\.film-/],
  [".ob-home", /\.ob-home/],
  [".ob-neural-canvas", /\.ob-neural-canvas/],
  [".ob-orb-readout", /\.ob-orb-readout/],
  [".srule-", /\.srule-/],
  [".tframe-", /\.tframe-/],
  [".mc-ascii-head", /\.mc-ascii-head/],
  // Lane B removal list (docs/lane-b-report.md §"globals.css rules to remove")
  [".cp-table", /\.cp-table/],
  [".cp-bar", /\.cp-bar/],
  [".cp-model-chart-track", /\.cp-model-chart-track/],
  [".cp-fairuse", /\.cp-fairuse/],
  [".cp-plan-band", /\.cp-plan-band/],
  [".cp-stat", /\.cp-stat/],
];

const src = fs.readFileSync(GLOBALS, "utf8");
const root = postcss.parse(src, { from: GLOBALS });

const report = new Map();
const bump = (label, n) => {
  const e = report.get(label) || { rules: 0, sels: 0 };
  e.rules += 1;
  e.sels += n;
  report.set(label, e);
};

const labelFor = (sel) => {
  for (const [label, re] of DEAD) if (re.test(sel)) return label;
  return null;
};

// `:has(.ob-home)` / `:not(:has(.ob-home))` guards: the class is no longer emitted,
// so the positive form is dead and the negative form is always true — rewrite the
// latter to its bare selector instead of dropping a rule that still carries layout.
root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes/i.test(rule.parent.name || "")) return;
  if (!/:has\(\.ob-home\)/.test(rule.selector)) return;
  const parts = rule.selectors || [rule.selector];
  const keep = [];
  let dropped = 0;
  for (const p of parts) {
    if (/:not\(:has\(\.ob-home\)\)/.test(p)) keep.push(p.replace(/:not\(:has\(\.ob-home\)\)/g, ""));
    else dropped += 1;
  }
  if (!keep.length) {
    bump(".ob-home guard (dead rule)", parts.length);
    rule.remove();
  } else {
    if (dropped) bump(".ob-home guard (dropped selector)", dropped);
    bump(".ob-home guard (simplified)", keep.length);
    rule.selector = keep.join(", ");
  }
});

root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes/i.test(rule.parent.name || "")) return;
  const parts = rule.selectors || [rule.selector];
  const keep = [];
  const labels = new Set();
  for (const p of parts) {
    const label = labelFor(p);
    if (label) labels.add(label);
    else keep.push(p);
  }
  if (!labels.size) return;
  if (!keep.length) {
    for (const l of labels) bump(l, parts.length);
    rule.remove();
  } else {
    for (const l of labels) bump(`partial:${l}`, parts.length - keep.length);
    rule.selector = keep.join(", ");
  }
});

// drop @keyframes nothing references any more (decide against a stable snapshot)
const frames = [];
root.walkAtRules(/^keyframes$/i, (at) => frames.push(at));
const snapshot = root.toString();
for (const at of frames) {
  const name = at.params.trim();
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rest = snapshot.split(at.toString()).join("");
  const used = new RegExp(`animation[^;}]*${esc}`).test(rest) || new RegExp(`\\b${esc}\\b`).test(rest);
  if (!used) {
    at.remove();
    bump(`@keyframes ${name}`, 1);
  }
}

// drop @media blocks left empty
root.walkAtRules(/^media$/i, (at) => {
  const kids = (at.nodes || []).filter((n) => n.type !== "comment");
  if (!kids.length) {
    at.remove();
    bump("@media (empty)", 1);
  }
});

const out = root.toString();
const total = [...report.values()].reduce((a, b) => a + b.rules, 0);
console.log(`deleted rules: ${total}`);
for (const [label, e] of [...report.entries()].sort((a, b) => b[1].rules - a[1].rules)) {
  console.log(`  ${String(e.rules).padStart(4)}  ${label}${e.sels !== e.rules ? ` (${e.sels} selectors)` : ""}`);
}
console.log(`globals.css: ${src.split("\n").length} → ${out.split("\n").length} lines`);
if (CHECK) console.log("(check mode — nothing written)");
else {
  fs.writeFileSync(GLOBALS, out);
  console.log("written.");
}
