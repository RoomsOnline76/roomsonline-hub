# Channel certification remediation: cancel/reject logging, transport reasons, field-scoped deltas

Scope is limited to the channel-manager adapter and its logging. No changes to the calendar, booking flow, dashboards, the unified data model, or the existing successful push/pull paths and schedules.

## What the evidence actually shows (verified against live data)

- The durable exchange log holds 33,212 rows; 8,025 (24.2%) have no response XML and no ResponseID. Every one of those rows is an HTTP 429 row whose error message is `RU_RATE_DEFERRED: Channel rate limit ...` — i.e. the call was refused by our own pre-flight rate gate and **never left ROL'OS**. There is no missing-response mystery: the rows are legitimate "never sent" records that are indistinguishable from a real transport failure because there is no status field to say so.
- Cancel and reject exchanges: 0 rows in the exchange log. The outcome table does contain a successful `cancel_reservation` and `reject_request` — both dated 2026-08-04, which predates the exchange log's earliest row (2026-08-10). So the code path already funnels through the shared transport; what is missing is (a) fresh evidence and (b) any log row at all when the call aborts before the transport (missing sub-account keys, master-auth refusal), which is the realistic failure mode for these two verbs.
- Static-content deltas already compare a whole-snapshot SHA-256 fingerprint and record it in the run details, but only as a single hash. Nothing records *which* fields changed, so a name change cannot be distinguished from an image change in the audit trail.
- Company-details pushes have no retry: a single transient channel error leaves the account marked pending.

## Changes

### 1. Cancel / reject exchange evidence

- Keep both verbs on the shared transport (they already are) and add the missing pre-transport records: whenever a cancel/reject/modify aborts before the request is built (no sub-account keys, master-auth refusal, unresolved listing), write an exchange row with the intended action, no request XML, and a labelled reason instead of silently returning an error.
- Pass booking/property/owner context into the exchange row so a support case can be found by property or reservation, not just by timestamp.
- Link the outcome row and the exchange row through the trace id, as the other verbs already do.

### 2. Never leave a silent null response

Add two columns to the exchange log:

- `transport_status`: `completed` | `rate_deferred` | `transport_error` | `timeout` | `non_xml_response` | `empty_response` | `not_attempted`
- `error_reason`: short machine label with the human detail (already-redacted).

Rules enforced in the shared logger:

- A row either has a response + ResponseID, or a `transport_status` other than `completed` plus an `error_reason`.
- The existing 8,025 rate-gate rows are backfilled to `rate_deferred` so historical audit queries are clean.
- Responses that arrive but are not parseable XML, or are empty, get their own labels rather than falling into the same bucket as a network failure.
- Credential redaction is unchanged.

### 3. Field-scoped delta proof

- Static content: alongside the snapshot fingerprint, store a per-field hash map. The next delta diffs that map and records `changed_fields` (e.g. `["name","max_guests","location","amenities","images","taxes"]`), `push_type` (`delta` | `full`), and both the compared and stored fingerprints.
- Availability and price refreshes: record `changed_fields` for the ARI dimensions that moved (`availability`, `min_stay`, `changeover`, `prices`), the affected date range, and `push_type`.
- Both land on the run detail payload and are mirrored onto the exchange rows for the push, so an auditor can query "show me the delta triggered by a min-stay change" and get the request XML behind it.

### 4. Company-details reliability

- Up to 2 automatic retries with exponential back-off, limited to known transient channel error codes (rate limit, upstream 5xx, timeout). Hard rejections (bad credentials, validation) fail immediately as they do now.
- The final attempt count, outcome and error message are stored on the account row and surfaced in the certification console run log.

### 5. Verification before reporting done

- Query the exchange log for recent cancel and reject rows with full request XML, response XML and ResponseID (driven from a real reservation in the test sub-account).
- Assert no row anywhere has a null response together with `transport_status = 'completed'`.
- Confirm `changed_fields` / `push_type` appear on a static push triggered by a single field edit, and on an availability and a price refresh.
- Re-run the certification scorecard document and update the affected rows.

## Technical notes

- Migration: add `transport_status`, `error_reason`, `changed_fields`, `push_type`, `fingerprint` to `ru_api_log` (+ index on `transport_status`), and backfill the 429 rows. Retention default (`expires_at`, 90 days) untouched.
- Shared logger `supabase/functions/_shared/ruApiLog.ts` gains the new fields plus a `logRuNotAttempted()` helper for pre-transport aborts.
- Touched functions: `rentalsunited-api` (transport, cancel/reject/modify handlers, `fill_company_details` retry), `_shared/ruBookingSync.ts` (context + pre-transport logging), `_shared/ruStaticDelta.ts` (per-field hash map + `changed_fields`), `push-property-to-ru` / `ru-ari-delta` (ARI + price `changed_fields`, `push_type`).
- Console: the diagnostics panel filter set gains `transport_status` and shows `changed_fields` / `push_type` on a row drill-in.
- Commits reference "RU cert: cancel/reject logging + transport reason + field-scoped delta".
