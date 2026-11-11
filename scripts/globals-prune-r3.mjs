// Round-3 globals.css prune (kanban t_196de98b).
//
// Two order-preserving mechanisms:
//   1. MOVE  — route/component-owned rule families leave app/globals.css for an
//              ordered sheet of their own (cmdp / boot / ascii / styleguide /
//              primitives) or an existing route sheet (content.css). Moved nodes
//              keep document order, and the sheets are imported in that same
//              order from app/layout.tsx, so the cascade is unchanged.
//   2. DROP  — rules whose class tokens no source file emits and that cannot be
//              produced dynamically. Selectors using attribute-substring
//              matching ([class*=…]), :not() or html:root body hardening are
//              never dropped or moved (test-pinned; see tests/motion-css.test.mjs,
//              tests/shell-scroll.test.mjs).
//
// Mixed-family at-rules (e.g. one reduced-motion block covering both boot and
// skeleton rules) are split into per-family clones so the reduced-motion
// override always travels with the base rule it protects.
//
// Usage: node scripts/globals-prune-r3.mjs [--write]
import postcss from "postcss";
import fs from "node:fs";
import path from "node:path";

const WRITE = process.argv.includes("--write");
const GLOBALS = "app/globals.css";
const ROUTE_DIR = "app/styles/routes";

// family -> [target file, selector regex, minLine?]
// `minLine` restricts a family to a document suffix, which makes the move
// order-preserving by construction (nothing later can overtake it).
const PRIMITIVES_FROM = 2352; // "shared button material + phone ergonomics + widget primitives"
const FAMILIES = [
  ["cmdp", path.join(ROUTE_DIR, "cmdp.css"), /\.cmdp/],
  ["boot", path.join(ROUTE_DIR, "boot.css"), /\.boot-/],
  ["ascii", path.join(ROUTE_DIR, "ascii.css"), /\.(asciiviz|ob-wordmark|cyber-wordmark|cyber-terminal-art)/],
  ["styleguide", path.join(ROUTE_DIR, "styleguide.css"), /(^|[\s,])\.sg(-|[\s,:.{]|$)/],
  ["content-studio", path.join(ROUTE_DIR, "content.css"), /\.mc-(studio|prompt-out|signal-)/],
  ["primitives", "app/styles/primitives.css", /.*/, PRIMITIVES_FROM],
];

const HEADERS = {
  "app/styles/routes/cmdp.css": "/* Command palette (⌘K / Ctrl-K). Owner: components/CommandPalette.tsx */",
  "app/styles/routes/boot.css": "/* Boot sequence, fault console, designed boot/loading. Owners: app/loading.tsx, components/BootSequence.tsx */",
  "app/styles/routes/ascii.css": "/* ASCII data-viz + figlet wordmarks. Owners: components/ascii-viz.tsx, app/vf/Ascii.tsx */",
  "app/styles/routes/styleguide.css": "/* /styleguide — design-system specimen wall. Owner: app/styleguide/page.tsx */",
  "app/styles/primitives.css": "/* Widget primitives + phone ergonomics + shared button material (tail of the old globals.css, split out 2026-11-10 so the global sheet stops growing). Loaded right after globals.css. */",
};

// Dead families: no .tsx/.ts/.mjs source reference, no dynamic construction.
const DEAD = [
  /\.mc-tcol-head/, /\.mc-tcol-count/, /\.mc-core-orb/, /\.mc-viz-grid/,
  /\.mc-home-title/, /\.mc-home-tile/, /\.mc-home-agent/, /\.mc-task-link/,
  /\.mc-mobile-item/, /\.mc-more-cell/, /\.mc-more-search/, /\.mc-swatch/,
  /\.setup-tabrow-grip/, /\.mc-btn-primary/, /\.mc-btn-confirm/, /\.mc-btn-danger/,
  /\.mc-btn-ghost/, /\.mc-gauge/, /\.boot-overlay/, /\.boot-skip/, /\.boot-leaving/,
  /\.mc-bridge/, /\.mc-cockpit/, /brandMark/, /\.mc-setup\b/,
];

// Never moved, never dropped: test-pinned rules and high-specificity hardening.
const PINNED = [
  /^\.mc-hud3d$/,                 // tests/motion-css.test.mjs — the contain:paint owner
  /^\.mc-shell > \.mc-main$/,     // tests/shell-scroll.test.mjs
  /^\.mc-main$/,
  /^html:root/,
];

const FAMILY_KEYS = FAMILIES.map(([k]) => k);
const src = fs.readFileSync(GLOBALS, "utf8");
const root = postcss.parse(src, { from: GLOBALS });

// ---------- source corpus (dead-rule verification) ----------
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if ([".tsx", ".ts", ".mjs", ".js"].includes(path.extname(e.name))) acc.push(p);
  }
  return acc;
}
const SOURCE = [...walk("app"), ...walk("components"), ...walk("lib"), ...walk("tests")]
  .map((f) => fs.readFileSync(f, "utf8")).join("\n");

