# T10 — CONTENT COMMAND: production studio + signal feed

Repo: `~/Documents/mission-control` (branch main). Work directly in the repo, commit with subject prefix `[T10]`, **do not push**. No new npm dependencies (built-in `fetch`, regex only).

## Context

`/content-creation` currently renders `ContentCreationBoard` (idea queue, fed by `/api/ml-content`). Keep that board working exactly as-is. We are RECREATING the page as three stacked sections with the same Blue Matrix Glass v3 design language (see `app/globals.css` `.mc-pipe-*` and `.mc-content-*` blocks, and `lib/nav-tabs.ts` for tone):

1. **IDEA QUEUE** — the existing `ContentCreationBoard` (unchanged code, new section heading above it).
2. **PRODUCTION STUDIO** — new component: turns an idea (or manual entry) into the paste-ready **Preciado Tech Master Video Prompt** (HyperFrames brand-locked 25-32s vertical video prompt) with one-click copy.
3. **SIGNAL FEED** — new component: aggregated news/posts that match Preciado Tech interests (AI agents, local inference, robotics, trading/crypto, LLM tooling), served by a new server route.

Already in the repo for this task (do not modify):
- `data/content/video-prompt-template.txt` — the full master video prompt template. It contains `<<DOUBLE_BRACKET>>` slots; this task wires it into a route.
- `data/config.json` — now contains `contentSignals.keywords` (array of lowercase strings).

## Work items

### 1. Route: `app/api/content-signals/route.ts` (NEW)

`GET` → `200 JSON`, `Cache-Control: s-maxage=600, stale-while-revalidate=600`.

- **HN**: `https://hacker-news.firebaseio.com/v0/topstories.json` → first 30 ids → `Promise.all` fetch `https://hacker-news.firebaseio.com/v0/item/{id}.json` (per-request timeout ~4s, skip failures quietly).
- **arXiv**: `https://rss.arxiv.org/rss/cs.RO` and `https://rss.arxiv.org/rss/cs.AI`. Parse with regex over `<entry>` blocks extracting `<title>`, `<link href>` (or `<id>`), `<published>`, `<summary>` (strip html tags from summary to ~200 chars). Take first 12 entries per feed.
- **Matching**: lowercase `title + summary`; a keyword from `contentSignals.keywords` (read from `data/config.json`, fallback to a sane default list if missing) matches when `new RegExp('\\b' + escaped + '\\b')` hits. Collect all matched keywords as tags (max 4 shown).
- **Response shape**:
  ```json
  {
    "generatedAt": "ISO",
    "count": N,
    "sources": ["HN", "arXiv:cs.RO", "arXiv:cs.AI"],
    "errors": [],
    "signals": [
      { "id": "hn-123|arxiv-2403.123", "title": "...", "url": "https://...",
        "source": "HN | arXiv:cs.RO | arXiv:cs.AI", "author": "str|null",
        "score": 123, "ageDays": 1.2, "summary": "truncated|null",
        "tags": ["llm", "agents"], "matched": true }
    ]
  }
  ```
- **Ordering**: matched first (tag count desc, then ageDays asc), then unmatched (ageDays asc). Cap 40 total. HN items without url: `url = 'https://news.ycombinator.com/item?id=' + id`.
- **Resilience**: each source fetched independently in a try/catch; a failed source adds a message to `errors` and the others still return. Top-level 4s deadline: if the whole thing drags, return what resolved.
- `ageDays` from `time`/`published` vs now, rounded to 1 decimal.

### 2. Route: `app/api/content-prompt/route.ts` (NEW)

`GET` with query params: `topic`, `hook`, `steps`, `terminal`, `payoff`, `length` (all optional, default `''` except `length` default `30`).

