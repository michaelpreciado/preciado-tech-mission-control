# PT read projections

`lib/pt` owns the four read projections. HTTP failures use `E<T>`; successful
pipeline default/revenue reads retain the existing compatibility DTO. Radar,
crew, commands and deliverables successful reads use `E<T>`.

## Authorization and credential transport

`lib/pt/read-auth.ts` intentionally accepts any of:

- A trusted client IP, resolved by `lib/mission-api.ts`. The default ranges include
  Tailnet `100.64.0.0/10`, used by desktop widgets.
- The deployed `INTERNAL_API_SECRET` bearer.
- A valid Mission Control session cookie.

This is not bearer-only authorization. Trusted IPs and valid sessions remain
accepted without a bearer or with an incorrect bearer. Missing credentials do
not grant access to an otherwise untrusted, unauthenticated caller. IP/proxy
configuration remains owned by `mission-api.ts`.

Collectors read the deployed `INTERNAL_API_SECRET` from an owner-only regular
credential file. They send it through curl configuration on stdin, disable
curlrc and redirects, suppress curl stderr, and remove **both**
`INTERNAL_API_SECRET` and `MC_INTERNAL_API_SECRET` from curl's child environment.
The MC-prefixed name is scrubbed defensively; this change does not migrate the
service or credential-file format to that alias.

Pipeline mutation handlers have a separate legacy policy, including their
existing fail-open cases. Lane 07 deliberately leaves that policy unchanged and
flags it for a separately authorized mutation-policy review. The GET policy must
not be substituted into mutation handlers.

## Freshness and availability

`evaluateFreshness` in `lib/pt/contract.ts` classifies evidence. The cadence
boundary is inclusive: evidence exactly one cadence old is fresh; older evidence
is stale. Pipeline records and dated business facts use the seven-day attention
cadence, including terminal records. Old terminal evidence is stale but does not
create an unfinished-work attention item.

The optional v1 source field `freshnessBasis` makes scan quality explicit:
`inventory` evaluates the last successful scan (`lastSuccessAt`); `fact`
evaluates the producer time (`sourceAt`). Pipeline and crew source inventories
use the former. Their business facts keep their producer dates and use their
own cadences. A successful scan never renews a fact. Consumers that receive an
older v1 source without the annotation continue using its owner-supplied state.
The JSON schema documents this additive field.

The command catalog keeps its own 180-second validity and 60-second polling.
Referenced badges retain their owners' exact snapshot IDs, revisions, quality
and expiry (normally crew: 45 seconds; pipeline: 90 seconds). A badge can become
stale while its navigation destination stays available. Catalog expiry, failed
refresh, denied access and unfinished destinations still disable actions.

`presentation-state.mjs` rejects a future `generatedAt` uniformly as `unknown`
with `future_snapshot`. All four display adapters hide future payloads and
suppress their actions; badge-only future evidence does not disable a valid
catalog. `error` remains a freshness value; `blocked` remains orthogonal.

## Read owners and desktop packaging

Crew reads tasks through `getKanbanSnapshot(undefined, Infinity, { scope:
'local', localDbFile })`. The explicit local scope excludes remote configuration,
remote cache and SSH; all local tasks are counted before display truncation.
Only the crew projection's allowlisted fields leave the reader. Default Kanban
board callers retain their multi-source behavior and limits.

Deliverables calls `scanVaultDocs` with `fresh: true` and `inventory: true` for
its registered vault root. The scanner owns discovery and metadata. The shelf
retains unavailable paths, pins content with `readArtifactFile`, compares the
metadata revision with the content revision, and revalidates every detail read.
Concurrent metadata/content changes fail closed as `revision_mismatch`. Legacy
vault metadata callers retain their 60-second cache. File/path bounds, symlink
checks and coordinator acceptance receipts remain in force.

`lib/pt/stage-labels.json` owns stage labels, including `completed` →
**Build completed**. RevenuePipeline imports it; the pipeline package freezes
that exact map. `scripts/package-pipeline-desktop.mjs`,
`scripts/package-command-desktop.mjs`, and
`scripts/package-deliverables-desktop.mjs` refresh staged copies. Crew's
`crew-display.mjs` and all four `presentation-state.mjs` copies must match the
owner bytes; parity tests enforce this.

Desktop collector stdout remains a local presentation DTO consumed by QML,
not an HTTP `E<T>` source envelope. Its schema/revision markers identify its
source contract. Changing that DTO format, denied-payload retention across
features, and the remaining native theme-token gaps are outside Lane 07.
