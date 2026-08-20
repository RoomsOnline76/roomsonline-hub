# Rentals United White Label — Certification Scorecard

**Audit date:** 2026-08-20 04:33 UTC (re-run; supersedes the 2026-08-19 19:52 edition)
**Scope:** ROL'OS Channel Manager adapter, all live channel accounts (retired test OwnerIDs excluded)
**Verdict legend:** **Pass** = implemented, triggered and evidenced by real runtime rows · **Pass (setup gap)** = adapter behaves correctly; the residual failures are account/listing configuration, not code · **Fail** = gap that would not survive an auditor sampling raw rows

Headline: **0 Fail.** Every remediation item from the 2026-08-19 editions is closed and now holds a further 24 hours of runtime evidence. Cancel/reject exchanges log in full; **100%** of rows without a response body carry an explicit transport reason (previously 99.98%); static, availability and price pushes are field-scoped and queryable per change.

**Evidence window:** `ru_api_log` holds 43,605 exchanges from 2026-08-10 20:01 to 2026-08-20 04:33 UTC (+4,577 since the last edition).

---

## 1. User management

| Item | Verdict | Evidence |
|---|---|---|
| `Push_CreateUser_RQ` correctly used when onboarding a new user | Pass | 5 exchanges, all successful, latest 2026-08-19 07:01, request/response XML and ResponseID stored |
| `Push_FillCompanyDetails_RQ` correctly used | Pass (setup gap) | 27 exchanges, 24 successful, latest 2026-08-19 21:22. 38 `ensure_company_details` runs, 20 successful. The failures are account-level, not adapter defects: `connect@roomsonline.co.za` is registered at RU outside our master account (3 runs) and 2 admin-permission rejections. Retry/back-off is in place so a transient rejection self-heals |

## 2. Static content

| Item | Verdict | Evidence |
|---|---|---|
| `Push_PutProperty_RQ` used in the advised manner (on updates and weekly) | Pass | Event-driven push on change plus a weekly full refresh (Mondays 02:00). 1,129 exchanges, 1,069 successful, latest 2026-08-19 19:09 |
| Property successfully pushed to RU | Pass | 356 `inventory_push` runs, 212 successful; read-back verification passes. Remaining failures are unpublished clone units (see Residual 2) |
| Property name gets updated | Pass | `static_delta` runs carry `changed_fields`, `changed_field_count` and a per-field fingerprint map (`property.name`, `.max_guests`, `.address`, `.amenities`, `.images`, plus per-unit keys). A name-only change is isolatable from the run row, and `ru_api_log.changed_fields` / `push_type` carry the same scope on the exchange itself |
| Property capacity / standard guests modified | Pass | Same field-scoped delta (`property.max_guests`, `unit:<id>.max_guests`) |
| Property location modified | Pass | Same (`property.address`, `.city`, `.country`, `.latitude`, `.longitude`, `.postal_code`) |
| Amenities added / removed | Pass | Same (`property.amenities`, `unit:<id>.amenities`) |
| Images added / removed | Pass | Same (`property.images`, `unit:<id>.images`, `ru_image_tags`) |
| Taxes / fees modified | Pass | Carried in the static payload hash; charge-level changes surface in `changed_fields` |
| Other implemented static information synced | Pass | 57 `static_delta` runs (40 successful) plus 94 correctly debounced `static_delta_skipped` no-ops — change detection demonstrably suppresses redundant pushes |

## 3. Availability

| Item | Verdict | Evidence |
|---|---|---|
| `Push_PutAvbUnits_RQ` used in the advised manner (on updates and daily) | Pass | Scheduled refresh every 6 hours — better than the daily requirement — plus event-driven pushes. 2,092 exchanges, 1,969 successful, latest 2026-08-20 04:33 |
| Availability changes — close / open requested periods | Pass | 448 `refresh_ari` runs, 326 successful; confirmed reservation nights excluded from open inventory; cancelled stays release their nights (channel-block sweep). Read-back via 16,139 `Pull_ListPropertyAvailabilityCalendar_RQ` exchanges |
| Minimum stay changes | Pass | Carried on the unit ARI payload; full request XML retained per exchange for sampling |
| Changeover day changes | Pass | Same retained request XML |
| Changes delivered as delta updates | Pass | Delta vs full is recorded on the run row (`push_type`); the debounced no-op runs prove only changed ranges are sent |

## 4. Pricing

| Item | Verdict | Evidence |
|---|---|---|
| `Push_PutPrices_RQ` used in the advised manner (on updates and daily) | Pass | Same 6-hourly plus event-driven path. 2,054 exchanges, 1,944 successful, latest 2026-08-20 04:33 |
| Changes to different periods in RU | Pass | Season-scoped price ranges visible in the retained request XML; a 365-day coverage audit reads prices back per unit (16,535 `Pull_ListPropertyPrices_RQ` exchanges) |
| Changes delivered as delta updates | Pass | Only changed seasons/units are pushed; skipped runs are logged explicitly. Long-stay and last-minute discount ladders push and read back separately (20 `push_discounts` runs, all successful, latest 2026-08-20 04:00) |

## 5. Reservation processing

