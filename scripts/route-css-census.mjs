// Census of what is still left in app/globals.css, by leading class token,
// with a "dead" flag when the class literal appears in no tsx/ts source.
import postcss from "postcss";
import fs from "node:fs";
import path from "node:path";

function walk(dir, acc = [], exts = [".tsx", ".ts"]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc, exts);
    else if (exts.includes(path.extname(e.name))) acc.push(p);
  }
  return acc;
}

const src = walk("app").concat(walk("components")).concat(walk("lib"))
  .map((f) => fs.readFileSync(f, "utf8")).join("\n");

const css = fs.readFileSync("app/globals.css", "utf8");
const root = postcss.parse(css);
const counts = new Map(); // leading token -> {rules, dead}
const deadClasses = new Map();
let total = 0;
root.walkRules((r) => {
  if (r.parent?.type === "atrule" && /keyframes/i.test(r.parent.name || "")) return;
  total++;
  const tokens = (r.selector.match(/\.([A-Za-z0-9_-]+)/g) || []).map((t) => t.slice(1));
  const lead = tokens[0] || r.selector.slice(0, 24);
  const fam = lead.replace(/-\d+$/, "").split("-").slice(0, 2).join("-");
  const key = tokens.length ? fam : `!${lead}`;
  const cur = counts.get(key) || { rules: 0, dead: 0 };
  cur.rules++;
  const anyLive = tokens.some((t) => src.includes(t));
  if (!anyLive) { cur.dead++; for (const t of tokens) deadClasses.set(t, (deadClasses.get(t) || 0) + 1); }
  counts.set(key, cur);
});
console.log("globals.css rules:", total, "| lines:", css.split("\n").length);
for (const [k, v] of [...counts].sort((a, b) => b[1].rules - a[1].rules).slice(0, 45)) {
  console.log(`  ${k.padEnd(22)} rules=${String(v.rules).padStart(4)} dead=${v.dead}`);
}
console.log("\ntop dead classes (no tsx/ts mention):");
for (const [c, n] of [...deadClasses].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${c} x${n}`);