- Read `data/content/video-prompt-template.txt` relative to `process.cwd()`.
- Replace template slots with URL-decoded params (replace ALL occurrences):
  - `<<TOPIC>>` ← topic (fallback `Untitled build`)
  - `<<HOOK LINE>>` ← hook (fallback `Watch what I built`)
  - `<<NUMBER OF STEPS>>` ← derive: count lines in `steps` that are step titles (lines NOT starting with `- ` and non-blank), clamp 3-5, fallback `4`
  - `<<STEP TITLES>>` ← `Step 1: X | Step 2: Y | ...` from the same titles, fallback `Step 1: Boot | Step 2: Build | Step 3: Prove | Step 4: Payoff`
  - `<<STEP BULLETS>>` ← raw `steps` text reflowed: keep as-is (it already uses `TITLE` + `- bullet` lines)
  - `<<TERMINAL COMMAND>>` ← terminal (fallback `./preciado-build --mode=live`)
  - `<<PAYOFF / RESULT>>` ← payoff (fallback `it works, and it's on my own hardware`)
  - `<<TARGET LENGTH>>` ← `${length} seconds (25-32s safe band)`
  - Slots `<<CTA HANDLE>>`, `<<CTA TEXT>>`, `<<PLATFORM>>`, `<<SOURCE ASSETS>>` exist in the template — replace `<<CTA HANDLE>>`→`@preciadotech`, `<<CTA TEXT>>`→`+ FOLLOW FOR AI TECH`, `<<PLATFORM>>`→`TikTok + Instagram Reels + YouTube Shorts (9:16, 1080x1920, 30fps)`, `<<SOURCE ASSETS>>`→`screenshots + terminal captures in ./assets/`.
- Response: `{ "prompt": "...", "chars": N }`. `Cache-Control: no-store`. Template file missing → `500 { "error": "template missing" }`.
- IMPORTANT: the template contains literal `<<...>>` that must NOT break naive `String.replace` — use `.split(slot).join(value)` semantics (global replace), done per slot.

### 3. `components/VideoPromptStudio.tsx` (NEW, `'use client'`)

Two-column layout (class `mc-studio`), collapses to 1 column under 1100px:

- **Left column — INPUTS**:
  - `IDEA PRESET` select (options from `fetch('/api/ml-content')` on mount: `#${i.week} · ${i.title}`; plus a `manual / blank` option). Selecting pre-fills: topic ← `i.title`, hook ← best guess = the hook pattern that fits (`I built ${lowercased short version}` is too clever — just leave hook blank and put `i.title` in topic; user edits hook), steps ← `i.outline` rendered as `Step ${n}: ${beat}` lines (bullets left empty; user adds).
  - Fields (monospace inputs, label style like `.mc-content-search` / existing form-ish classes):
    - `TOPIC` (text), `HOOK LINE` (text, helper: `max 6 words`),
    - `STEPS` (textarea 8 rows; format shown in placeholder: `Step 1: Boot\n- one short bullet\n\nStep 2: Build\n- another bullet`),
    - `TERMINAL COMMAND` (text), `PAYOFF` (text), `LENGTH` (number, default 30, min 25 max 32).
  - `BUILD PROMPT` button (terminal-button styling, see existing `.mc-btn-terminal`-ish classes in globals.css; create `.mc-studio-btn` if none fits).
- **Right column — OUTPUT**:
  - Header row: `MASTER VIDEO PROMPT` + char count + `COPY` button.
  - Glass card with `<pre class="mc-prompt-out">` (monospace, wrapped off, horizontal scroll, max-height 70vh, overflow auto) rendering the fetched prompt.
  - Empty state before first build: skeleton (`SkeletonPanel` from `@/components/ui` with label `production studio`) or a `>` prompt line "select an idea, then BUILD PROMPT".
  - Copy: `navigator.clipboard.writeText`, button flips to `COPIED ✓` for 1.5s.
  - Fetch failure → inline error line in warn-red (`--warn-red`), no page crash.
- No new deps. No external fonts. All text monospace per brand.

### 4. `components/SignalFeed.tsx` (NEW, `'use client'`)

- `useEffect` fetch `/api/content-signals`. Loading → `SkeletonPanel` label `signal feed`.
- Toolbar: filter chips (`.mc-signal-chip`, active state = filled): `ALL`, `MATCHED`, `HN`, `arXiv`; plus a title search input (existing `.mc-content-search` styling, re-used with a narrower width class). Chips are OR'd with search; `MATCHED` chip = `matched:true` only.
- Result line: `${n} signals · matched first · fetched ${time}`.
- Cards (reuse `.mc-pipe-card` / `.mc-pipe-card-head` / `.mc-pipe-meta` styling, new class `.mc-signal-card` where needed): rank `#01`, source badge (`.mc-signal-src`: `HN` blue, `ARXIV` green-ish terminal-green), title as `<a>` (target _blank, neon underline on hover), meta line (`age 1.2d · score 123 · by name`), and matched keyword chips (`.mc-signal-tag`, terminal-green outline). Items with `ageDays < 1` get a `NEW` badge (warn-red).
- No images, no iframes, no localStorage.

