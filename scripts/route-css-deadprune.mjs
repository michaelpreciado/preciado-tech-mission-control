// Delete rules from app/globals.css whose every class token is referenced by
// no .tsx/.ts source AND that cannot be produced by a dynamic class
// construction (e.g. `mc-btn-${variant}`). Conservative: one doubt => keep.
// Usage: node scripts/route-css-deadprune.mjs [--write]
import postcss from "postcss";
import fs from "node:fs";
import path from "node:path";

const WRITE = process.argv.includes("--write");
const GLOBALS = "app/globals.css";

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if ([".tsx", ".ts", ".mjs", ".js"].includes(path.extname(e.name))) acc.push(p);
  }
  return acc;
}

const files = [...walk("app"), ...walk("components"), ...walk("lib"), ...walk("tests")];
const src = files.map((f) => [f, fs.readFileSync(f, "utf8"), ]);

// dynamic class constructions: capture the literal prefix before `${`
const dyn = new Set();
for (const [f, text] of src) {
  for (const m of text.matchAll(/[`'"]([a-zA-Z][\w-]*)\$\{/g)) dyn.add(m[1]);
  for (const m of text.matchAll(/`([a-zA-Z][\w-]*)-/g)) {
    if (text.includes("${")) dyn.add(m[1]);
  }
}
const dynPrefixes = [...dyn].filter(Boolean);
const SOURCE = src.map(([, t]) => t).join("\n");

const isDynamic = (cls) => dynPrefixes.some((p) => cls === p || cls.startsWith(p));

const root = postcss.parse(fs.readFileSync(GLOBALS, "utf8"), { from: GLOBALS });
const removed = [];
root.walkRules((r) => {
  const parent = r.parent;
  if (parent?.type === "atrule" && /keyframes/i.test(parent.name || "")) return;
  const tokens = (r.selector.match(/\.([A-Za-z0-9_-]+)/g) || []).map((t) => t.slice(1));
  if (!tokens.length) return;
  if (tokens.some((t) => SOURCE.includes(t))) return;      // some token is live
  if (tokens.some(isDynamic)) return;                      // could be built at runtime
  removed.push({ sel: r.selector.replace(/\s+/g, " "), parent: parent?.type === "atrule" ? `@${parent.name} ${parent.params}` : "" });
  r.remove();
});

root.walkAtRules((at) => {
  if (!/^(media|supports|layer)$/i.test(at.name || "")) return;
  if (!(at.nodes || []).filter((n) => n.type !== "comment").length) at.remove();
});

console.log("dynamic prefixes guarded:", dynPrefixes.join(", ") || "(none)");
console.log("dead rules removed:", removed.length);
for (const r of removed) console.log(`  ${r.sel}${r.parent ? `   [${r.parent}]` : ""}`);
if (WRITE) {
  const out = root.toString();
  fs.writeFileSync(GLOBALS, out, "utf8");
  console.log("globals.css lines now:", out.split("\n").length);
} else console.log("(dry run)");
