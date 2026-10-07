# Deliverables shelf — staged contract

`lib/pt/deliverables.ts` owns association, acceptance state, artifact hashes, and
content reads. Both clients consume `/api/deliverables` and its ID endpoint;
neither interprets tracker status or worker reports independently.

## Registered sources

`lib/pt/deliverables-registry.ts` explicitly registers:

- `safe-improvements`: `2026-10-02-safe-improvements` under
  `getConfig().paths.deliverablesReportsDir`.
- `pipeline-vault`: the existing `0800 Preciado Tech/Web Dev Pipeline` subtree
  of the configured vault, Markdown only.
- One tracker, `safe-improvements/tracker.json`, three exact coordinator review
  documents, the optional `coordinator-acceptance.json` receipt, and explicit
  prototype, preview/publication, and cleanup gate scopes.

The staged `data/config.json` adds only the `paths.deliverablesReportsDir` value
`/home/mp/preciado-tech-workspace/reports`. This file is local configuration;
the portable override is `MC_DELIVERABLES_REPORTS_DIR`. Its fallback is the
configured agent workspace's `reports` directory. It relocates registered
collections; it does not register every sibling report or allow request paths.

Pipeline `preview_file`, draft/file fields, artifact arrays, and `docs_path`
associate IDs only when their targets are inside a registered root. URLs and
outside paths do not become content sources. Vault title/date/group metadata
comes from `lib/vault-docs.ts`, shared with `/api/vault`. Vault client associations
now select from the common normalized pipeline model.

## State and authority

Priority is deliberate: an explicit coordinator/tracker rejection yields
`not-accepted`; an explicit scoped tracker hold yields `approval-held`. Gates
remain listed on rejected rows too. Missing artifacts then yield `unknown`.
`verified` requires all associated tasks to be tracker-verified **and** one
matching coordinator receipt. A prior verification, partial review, completed
worker, or awaiting task without matching hashes is `awaiting-verification`.
Queued/running/draft tasks are `draft`; unclassified inventory is `unknown`.
Tracker gates without files have their own unavailable rows.

The registered Markdown coordinator reviews may veto via an explicit
`Status: NOT ACCEPTED`/`REJECTED` line. They cannot grant verification. Worker
REPORT prose, process exit, pipeline completion and `TRACKER.md` cannot grant
acceptance. Existing tracker values and coordinator documents are never written.

For future coordinator use, the optional receipt schema is:

```json
{
  "schemaVersion": 1,
  "decisions": [{
    "path": "registered-relative-artifact.md",
    "state": "accepted",
    "artifactRevision": "<sha256 of exact artifact bytes>",
    "evidenceRevision": "<evidenceRevision from the independently reviewed index>"
  }]
}
```

`state: "not-accepted"` is also supported and overrides acceptance. Conflicting
or duplicate receipts never establish verification. The implementation does
not generate receipts. Only synthetic test fixtures create acceptance records.

`evidenceRevision` is SHA-256 of JSON containing the exact tracker file hash and
sorted `{ref, revision}` evidence records, including registered coordinator
review documents. The artifact itself is bound separately; the acceptance
receipt is excluded to avoid a circular hash. Its hash is exposed separately as
`coordinatorRevision` and participates in the index data revision. Missing evidence
cannot verify. Artifact, tracker, or evidence byte edits invalidate matching
acceptance. A timestamp-only change is not a new content revision.

## HTTP and filesystem boundary

- Both GETs use the existing private read auth (bearer, valid session, trusted
  address). Authentication runs before any artifact read. Responses are `E<T>`
  JSON, `no-store`, `nosniff`, and CSP `default-src 'none'; sandbox`.
- Index accepts no query parameters. Detail accepts only `revision` and optional
  `evidenceRevision`; the former is required to match, and the latter must match
  when the index has one. Unknown query fields/duplicates return 400.
- IDs are opaque SHA-256 of registered root ID and relative filename, never
  filenames to resolve from a request. Unknown/moved/escaped IDs return 404;
  revision disagreement returns 409; unsupported formats/binary data 415;
  content over 256 KiB 413. Source failures are sanitized.
- Supported extensions: `.txt`, `.md`, `.html`, `.htm`, valid UTF-8 without NUL.
  HTML has logical representation `text/html-source` **inside JSON**. The web
  renders a React text child in `<pre>`; QML uses `Text.PlainText`. No iframe,
  HTML interpretation, file execution, hosted preview, or publication action.
- The common resolver rejects traversal, hidden components, encoded traversal,
  symlink files and symlink ancestors. It pins an `O_NOFOLLOW` file descriptor,
  validates `/proc/self/fd` before reading, limits the read even if the file grows,
  and checks named/open inode and metadata afterward. This is a Linux server
  boundary; other platforms fail closed. This is also the vault metadata reader.
- Inventories cap at 2,000 visited entries, 12 directory levels, and 1,000 items
  per root. Tracker/evidence reads cap at 2 MiB. Truncation/errors are explicit.
  Scanned moved IDs are retained in bounded process memory; tracker references
  also retain unavailable rows across restart. Unreferenced moved rows may vanish
  after restart and continue to return 404 by their old ID.
- Clients poll every 60 seconds and stop content/link actions after transport
  expiry at 180 seconds or failed refresh. Both identify retained rows as last
  known. Detail requests rebuild current revisions. Auth denial hides retained
  rows/content. No persistent acceptance cache is used.

## Reproduce inside staging

```sh
npm run typecheck -- --incremental false
node --test --test-isolation=none --import ./tests/helpers/ts-resolve.mjs tests/pt-deliverables.test.mjs
node --test --test-isolation=none --import ./tests/helpers/ts-resolve.mjs tests/pt-deliverables-api.test.mjs
node --test --test-isolation=none --import ./tests/helpers/ts-resolve.mjs tests/vault-docs.test.mjs
node --import ./tests/helpers/ts-resolve.mjs scripts/verify-deliverables.mjs
node --import ./tests/helpers/ts-resolve.mjs tests/pt-deliverables-browser.mjs
```

The API parity test binds an ephemeral localhost fixture server and invokes the
actual staged route handlers; it does not start a Next service or query the live
portal. Browser QA bundles the actual component and intercepts every request with
synthetic fixtures. Desktop packaging and fixture refresh:

```sh
node --import ./tests/helpers/ts-resolve.mjs scripts/package-deliverables-desktop.mjs
node --import ./tests/helpers/ts-resolve.mjs scripts/freeze-deliverables-fixtures.mjs
```

The command catalog now enables Deliverables because the staged page exists.
The staged command package and its fixtures are regenerated from that catalog.
Command itself remains a disabled page destination. No live installation follows
from catalog readiness.