### 5. Page: `app/content-creation/page.tsx` (REWRITE)

Keep `CommandHeader` + `v3-kicker` conventions. Three sections:

```tsx
'use client'
import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'
import '../vf/v3-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const ContentCreationBoard = dynamic(() => import('@/components/ContentCreationBoard').then(m => m.ContentCreationBoard), { ssr: false })
const VideoPromptStudio = dynamic(() => import('@/components/VideoPromptStudio').then(m => m.VideoPromptStudio), { ssr: false, loading: () => <SkeletonShell/> } )
const SignalFeed = dynamic(() => import('@/components/SignalFeed').then(m => m.SignalFeed), { ssr: false, loading: () => <SkeletonShell/> } )

export default function ContentCreationPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="CONTENT CREATION / IDEA QUEUE" />
      <div className="v3-kicker"><span className="jp">制作</span> idea queue</div>
      <ContentCreationBoard />
      <div className="mc-section-gap" />
      <SectionHead label="CONTENT CREATION / PRODUCTION STUDIO" />
      <div className="v3-kicker"><span className="jp">制作</span> production studio</div>
      <VideoPromptStudio />
      <div className="mc-section-gap" />
      <SectionHead label="CONTENT CREATION / SIGNAL FEED" />
      <div className="v3-kicker"><span className="jp">信号</span> interest-matched signal feed</div>
      <SignalFeed />
    </>
  )
}
```
(SkeletonShell = tiny local component using `SkeletonPanel` — define it in-file.)

### 6. `app/globals.css` (APPEND)

New classes, following existing variable tokens (`--neon-blue`, `--terminal-green`, `--warn-red`, `--bg-deep`, `--grid-line`, card radius 14px, glass blur):
- `.mc-section-gap` (48px vertical spacing)
- `.mc-studio` (grid 1fr 1.2fr, gap 20px; 1fr under 1100px), `.mc-studio-inputs`, `.mc-studio-output`, `.mc-studio-field` (label + input stack), `.mc-studio-btn`, `.mc-studio-copybtn`, `.mc-prompt-out`
- `.mc-signal-toolbar`, `.mc-signal-chip` (+ `.active`), `.mc-signal-card`, `.mc-signal-src`, `.mc-signal-tag`, `.mc-signal-new`, `.mc-signal-meta`
- All monospace; no sans-serif; consistent with `.mc-pipe-card` look (1.5px neon border + double glow, rgba(2,3,10,0.72) fill + blur(14px)).

## Verification (run these, include output in handoff)

1. `npx tsc --noEmit` → clean
2. `npm run build` → clean
Run a temporary dev server for ALL live checks (`PORT=4139 npx next dev -p 4139` in background — the production service on 4176 has not picked up this code yet, so it will 404 the new routes). Kill the dev server when done.
3. `curl -s localhost:4139/api/content-signals | head -c 600` → JSON with ≥15 signals, matched-first ordering, `errors` array present (may be empty)
4. `curl -s "localhost:4139/api/content-prompt?topic=AI%20Trading%20Bot&hook=I%20built%20an%20AI%20that%20trades&type=..." | head -c 400` → prompt text with TOPIC substituted and `@preciadotech` present
5. Playwright (require `/home/mp/.hermes/hermes-agent/node_modules/playwright`, pattern: launchPersistentContext with a temp profile dir — no external network needed) screenshots of `http://127.0.0.1:4139/content-creation` at 1440x900 and 390x844 → wait for `networkidle` then an extra 3s; full-page screenshot → no horizontal scroll, all 3 sections render, signal cards visible, studio empty-state visible. Save to `artifacts/2026-09-04/content-studio-{desktop,mobile}.png`
6. `grep -c "sans-serif" <new file sections>` sanity: no sans added in new CSS.

## Commit

One commit `[T10] content command: studio + signals`, message body lists files. Do NOT push.

## Non-goals

- No LLM calls from this page (everything deterministic).
- No changes to `ContentCreationBoard.tsx`, `/api/ml-content`, or existing `/costs` behavior.
- No new npm deps.