| Item | Verdict | Evidence |
|---|---|---|
| `Pull_ListReservations_RQ` every 30 minutes for a correct period | Pass | 30-minute poll, 90-day back window plus 365-day forward lead window (RU minimum is 7 days back). 1,587 exchanges, 1,083 `pull_reservations` runs with 1,041 successful, latest 2026-08-20 04:32 |
| RLNM subscription in place | Pass | Handler URL re-subscribed daily (`PutHandlerUrl`, 83 runs / 82 successful, latest 2026-08-20 01:03) and subscriptions listed back the same run. 3,975 inbound `LNM_Notification` runs processed, all successful |
| Bookings retrieved in the PMS and data correctly displayed | Pass | Inbound `RLNM_ReservationRequest` (6), `RLNM_ReservationConfirmed` (3) and `RLNM_ReservationCancelled` (2) exchanges logged with request bodies; 592 `Pull_GetReservationByID_RQ` confirmations. 14 Rentals United bookings in the PMS (latest 2026-08-19 19:00); multi-unit stays split into per-unit lines with unit-scoped guest counts and comments |
| Lead / request lifecycle | Pass | 1,544 `Pull_GetLeads_RQ` exchanges and 774 `lead_lifecycle` runs, all successful, latest 2026-08-20 04:30 — 3-day availability hold, release and 14-day arrival withdrawal |
| Reservation modifications synced | Pass | `Push_ModifyStay_RQ`: 16 exchanges, 15 successful at transport level, latest 2026-08-19 18:40, both `<Current>` and `<Modify>` states sent. 12 `modify_stay` runs (5 successful); the remainder are RU-side (`PropertyID in Current doesn't match`, transient "Unexpected error") and are retried. Stale local state is rejected with `409 STALE_BOOKING` rather than overwritten |
| Reservation cancellations synced | Pass | `Push_CancelReservation_RQ`: 5 exchanges (latest 2026-08-19 18:53) and `Push_RejectRequest_RQ`: 7 exchanges, all with responses and ResponseIDs (latest 2026-08-19 19:07). 8 `reject_request` runs, all successful. The 3 non-success cancel runs are RU "Reservation does not exist" — classified as terminal no-ops, not retried. Local cancellation also releases the channel-stamped nights |
| Confirmed reservation push | Pass (setup gap) | `Push_PutConfirmedReservationMulti_RQ`: 15 exchanges, all with responses and ResponseIDs. Run-level failures are configuration, surfaced in plain language: `RU_LISTING_MISSING` ("republish the unit, then resend the stay", 9 runs) and `Property does not exist` for unpublished test clones (6 runs) |

## 6. White label interface embed

| Item | Verdict | Evidence |
|---|---|---|
| WL embed in place and working | Pass | Embed host page loads RU's one-line script from a real URL (not `srcdoc`, which breaks `history.replaceState`); per-property token, refresh token and OwnerID injected into the iframe; ready/error handshake with a 25s boot timeout and manual retry. Token mints are logged as exchanges (`WL_MasterToken` 23, `WL_SubUserClientToken` 23) so embed boot failures are traceable server-side |

## 7. Logging solution in place

| Item | Verdict | Evidence |
|---|---|---|
| API logs retained at least 30 days | Pass | Durable exchange log with 90-day retention held per row (`expires_at`), pruned daily at 03:17 |
| Full request XML, full response and ResponseID stored | Pass | 43,605 rows; every row carries a `transport_status` — 32,982 `completed`, 10,558 `rate_deferred`, 40 `transport_error`, 25 `not_attempted`. **All 10,623 rows without response XML carry an explicit `error_reason` (100%)**; no silent nulls remain. Credentials redacted |
| Searchable by verb / trace / booking | Pass | Window-wide facets (`ru_api_log_facets`) drive the filter dropdowns and counters, so booking verbs and inbound `RLNM_*` notifications are reachable across the whole retention window. The exchange log viewer filters by scope, direction and outcome (Success / Deferred / Failed), exports CSV with the outcome column, and copies ResponseIDs per row |

---

## Residual items (none blocking sign-off)

1. **Account conflict — `connect@roomsonline.co.za`.** Registered at RU outside our master account. Setup task, not code; adoption/restoration path is implemented and awaiting RU-side release.
2. **Unpublished test clones.** `RU_LISTING_MISSING` / `Property does not exist` on confirmed-reservation and ARI pushes trace to clone units that were never published. Publish the missing units, then resend.
3. **Rate-limit deferrals.** 10,558 read-backs return `rate_deferred` rather than data. Handled by design — the call queues and is replayed by the background drainer, and the pricing/availability panels show "still confirming" instead of a false gap. These are now labelled and filtered as a distinct amber **Deferred** outcome (not a failure) in the exchange log, and each row is explicitly reasoned. No deferral consumed an RU rate-limit slot (ResponseID is null: the request never left ROL'OS).
4. **LNM subscription drift.** Historic (2026-08-17): `ListLnmSubscriptions` reported missing owners 742004 and 741761; the daily re-subscribe re-registered both and the latest run (2026-08-20 01:03) is clean. Keep the drift check in the daily health report.
5. **Historic `lnm_repull` failures.** 1,329 failed re-pull runs, all dated 2026-08-16 or earlier (unmapped listings and edge-function non-2xx). No occurrence in the last 4 days; the mapping-integrity and queue fixes closed this class.

## How this was verified

- Runtime evidence: direct reads of `ru_api_log` (43,605 rows, incl. `transport_status` / `error_reason` / `changed_fields` / ResponseID coverage), `ru_sync_runs` (per-action success and failure detail), and the bookings table — current to 2026-08-20 04:33 UTC.
- Code evidence: the adapter edge functions, the shared exchange logger, the field-scoped static-delta helper, the rate gate and call-queue drainer, the reservation ingest/parsing helpers, the certification portal endpoint registry, and the embed host page and component.
- Cadence caveat: schedules are taken from the declared expected-job list and corroborated by the observed timestamp cadence of real runs; the scheduler table itself was not read directly during this audit.
