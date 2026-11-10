// Route-CSS audit: how many globals.css rules per prefix family, how many the
// owner module already carries, and whether the classes are used as literals.
// Usage: node scripts/route-css-audit.mjs
import postcss from "postcss";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const GLOBALS = "app/globals.css";

// prefix lists (longest-first matching)
const FAMILIES = [
  ["mc-rig", [".mc-rig"]],
  ["cp", [".cp-"]],
  ["mc-heatmap", [".mc-heatmap"]],
  ["mc-hbar", [".mc-hbar"]],
  ["mc-donut", [".mc-donut"]],
  ["mc-sparkline", [".mc-sparkline"]],
  ["mc-health", [".mc-health"]],
  ["mc-feed", [".mc-feed"]],
  ["mc-urgent", [".mc-urgent"]],
  ["mc-tile", [".mc-tile"]],
  ["mc-pipe", [".mc-pipe-"]],
  ["mc-content", [".mc-content-"]],
  ["mc-studio", [".mc-studio-"]],
  ["mc-signal", [".mc-signal-"]],
  ["mc-mem", [".mc-mem-"]],
  ["mc-setup", [".mc-setup-"]],
  ["mc-login", [".mc-login-"]],
  ["mc-gh", [".mc-gh-"]],
  ["mc-repo", [".mc-repo-"]],
  ["mc-commit", [".mc-commit"]],
  ["mc-proj", [".mc-proj-"]],
  ["cc-md", [".cc-md-"]],
  ["mc-chat", [".mc-chat"]],
  ["mc-led", [".mc-led"]],
  ["mc-ascii-head", [".mc-ascii-head"]],
  ["tframe", [".tframe-"]],
  ["srule", [".srule-"]],
  ["ob-btn", [".ob-btn"]],
  ["ob-dead", [".ob-home", ".ob-neural-canvas", ".ob-orb-readout"]],
  ["launchfilm", [".launch-", ".launchfilm", ".film-"]],
];

// collect every selector in globals.css with line + media
const globalsCss = fs.readFileSync(GLOBALS, "utf8");
const rootAst = postcss.parse(globalsCss, { from: GLOBALS });
const globalRules = [];
rootAst.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes/i.test(rule.parent.name || "")) return;
  const media = rule.parent?.type === "atrule" ? `@${rule.parent.name} ${rule.parent.params}` : null;
  globalRules.push({ line: rule.source.start.line, media, sel: rule.selector });
});

// walk the source tree for .module.css / css files
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".css")) acc.push(p);
  }
  return acc;
}
const cssFiles = walk("app")
  .concat(walk("components"))
  .concat(walk("lib"))
  .filter((f) => !f.endsWith("globals.css"));

const moduleSels = new Map(); // file -> Set(selector)
for (const f of cssFiles) {
  let ast;
  try {
    ast = postcss.parse(fs.readFileSync(f, "utf8"), { from: f });
  } catch {
    continue;
  }
  const set = new Set();
  ast.walkRules((r) => {
    if (r.parent?.type === "atrule" && /keyframes/i.test(r.parent.name || "")) return;
    set.add(r.selector);
  });
  moduleSels.set(f, set);
}

// tsx/ts literal usage
function walkSrc(dir, acc = [], exts = [".tsx", ".ts"]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkSrc(p, acc, exts);
    else if (exts.includes(path.extname(e.name))) acc.push(p);
  }
  return acc;
}
const srcFiles = walkSrc("app").concat(walkSrc("components")).concat(walkSrc("lib"));
const blob = srcFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");

const rows = [];
for (const [name, prefixes] of FAMILIES) {
  const hits = globalRules.filter((r) => prefixes.some((p) => r.sel.includes(p)));
  const sels = new Set(hits.map((r) => r.sel));
  // literal usage in tsx/ts ("mc-pipe-card" style, no leading dot)
  const lit = prefixes.map((p) => p.slice(1)).filter((p) => blob.includes(p));
  // owner modules that already declare any of these selectors
  const owners = [];
  for (const [f, set] of moduleSels) {
    const overlap = [...sels].filter((s) => set.has(s));
    if (overlap.length) owners.push(`${f}(${overlap.length})`);
  }
  // near-owner: module declaring the same class names ignoring whitespace
  const ownerAny = [];
  for (const [f, set] of moduleSels) {
    const decl = [...set].filter((s) => prefixes.some((p) => s.includes(p)));
    if (decl.length && !owners.includes(`${f}(${decl.length})`)) ownerAny.push(`${f}(${decl.length})`);
  }
  rows.push({
    family: name,
    rules: hits.length,
    lines: hits.length ? `${hits[0].line}-${hits[hits.length - 1].line}` : "",
    media: hits.filter((r) => r.media).length,
    literalUse: lit.join(","),
    declaredInModules: owners.join(" ") || ownerAny.join(" ") || "-",
  });
}
rows.sort((a, b) => b.rules - a.rules);
console.log(
  "family            rules  span(globals)   media  literalUse          declaredInModules"
);
for (const r of rows) {
  console.log(
    [r.family.padEnd(16), String(r.rules).padStart(5), r.lines.padEnd(15), String(r.media).padStart(4), r.literalUse.slice(0, 18).padEnd(19), r.declaredInModules.slice(0, 90)].join(" ")
  );
}
console.log("\nglobals.css total rules:", globalRules.length);
