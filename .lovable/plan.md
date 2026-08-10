# RU certification gap: durable request/response/ResponseID logging (≥30 days)

Rentals United requires that every API exchange is retrievable for support cases: the full request XML, the full response, and the RU `ResponseID`, kept for at least 30 days.

## Current state (verified)

- Every outbound RU call funnels through one place: `callRentalsUnited()` in `supabase/functions/rentalsunited-api/index.ts` (single `fetch` at line 357). It does not persist anything — it only logs a 500-character sanitized preview to the function console.
- `ru_sync_runs` stores outcome metadata only: `action`, `success`, `error_code`, `error_message`, `http_status`, `elapsed_ms`, `details` JSONB. No request XML, no full response, no `ResponseID` column.
- `ResponseID` is parsed ad hoc in exactly one place (MCQ ordering) and only surfaced in a toast — never stored.
- Inbound notifications are durable (`ru_notifications.raw_xml`), so the inbound half is already covered.
- Two RU calls bypass the shared transport: `ru-close-user` and `ru-whitelabel-token` (white-label token/company endpoints).
- Function console logs are not a compliance answer: short retention and not queryable by ResponseID.

## What to build

### 1. Durable log table `ru_api_log`

One row per RU exchange, written by the transport layer:

- Correlation: `trace_id`, `parent_action` (calling function/trigger), `action` (RU verb, e.g. `Push_PutProperty_RQ`), `endpoint`
- Scope: `property_id`, `unit_id`, `ru_property_id`, `ru_owner_id`, `ru_user_id`
- Payloads: `request_xml`, `response_xml` (both full, credentials redacted), `request_bytes`, `response_bytes`
- Outcome: `response_id` (RU `ResponseID`), `status_id`, `status_message`, `http_status`, `success`, `elapsed_ms`, `error_message`
- Retention: `created_at`, plus `expires_at` default `now() + 90 days` (comfortably above the 30-day floor)

Indexes on `response_id`, `property_id`, `created_at desc`, and `action`. RLS: readable by admin / dev / `fearless_leader` only, full access to `service_role` (edge functions write it). Grants written in the same migration.

Credentials are always redacted before storage using the existing `sanitizeXmlForLogs()` (AccessKey / SecretKey / Password), and guest PII in reservation pulls stays as-is since it is required for support parity checks and the table is admin-only.

### 2. Shared logging transport

New `supabase/functions/_shared/ruApiLog.ts` with a `logRuExchange()` writer plus a `ResponseID` extractor. Wire it into:

- `callRentalsUnited()` in `rentalsunited-api` — logs every request/response pair, success or failure, including HTTP-level failures that currently throw before anything is recorded.
- `ru-close-user` and `ru-whitelabel-token` — the two callers that bypass the shared transport.

Context (`trace_id`, `parent_action`, property/unit/owner ids) is taken from the incoming request body so pushes, crons and certification runs are traceable end-to-end. Logging failures are swallowed — a log write must never break a push.

`ru_sync_runs.details` gains the `trace_id` and `response_id` so the existing run history links straight to the raw exchange.

### 3. Retention job

A daily cron (`cron-prune-ru-api-log`) deletes rows past `expires_at`. Retention is a table default so it can be raised without code changes.

### 4. Support UI — Channel console → Diagnostics tab

A fifth tab on `/admin/channel-monitor` (alongside Cost & listings, Accounts, Certification, Reservations):

- Filters: property, action, success/failure, date range, and a direct **ResponseID lookup** (the field RU support asks for)
- Result list: timestamp, action, property/unit, status ID + message, ResponseID, duration
- Row drill-in: side-by-side full request and response XML with copy buttons
- Export: download the selected exchange (or a filtered set) as a text/JSON bundle to attach to an RU support ticket

### 5. Certification register

Mark the logging row in `docs/reference/ru-wl-certification.md` as implemented, naming the table, the retention window and where support staff retrieve a ResponseID.

## Technical notes

- New table + grants + RLS + retention default: one migration.
- New edge function: `cron-prune-ru-api-log`. Modified: `rentalsunited-api`, `ru-close-user`, `ru-whitelabel-token`.
- New shared module: `_shared/ruApiLog.ts`.
- New UI: `src/components/admin/channel-monitor/RuApiLogPanel.tsx`, lazy-loaded into `AdminChannelMonitor.tsx`, with a `useRuApiLog` hook for querying/filtering.
- Payload size: RU property pushes can be large. Rows store full XML but the list view selects metadata only; full payloads load on drill-in.
