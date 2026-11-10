// Route-CSS extractor: move route-owned rule families out of app/globals.css
// into per-area stylesheets under app/styles/routes/, preserving @media context
// and multi-selector rules (splitting a rule when only some selectors move).
//
// Usage: node scripts/route-css-extract.mjs [--write]
//   (no --write)  dry run: prints the plan and per-file rule counts
//   --write       rewrites app/globals.css and the target files
import postcss from "postcss";
import fs from "node:fs";
import path from "node:path";

const WRITE = process.argv.includes("--write");
const GLOBALS = "app/globals.css";
const OUT_DIR = "app/styles/routes";

// family prefix (longest first) -> target file
const MAP = [
  ["mc-content-", "content.css"],
  ["mc-studio-", "content.css"],
  ["mc-signal-", "content.css"],
  ["mc-pipe-", "content.css"],
  ["mc-heatmap", "costs.css"],
  ["cp-", "costs.css"],
  ["mc-mem-", "memory.css"],
  ["mc-commit", "memory.css"],
  ["mc-proj-", "home.css"],
  ["mc-tile", "home.css"],
  ["mc-urgent", "home.css"],
  ["mc-feed", "home.css"],
  ["mc-gh-", "github.css"],
  ["mc-setup-", "setup.css"],
  ["mc-login-", "login.css"],
  ["mc-chat", "chat.css"],
  ["cc-md-", "markdown.css"],
  ["ob-btn", "buttons.css"],
];

const prefixes = MAP.map(([p]) => p).sort((a, b) => b.length - a.length);

function classify(selector) {
  // Classes named inside :not()/:is()/:has() are context, not ownership: a
  // `*:not(.mc-login-card)` guard must not drag the rule into login.css.
  const bare = selector.replace(/:(not|is|has|where)\((?:[^()]|\([^()]*\))*\)/g, " ");
  const tokens = bare.match(/\.([A-Za-z0-9_-]+)/g) || [];
  for (const t of tokens) {
    const name = t.slice(1);
    for (const p of prefixes) {
      if (name === p || name.startsWith(p)) {
        return MAP.find(([q]) => q === p)[1];
      }
    }
  }
  return null; // keep in globals.css
}

function splitSelectors(sel) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of sel) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const src = fs.readFileSync(GLOBALS, "utf8");
const root = postcss.parse(src, { from: GLOBALS });

// target file -> { media: Map(mediaParams|null -> strings[]) , nodes: [] } in order
const out = new Map();
function push(target, mediaParams, rule) {
  if (!out.has(target)) out.set(target, { order: [], media: new Map() });
  const bucket = out.get(target);
  const key = mediaParams || "";
  if (!bucket.media.has(key)) { bucket.media.set(key, []); bucket.order.push(key); }
  bucket.media.get(key).push(rule);
}

const stats = new Map();
let moved = 0, split = 0, kept = 0;

root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes/i.test(rule.parent.name || "")) return;
  if (rule.parent?.type === "atrule" && !/^(media|supports|layer)$/i.test(rule.parent.name || "")) return;
  const mediaParams = rule.parent?.type === "atrule" ? rule.parent.params : null;
  // media params may inherit from a nested atrule; collect ancestry
  let media = mediaParams;
  let p = rule.parent;
  const chain = [];
  while (p && p.type === "atrule" && /^(media|supports|layer)$/i.test(p.name || "")) {
    chain.unshift(`@${p.name} ${p.params}`);
    p = p.parent;
  }
  media = chain.length ? chain.join(" ") : null;

  const sels = splitSelectors(rule.selector);
  const groups = new Map();
  for (const s of sels) {
    const c = classify(s);
    const k = c || "__keep__";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  if (groups.size === 1 && groups.has("__keep__")) { kept++; return; }

  const clones = [];
  for (const [target, selsForTarget] of groups) {
    const clone = rule.clone({ selector: selsForTarget.join(",\n") });
    if (target === "__keep__") {
      clones.push({ target: null, node: clone });
    } else {
      clones.push({ target, node: clone });
      moved++;
      stats.set(target, (stats.get(target) || 0) + 1);
      push(target, media, clone);
    }
  }
  if (clones.length > 1) split++;
  // replace the original node with the kept clone(s)
  const keepers = clones.filter((c) => !c.target).map((c) => c.node);
  if (keepers.length === 1 && keepers[0].selector === rule.selector) return; // untouched
  if (keepers.length === 0) rule.remove();
  else rule.replaceWith(...keepers);
});

// drop now-empty at-rule wrappers
const pruneEmpty = (node) => {
  node.walkAtRules((at) => {
    if (!/^(media|supports|layer)$/i.test(at.name || "")) return;
    const kids = at.nodes ? at.nodes.filter((n) => n.type !== "comment") : [];
    if (!kids.length) at.remove();
  });
};
pruneEmpty(root);

console.log("families -> target files");
const byFile = new Map();
for (const [f, n] of stats) byFile.set(f, (byFile.get(f) || 0) + n);
for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log("  ", f.padEnd(14), n);
console.log("moved rules:", moved, "| split rules:", split, "| left in globals:", kept);

if (!WRITE) {
  console.log("\n(dry run — pass --write to apply)");
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const HEADERS = {
  "costs.css": "/* /costs — cost widgets, burn landscape, heatmap rails. Owner: components/views/CostsPanel.tsx */",
  "memory.css": "/* /memory — memory graph + stream. Owner: components/views/MemoryGraph.tsx · MemoryStream.tsx */",
  "content.css": "/* /content-creation — board, prompt studio, signal feed, pipeline cards. Owner: components/ContentCreationBoard.tsx */",
  "home.css": "/* home deck — project grid tiles, action feed, urgent strip. Owner: components/views/ProjectGrid.tsx · ActionFeed.tsx */",
  "github.css": "/* /github — commit heatmap. Owner: components/github.module.css consumers */",
  "setup.css": "/* /setup — setup wizard. Owner: app/setup */",
  "login.css": "/* /login — login form. Owner: app/login */",
  "chat.css": "/* /chat — chat shell. Owner: components/ChatShell.tsx */",
  "markdown.css": "/* shared — rendered markdown blocks. Owner: components/Markdown.tsx */",
  "buttons.css": "/* shared — .ob-btn button primitives (v4 shell). Owner: components/ui.tsx */",
};
for (const [file, bucket] of out) {
  const chunks = [];
  for (const key of bucket.order) {
    const rules = bucket.media.get(key);
    const body = rules.map((r) => r.toString()).join("\n");
    if (!key) chunks.push(body);
    else {
      // rebuild the nesting: keys look like "@media (...) @supports (...)"
      const layers = key.split(/ (?=@)/);
      let inner = body;
      for (const l of layers.reverse()) {
        const [at, ...params] = l.split(" ");
        inner = `${at} ${params.join(" ")} {\n${inner}\n}`;
      }
      chunks.push(inner);
    }
  }
  const text = `${HEADERS[file] || `/* route CSS — ${file} */`}\n\n${chunks.join("\n\n")}\n`;
  fs.writeFileSync(path.join(OUT_DIR, file), text, "utf8");
}
fs.writeFileSync(GLOBALS, root.toString(), "utf8");
console.log("\nwrote", out.size, "route sheets + rewrote", GLOBALS);