const isPinned = (sel) => PINNED.some((re) => re.test(sel));
const isAttrMatch = (sel) => /\[class[*^$~|]?=/.test(sel);

function keyOfSelector(sel, line) {
  if (isPinned(sel)) return null;
  for (const [key, , re, minLine] of FAMILIES) {
    if (minLine && line < minLine) continue;
    if (re.source === ".*" ? Boolean(minLine) : re.test(sel)) return key;
  }
  return null;
}
const innerRules = (node) => (node.type === "atrule" && node.nodes ? node.nodes.filter((n) => n.type === "rule") : []);
function keyOf(node) {
  if (node.type === "rule") return keyOfSelector(node.selector, node.source.start.line);
  if (node.type === "atrule") {
    const rules = innerRules(node);
    if (!rules.length) return null;
    const keys = [...new Set(rules.map((r) => keyOfSelector(r.selector, r.source.start.line)))];
    return keys.length === 1 ? keys[0] : null; // null = keep whole / split below
  }
  return null;
}
function isMixedAtRule(node) {
  if (node.type !== "atrule" || !node.nodes) return false;
  const rules = innerRules(node);
  if (rules.length < 2) return false;
  const keys = new Set(rules.map((r) => keyOfSelector(r.selector, r.source.start.line)));
  return keys.size > 1;
}

// ---------- normalise: split mixed at-rules into per-family clones ----------
let splitCount = 0;
for (const node of [...root.nodes]) {
  if (!isMixedAtRule(node)) continue;
  const parts = new Map(); // key -> node[]
  const keep = [];
  for (const child of node.nodes) {
    if (child.type !== "rule") { keep.push(child); continue; }
    const k = keyOfSelector(child.selector, child.source.start.line);
    if (!k) { keep.push(child); continue; }
    if (!parts.has(k)) parts.set(k, []);
    parts.get(k).push(child);
  }
  for (const [k, children] of parts) {
    const clone = node.clone();
    clone.removeAll();
    children.forEach((c) => clone.append(c.clone()));
    node.parent.insertAfter(node, clone);
    clone.raws.familyKey = k;
    splitCount += children.length;
  }
  node.removeAll();
  if (keep.length) keep.forEach((c) => node.append(c));
  else node.remove();
}

// ---------- group consecutive same-family top-level nodes into spans ----------
const spans = new Map();
let curKey = null, curNodes = [];
const flush = () => {
  if (curKey) spans.set(curKey, [...(spans.get(curKey) || []), ...curNodes]);
  curKey = null; curNodes = [];
};
for (const node of [...root.nodes]) {
  if (node.type === "comment" || node.type === "decl") { if (curKey) curNodes.push(node); continue; }
  const key = node.raws.familyKey || keyOf(node);
  if (key && key === curKey) curNodes.push(node);
  else if (key) { flush(); curKey = key; curNodes = [node]; }
  else flush();
}
flush();

const movedReport = [];
let movedRules = 0;
for (const key of FAMILY_KEYS) {
  const nodes = spans.get(key);
  if (!nodes) continue;
  const file = FAMILIES.find(([k]) => k === key)[1];
  const body = nodes.map((n) => n.toString()).join("\n").replace(/\n{3,}/g, "\n\n");
  const rules = nodes.reduce((n, x) => n + (x.type === "rule" ? 1 : innerRules(x).length), 0);
  movedReport.push([key, file, rules, body.split("\n").length]);
  nodes.forEach((n) => n.remove());
  if (WRITE) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const head = fs.existsSync(file)
      ? fs.readFileSync(file, "utf8").trimEnd()
      : (HEADERS[file] || `/* route CSS — ${path.basename(file)} */`);
    fs.writeFileSync(file, `${head}\n\n${body}\n`, "utf8");
  }
  movedRules += rules;
}

// ---------- drop dead rules ----------
const dropped = [];
root.walkRules((r) => {
  if (r.parent?.type === "atrule" && /keyframes/i.test(r.parent.name || "")) return;
  const sel = r.selector;
  if (isPinned(sel) || isAttrMatch(sel) || /:not\(/.test(sel)) return;
  const toks = [...new Set((sel.match(/\.([A-Za-z0-9_-]+)/g) || []).map((t) => t.slice(1)))];
  if (!toks.length) return;
  if (toks.some((t) => SOURCE.includes(t))) return;
  if (!DEAD.some((re) => re.test(sel) || toks.some((t) => re.test("." + t)))) return;
  dropped.push(sel.replace(/\s+/g, " "));
  r.remove();
});
root.walkAtRules((at) => {
  if (!/^(media|supports|layer)$/i.test(at.name || "")) return;
  if (!(at.nodes || []).filter((n) => n.type !== "comment").length) at.remove();
});

const out = root.toString().replace(/\n{3,}/g, "\n\n");
const before = src.split("\n").length;
const after = out.split("\n").length;

console.log(`split mixed at-rules: ${splitCount} inner rules re-homed`);
console.log("MOVED");
for (const [key, file, rules, lines] of movedReport) console.log(`  ${key.padEnd(15)} -> ${file.padEnd(35)} ${String(rules).padStart(3)} rules, ${lines} lines`);
console.log(`  total moved rules: ${movedRules}`);
console.log(`\nDROPPED dead rules: ${dropped.length}`);
for (const s of dropped) console.log("  -", s);
console.log(`\nlines: ${before} -> ${after}`);
if (WRITE) { fs.writeFileSync(GLOBALS, out, "utf8"); console.log("wrote", GLOBALS); }
else console.log("(dry run — pass --write)");
