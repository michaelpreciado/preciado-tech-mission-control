# Pipeline vault documents: real-checkout verification

Verified on 2026-09-12 directly in `/home/mp/Documents/mission-control`, branch `main`.

The feature commit `bc9efc52475854e8f292ce927c056349683d8d10` was already on
`main` and `origin/main`, but this working directory was still checked out to
`astra/fix-a-pipeline-auth` at `25430fc`. Switching this exact checkout to `main`
landed the implementation in the actual application directory. No repository was
copied, cloned, or mirrored, and the stale worktree was not modified.

## Implementation files

- `.env.example`, `lib/config.ts`: `MC_VAULT_DIR` override, existing config/legacy fallback, requested default.
- `lib/vault-docs.ts`: recursive read-only Markdown scan, metadata extraction, unreadable/missing directory handling, 60-second in-flight/result cache; separate raw `docs_path` lookup.
- `lib/vault-links.ts`: shared metadata types and encoded Obsidian links.
- `app/api/vault/route.ts`: pipeline-style authorization, no-store response with vault path, documents, groups, and client note counts.
- `components/VaultDocuments.tsx`, `components/vault-documents.css`: grouped documents, file paths, known update dates, client folder links/counts, existing UI components/theme.
- `app/pipeline/page.tsx`, `components/PipelineBoard.tsx`: additive provider, documents panel, and client Docs affordance.
- `tests/vault-docs.test.mjs`: seven scanner/link/API regressions.

`lib/pipeline-data.ts`, `lib/types.ts`, and existing stage/polling/event logic were
not changed. The unrelated pre-existing working edit in `lib/mission-api.ts` was
preserved and is excluded from this verification commit. The Obsidian vault and
its configuration were never written.

## Required checks

| Check | Actual result |
| --- | --- |
| a. `npm run build` | Exit 0; compiled successfully; TypeScript and production route generation completed, including `/api/vault` and `/pipeline`. |
| b. `npm test` | 242 tests passed, 0 failed, 0 skipped. Includes all seven vault tests. |
| c. Dev server + `curl /api/vault` | HTTP 200; `Cache-Control: no-store`; 45 documents across 7 groups; configured vault `/home/mp/Documents/Preciado Tech`. |
| d. Client folders | Avalon Roofing: 2 notes; All Weather Roofing: 2; Vernon Roofing: 2; Coaches HVAC ExtraordinAIR: 2. |
| e. `curl /pipeline` | HTTP 200, including after restoring the original vault configuration. |
| f. Missing directory and restoration | Restarted with `MC_VAULT_DIR=/home/mp/Documents/mission-control/artifacts/2026-09-12/nonexistent-vault`: HTTP 200, `docs: []`, `groups: []`, client counts 0. Restarted without the override: HTTP 200, original vault path, 45 docs. No config file edits were needed. |

Exact title matches: **Source of Truth Index**, **Pricing and Terms**,
**Pipeline Dashboard**, **Cleanup Log**, and **Outreach Ledger**.
The requested deployment document exists, but its actual first H1 is
**Preview Sites — Deployment Log**, not exactly **Deployment Log**. The scanner
correctly preserves the vault heading rather than substituting the filename.

Groups: Root, Architecture, Clients, Digital Presence Auditor, Lead Generation,
Outreach, Preview Sites.

The build emits existing warnings about inferred workspace root/multiple
lockfiles, the middleware convention, broad tracing from `conversation-actions`,
and experimental SQLite. There were no build errors. An initial sandboxed test
run reported only 22 file-level passes; rerunning outside the process sandbox
confirmed all 242 individual tests. The sandboxed build stalled at compilation;
the successful build used normal process access in this same directory.

## Local evidence and reproduction

Raw results are saved under `artifacts/2026-09-12/` (gitignored, to keep raw local
vault metadata and runtime logs out of the source repository):

- `pipeline-vault-build.log`
- `pipeline-vault-tests.log`
- `pipeline-vault-api.json` and `pipeline-vault-api.headers` — complete real 45-document response.
- `pipeline-vault-page.html` — curl response body.
- `pipeline-vault-missing.json` — complete missing-directory response.
- `pipeline-vault-restored.json` — complete restored response.
- `pipeline-vault-dev.log`, `pipeline-vault-missing-dev.log`, `pipeline-vault-restored-dev.log`.

Run from the real repository:

```sh
npm run build
npm test
npm run dev -- -H 127.0.0.1 -p 4185
curl -i http://127.0.0.1:4185/api/vault
curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4185/pipeline
```

Stop the verification server, restart with a nonexistent `MC_VAULT_DIR`, and curl
`/api/vault` again. Then stop that process and restart without the override to
restore the configured vault. Do not run two development servers against the
same `.next/dev` directory simultaneously.

The verification dev server was stopped after restoration. The generated
`next-env.d.ts` development-path change was restored to its checked-in value.
An optional headless-browser DOM check stalled on live page connections and
was stopped, so visual rendering was not verified. Obsidian desktop navigation
itself was not exercised; encoded links are covered by the regression suite.
No vault files were opened through a deep link.
