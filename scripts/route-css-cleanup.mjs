// Post-prune cleanup for the aurora polish pass (item 2/4):
//  * drop stale comments that pointed at deleted `.mc-led` / `.mc-rig-*` sections
//  * simplify the `:not(:has(.ob-home))` guards in app/styles/fold.css (class gone)
// Usage: node scripts/route-css-cleanup.mjs
import fs from "node:fs";

let changed = 0;

// ---- globals.css comment touch-ups -----------------------------------------
{
  const p = "app/globals.css";
  let s = fs.readFileSync(p, "utf8");
  const before = s;
  s = s
    .replace(/section above \(near \.mc-led\)\. \*\//, "section above. */")
    .replace(/see the Button primitive section near \.mc-led\. \*\//, "see the Button primitive section. */")
    .replace(/\.mc-rig-trace-head already owns `filter` for its glow\. \*\//, "glow removed in the widget-theme pass. */");
  if (s !== before) {
    fs.writeFileSync(p, s);
    changed += 1;
    console.log("globals.css: stale comments updated");
  } else {
    console.log("globals.css: no stale comments matched (already clean?)");
  }
}

// ---- fold.css .ob-home guards ----------------------------------------------
for (const p of ["app/styles/fold.css", "app/w2l.css"]) {
  if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, "utf8");
  const hits = (s.match(/:not\(:has\(\.ob-home\)\)/g) || []).length;
  const pos = (s.match(/:has\(\.ob-home\)/g) || []).length - hits;
  if (hits) s = s.replace(/:not\(:has\(\.ob-home\)\)/g, "");
  if (s !== fs.readFileSync(p, "utf8")) {
    fs.writeFileSync(p, s);
    changed += 1;
  }
  console.log(`${p}: ${hits} negative guard(s) simplified, ${pos} positive guard(s) still present`);
}

console.log(changed ? "files written." : "nothing written.");
