#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# F.R.I.D.A.Y. — Framework for Running Intelligent Deployed Agents
# One-command startup: checks deps, installs, builds, launches, and
# opens the browser (first run lands on /setup; --demo seeds fake data).
#
# Usage: ./start.sh [--demo] [--rebuild] [--port N]
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-4175}"
DEMO=0
REBUILD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --demo) DEMO=1 ;;
    --rebuild) REBUILD=1 ;;
    --port) PORT="$2"; shift ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

say() { printf '\033[1;36m[F.R.I.D.A.Y.]\033[0m %s\n' "$*"; }

# 1. Node >= 22 (node:sqlite is used by the kanban reader + demo seeder)
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js >= 22 is required — install it from https://nodejs.org" >&2; exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 22 )); then
  echo "Node.js >= 22 required (found $(node -v))." >&2; exit 1
fi
say "node $(node -v) ✓"

# 2. Dependencies
if [[ ! -d node_modules ]]; then
  say "installing dependencies (first run)…"
  npm install --no-audit --no-fund
fi

# 3. Optional demo dataset ("an empty dashboard is hard to appreciate")
if (( DEMO )); then
  say "seeding demo data…"
  node scripts/seed-demo.mjs
fi

# 4. Production build (kept if fresh)
if [[ ! -d .next ]] || (( REBUILD )); then
  say "building…"
  npm run build
fi

# 5. Launch + open browser
FIRST_RUN=0
[[ -f data/config.json ]] || FIRST_RUN=1
URL="http://localhost:${PORT}/"
(( FIRST_RUN )) && URL="http://localhost:${PORT}/setup"

say "starting on port ${PORT} — ${URL}"
if command -v xdg-open >/dev/null 2>&1; then (sleep 2 && xdg-open "$URL") >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then (sleep 2 && open "$URL") >/dev/null 2>&1 &
else say "open ${URL} in your browser"
fi

exec npx next start -H 0.0.0.0 -p "$PORT"
