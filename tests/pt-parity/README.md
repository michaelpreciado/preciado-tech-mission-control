# PT OS v1 parity fixtures

Frozen contract revision: `pt-os.v1`. Fixed evaluation time: `2026-10-03T16:00:00.000Z`.

- `pipeline.json`: allowlisted excerpt of the workspace's authoritative `web-dev-pipeline/pipeline.json`, one record per available stage, followed by synthetic held, archived, duplicate and corrupt-record cases. Contact details, artifact paths and free-text content are omitted.
- `pipeline-cases.json`: indexes and expected evidence semantics for the appended cases. Pipeline projection/count implementation belongs to its next lane; Lane 00 does not claim those projections pass yet.
- `heartbeats.json`: fresh, exact five-minute boundary, stale, future, missing, failed refresh with retained evidence, and failed read with no snapshot. Future timestamps are unknown, never fresh. A working heartbeat reports presence; it does not prove an active worker run.
- `denied-auth.json`: untrusted client, unknown client, untrusted proxy chain, untrusted real-IP header, invalid cookie and wrong bearer. These contain only deliberately invalid fixture credentials. `/api/auth/check` retains its HTTP 200 status-query shape and returns `ok:false`; the private data handlers return 401.
- `envelopes.json`: empty successful read, fresh blocked evidence and failed denied read. `[]` is known empty; `null` is unavailable. Blocking does not change freshness.
- `manifest.json`: capture provenance, upstream source hash, exact fixture hashes and the fixed evaluation time. No real service credentials or session identifiers are captured.

All source/fact timestamps remain attached to their original evidence. Polling updates observation time, not evidence age. Failed refresh with retained usable data is stale; failure without usable data is error. Missing evidence or unresolved authority is unknown. Transport expiry is separate from source validity. Consumers must reject an incompatible contract revision.

The catalog has exactly four destinations: pipeline, crew, command and deliverables. Command and deliverables remain disabled until their portal pages are implemented. Legacy navigation/palette migration belongs to the command lane. Theme adapters import `lib/pt/theme.ts`; this lane does not apply a global restyle or fetch fonts.

Run from the staged checkout (Node 24.19+; each suite gets a separate process):

```bash
mkdir -p ../logs/lane-00/tmp
for suite in pt-parity pt-read-auth pt-bots-status bots-canonical flight-strip mission-api; do
  TMPDIR="$PWD/../logs/lane-00/tmp" node --test --test-isolation=none --import ./tests/helpers/ts-resolve.mjs "tests/$suite.test.mjs" || exit 1
done
python -B tests/pt-parity/validate-schema.py
npm run typecheck
```

The schema check requires Python `jsonschema` and explicitly enables date-time assertions using a standard-library zoned ISO timestamp checker. The local Python environment used for verification is documented in the Lane 00 report. The Node tests use fixture source readers and an isolated synthetic SQLite database; no live service calls are made. `--test-isolation=none` ensures this environment reports individual executed cases instead of only file-level subprocess summaries.


## Lane 02 crew parity

`crew.json` contains explicit classification expectations for confirmed/boundary workers, stale/future/missing task heartbeat, startedAt-only, missing run ID, fresh/stale/future reported presence, missing heartbeat, gateway-only, blocked-task, idle-SSE, and unavailable database cases. `crew-envelopes.json` freezes the corresponding E<T> responses plus denied-auth. Recreate only after an intentional projection change with `node --import ./tests/helpers/ts-resolve.mjs scripts/freeze-crew-fixtures.mjs`.

`tests/pt-crew.test.mjs` checks the server projection, actual MC presentation adapter, byte-identical desktop adapter and fixture CLI against the same expected classifications. It also tests retained/denied refreshes, idle SSE, read-only SQLite (550 synthetic tasks, so no display cap can influence counts), gateway-only discovery, missing/corrupt inputs, sensitive-field exclusion, no profile credential reads, curl argv/stdin handling, and malformed-snapshot rejection. `tests/pt-crew-auth.test.mjs` exercises the actual GET handler for denied, session, tailnet, and service-bearer access before collection.

Run each suite in its own Node process with `--test --test-isolation=none --import ./tests/helpers/ts-resolve.mjs`. Use a staged TMPDIR. The CLI/mock-curl tests require local child-process execution. `scripts/verify-crew-counts.mjs` freezes one evaluation time, reads the configured DB through the projection, and compares counts with an independent `sqlite3 -readonly` query. Both reads can observe natural live changes; the script reports a mismatch rather than hiding it.
