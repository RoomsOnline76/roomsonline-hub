# Rentals United adapter: full endpoint compliance audit + regression sweep

## Goal

Two deliverables:

1. A written compliance matrix covering every channel endpoint we implement, checked line-by-line against the current published documentation (PMS section, Put Last-Minute Discounts, Put Long-Stay Discounts, User Management, plus the property/ARI/booking/dictionary sections our registry covers).
2. Fixes for every non-compliance found, prioritised so regressions ("worked before, broken now") go first.

## What is already known (verified in code this turn)

- All channel XML is built in `supabase/functions/rentalsunited-api/index.ts` (5,062 lines) plus `supabase/functions/ru-close-user/index.ts`; nothing in `src/` builds XML.
- `src/config/ruEndpointLibrary.ts` registers ~60 endpoints in 7 families (account, content, ARI, discounts, bookings, dictionary, notifications) — that registry is the audit checklist.
- Long-stay push emits `<LongStays PropertyID>` / `<LongStay DateFrom DateTo Bigger [Smaller]>PERCENT`; last-minute push emits `<LastMinutes>` / `<LastMinute DateFrom DateTo DaysToArrivalFrom [DaysToArrivalTo]>PERCENT`.
- Read-back uses `Pull_ListPropertyLongStayDiscounts_RQ` / `Pull_ListPropertyLastMinuteDiscounts_RQ`, while the registry also lists the account-wide `Pull_List*Discounts_RQ` variants — one of the pairs may be unimplemented or misnamed; to be confirmed against the docs.
- `Push_CreateUser_RQ` currently sends name/email/password as direct root children, caps names at 50, and emits optional `PMSId`.

No root cause for any current breakage has been confirmed yet — diagnosing is step 1 of the work, not an assumption in this plan.

## Phase 1 — Evidence gathering (read-only)

1. Fetch each documentation section and extract, per endpoint: root element, auth block shape, mandatory vs optional elements, exact element order, attribute names, field types/lengths, and documented response shape + status ids.
2. Enumerate our side per endpoint: builder function, parser, calling action, callers (edge functions, crons, UI), and whether the response passes through the shared status validator.
3. Pull the recent live evidence from the API log (`ru_api_log`): group by method and channel status id over the last 30 days to rank actual failure surfaces. This is what separates "documented deviation" from "currently broken in production".

## Phase 2 — Compliance matrix

One row per endpoint with: implemented? / request shape matches / element order matches / field limits enforced / response parsed per spec / status handling / credential scope (master vs child) / recent live outcome / verdict (`compliant`, `deviation`, `broken`, `not implemented`).

Verdict severities:

- **S1 broken** — endpoint currently rejected by the channel or writing to the wrong identity.
- **S2 deviation** — shape/order/limit differs from docs but the channel still accepts it (latent risk).
- **S3 gap** — registered but unimplemented, or implemented with no response validation.

## Phase 3 — Fixes

Fix in severity order, smallest change per endpoint, each verified against a live sub-account where non-destructive:

- Request-shape corrections (element order, attribute names, missing mandatory/optional fields, string-length caps).
- Response parsing corrections (documented response fields only; no reliance on fields the spec does not return).
- Status handling: every write routed through the shared status validator, signed status ids, documented `-n` codes mapped to specific outcome codes instead of generic failures.
- Credential scope: confirm every child-scoped method authenticates as the sub-account and cannot fall back to master.
- Discount endpoints specifically: confirm percentage range, inclusive threshold semantics, open-ended tier handling (omitted `Smaller` / `DaysToArrivalTo`), overlap rules, and that push and read-back use the documented method pair.
- User management specifically: create / archive / owner details / company details / currency / API-key methods — request shape, roles required, and the identity each one applies to.

Anything under adapter lock (`.lovable/ADAPTER_LOCKS.md`) is listed with its diff scope before the change and only touched with explicit go-ahead in the approving message.

## Phase 4 — Verification

- Non-destructive live calls per fixed endpoint against a test sub-account, recording request, credential mode, HTTP status and channel status id.
- Negative cases: missing mandatory field, over-long field, master pair on a child-scoped write, overlapping discount tiers.
- Destructive calls (create/archive sub-account) only against a disposable test account, confirmed with you before firing.

## Deliverable

`docs/verification/ru-endpoint-compliance-audit-2026-08-28.md` — the full matrix, per-endpoint findings with before/after shape, the fixes shipped, the pass/fail evidence table, and residual risks (including anything the channel itself blocks, such as API-key creation on accounts without the role enabled).

## Technical notes

- Audit surface: `rentalsunited-api/index.ts`, `ru-close-user/index.ts`, `ru-cert-portal/index.ts`, `push-property-to-ru/index.ts`, `_shared/ru*.ts`, the `cron-*ru*` jobs, and `src/config/ruEndpointLibrary.ts`.
- No schema changes expected. Any adapter edit requires redeploying the affected edge functions.
- Wire format stays snake_case at the function boundary; XML shape changes stay inside the builders.
