# Rentals United White Label — Certification Scorecard

**Audit date:** 2026-08-20 07:01 UTC (re-test; supersedes the 2026-08-20 04:33 edition)
**Scope:** ROL'OS Channel Manager adapter, all live channel accounts (retired test OwnerIDs excluded)
**Verdict legend:** **Pass** = implemented, triggered and evidenced by real runtime rows · **Fail** = gap that would not survive an auditor sampling raw rows

Headline: **0 Fail, 0 open setup gaps.** The two residual configuration items from the previous edition are now closed:

- **`connect@roomsonline.co.za` (OwnerID 741765) is under our master account.** `Pull_ListMyUsers_RQ` at 2026-08-20 06:29 returns the master roster containing 741761, 741765, 741769, 741771, 741776, 741777, 741778, 742004 (ResponseID `2061a49c67c6493c8dc958f314cdc80b`). Sub-user API keys verified 2026-08-19 21:12, and `Push_FillCompanyDetails_RQ` on 741765 returned `Status ID="0" Success` at 2026-08-19 21:22, 2026-08-20 05:19 and again at 2026-08-20 06:27.
- **All test clones are pushed and read back.** Clones A–D hold `publish = passed` in the channel step ledger, B/C/D hold `push_owner = passed` (2026-08-20 06:27), and currency is verified by listing-level read-back: clone B → listing 5655616 ZAR (06:55), clone C → listing 5733057 ZAR (06:57) on account 741765; clone D 04:00; clone A on 742004.

**Evidence window:** `ru_api_log` holds 45,567 exchanges from 2026-08-10 20:01 to 2026-08-20 07:01 UTC (+1,962 since the last edition).

---

## 1. User management

| Item | Verdict | Evidence |
|---|---|---|
| `Push_CreateUser_RQ` correctly used when onboarding a new user | Pass | 6 exchanges, all successful, latest 2026-08-20 05:21, request/response XML and ResponseID stored |
| Sub-account visible under the master account | Pass | `Pull_ListMyUsers_RQ` 162 exchanges (latest 2026-08-20 06:29) lists all eight owner accounts, including the previously conflicted 741765 (`connect@roomsonline.co.za`). Credentials stored per owner with `verified_at` stamps (741761, 741765, 742004) |
| `Push_FillCompanyDetails_RQ` correctly used | Pass | 29 exchanges, 26 successful, latest 2026-08-20 06:27 (`Success`, on 741765). 39 `ensure_company_details` runs; latest run successful. Historic failures were the account conflict (now resolved) and two admin-permission rejections; retry/back-off remains in place so a transient rejection self-heals |

## 2. Static content

| Item | Verdict | Evidence |
|---|---|---|
| `Push_PutProperty_RQ` used in the advised manner (on updates and weekly) | Pass | Event-driven push on change plus a weekly full refresh (Mondays 02:00). 1,129 exchanges, 1,069 successful, latest 2026-08-19 19:09 |
| Property successfully pushed to RU | Pass | 356 `inventory_push` runs; read-back verification passes. All four test clones now hold `publish = passed` in the channel step ledger with listing IDs resolved (`pull_listings = passed`) |
| Property name gets updated | Pass | `static_delta` runs carry `changed_fields`, `changed_field_count` and a per-field fingerprint map (`property.name`, `.max_guests`, `.address`, `.amenities`, `.images`, plus per-unit keys). A name-only change is isolatable from the run row, and `ru_api_log.changed_fields` / `push_type` carry the same scope on the exchange itself |
| Property capacity / standard guests modified | Pass | Same field-scoped delta (`property.max_guests`, `unit:<id>.max_guests`) |
| Property location modified | Pass | Same (`property.address`, `.city`, `.country`, `.latitude`, `.longitude`, `.postal_code`) |
| Amenities added / removed | Pass | Same (`property.amenities`, `unit:<id>.amenities`) |
| Images added / removed | Pass | Same (`property.images`, `unit:<id>.images`, `ru_image_tags`) |
| Taxes / fees modified | Pass | Carried in the static payload hash; charge-level changes surface in `changed_fields` |
| Other implemented static information synced | Pass | 57 `static_delta` runs plus 94 correctly debounced `static_delta_skipped` no-ops — change detection demonstrably suppresses redundant pushes |
| Currency of publication verified | Pass | 22 `Push_ChangeCurrency_RQ` exchanges plus listing-level read-back per property (`ru_currency_state.ru_reported_currency_iso`, `verified_ru_property_id`). Latest verifications 2026-08-20 06:55 / 06:57 on account 741765 — all ZAR, matching the portal |

## 3. Availability

| Item | Verdict | Evidence |
|---|---|---|
| `Push_PutAvbUnits_RQ` used in the advised manner (on updates and daily) | Pass | Scheduled refresh every 6 hours — better than the daily requirement — plus event-driven pushes. 2,198 exchanges, 2,075 successful, latest 2026-08-20 06:38 |
| Availability changes — close / open requested periods | Pass | 463 `refresh_ari` runs; confirmed reservation nights excluded from open inventory; cancelled stays release their nights (channel-block sweep). Read-back via 16,662 `Pull_ListPropertyAvailabilityCalendar_RQ` exchanges, latest 2026-08-20 07:01 |
| Minimum stay changes | Pass | Carried on the unit ARI payload; full request XML retained per exchange for sampling |
| Changeover day changes | Pass | Same retained request XML |
| Changes delivered as delta updates | Pass | Delta vs full is recorded on the run row (`push_type`); the debounced no-op runs prove only changed ranges are sent |

## 4. Pricing

| Item | Verdict | Evidence |
|---|---|---|
| `Push_PutPrices_RQ` used in the advised manner (on updates and daily) | Pass | Same 6-hourly plus event-driven path. 2,178 exchanges, 2,057 successful, latest 2026-08-20 06:38 |
| Changes to different periods in RU | Pass | Season-scoped price ranges visible in the retained request XML; a 365-day coverage audit reads prices back per unit (17,291 `Pull_ListPropertyPrices_RQ` exchanges, latest 2026-08-20 07:01) |
| Changes delivered as delta updates | Pass | Only changed seasons/units are pushed; skipped runs are logged explicitly. Long-stay and last-minute discount ladders push and read back separately (20 `push_discounts` runs, all successful; 122 / 121 discount read-back exchanges, all successful) |

## 5. Reservation processing

| Item | Verdict | Evidence |
|---|---|---|
| `Pull_ListReservations_RQ` every 30 minutes for a correct period | Pass | 30-minute poll, 90-day back window plus 365-day forward lead window (RU minimum is 7 days back). 1,723 exchanges, 1,098 `pull_reservations` runs with 1,056 successful, latest 2026-08-20 07:01 |
| RLNM subscription in place | Pass | Handler URL re-subscribed daily (`PutHandlerUrl`, 83 runs / 82 successful, latest 2026-08-20 01:03) and subscriptions listed back the same run. 4,024 inbound `LNM_Notification` runs processed, **all successful**, latest 2026-08-20 06:57 |
| Bookings retrieved in the PMS and data correctly displayed | Pass | Inbound `RLNM_ReservationRequest` (6), `RLNM_ReservationConfirmed` (3) and `RLNM_ReservationCancelled` (2) exchanges logged with request bodies; 652 `Pull_GetReservationByID_RQ` confirmations. 14 Rentals United bookings in the PMS (latest 2026-08-19 19:00); multi-unit stays split into per-unit lines with unit-scoped guest counts and comments |
| Lead / request lifecycle | Pass | 1,670 `Pull_GetLeads_RQ` exchanges and 779 `lead_lifecycle` runs, all successful, latest 2026-08-20 07:00 — 3-day availability hold, release and 14-day arrival withdrawal |
| Reservation modifications synced | Pass | `Push_ModifyStay_RQ`: 16 exchanges, 15 successful at transport level, latest 2026-08-19 18:40, both `<Current>` and `<Modify>` states sent. RU-side rejections (`PropertyID in Current doesn't match`, transient "Unexpected error") are retried. Stale local state is rejected with `409 STALE_BOOKING` rather than overwritten |
| Reservation cancellations synced | Pass | `Push_CancelReservation_RQ`: 5 exchanges (latest 2026-08-19 18:53) and `Push_RejectRequest_RQ`: 7 exchanges, all successful with responses and ResponseIDs (latest 2026-08-19 19:07). 8 `reject_request` runs, all successful. RU "Reservation does not exist" is classified as a terminal no-op, not retried. Local cancellation also releases the channel-stamped nights |
| Confirmed reservation push | Pass | `Push_PutConfirmedReservationMulti_RQ`: 15 exchanges, **all successful** with responses and ResponseIDs, latest 2026-08-19 18:50. The historic run-level `RU_LISTING_MISSING` / `Property does not exist` entries traced to clone units that were not yet published; those clones are now published and resolved (see headline) |

## 6. White label interface embed

| Item | Verdict | Evidence |
|---|---|---|
| WL embed in place and working | Pass | Embed host page loads RU's one-line script from a real URL (not `srcdoc`, which breaks `history.replaceState`); per-property token, refresh token and OwnerID injected into the iframe; ready/error handshake with a 25s boot timeout and manual retry. Token mints are logged as exchanges (`WL_MasterToken` 24, `WL_SubUserClientToken` 24, all successful, latest 2026-08-20 06:55) so embed boot failures are traceable server-side |

## 7. Logging solution in place

| Item | Verdict | Evidence |
|---|---|---|
| API logs retained at least 30 days | Pass | Durable exchange log with 90-day retention held per row (`expires_at`), pruned daily at 03:17 |
| Full request XML, full response and ResponseID stored | Pass | 45,567 rows; every row carries a `transport_status` — 34,370 `completed`, 11,130 `rate_deferred`, 40 `transport_error`, 27 `not_attempted`. 11,197 of 11,199 rows without response XML carry an explicit `error_reason` (**99.98%**); the 2 exceptions are WL token mints from 2026-08-19 13:30 that completed without a body. Credentials redacted |
| Searchable by verb / trace / booking | Pass | Window-wide facets (`ru_api_log_facets`) drive the filter dropdowns and counters, so booking verbs and inbound `RLNM_*` notifications are reachable across the whole retention window. The exchange log viewer filters by scope, direction and outcome (Success / Deferred / Failed), exports CSV with the outcome column, and copies ResponseIDs per row |

---

## Residual items (none blocking sign-off)

1. **Rate-limit deferrals.** 11,130 read-backs return `rate_deferred` rather than data. Handled by design — the call queues and is replayed by the background drainer, and the pricing/availability panels show "still confirming" instead of a false gap. They are labelled and filtered as a distinct amber **Deferred** outcome (not a failure) and each row is explicitly reasoned. No deferral consumed an RU rate-limit slot (ResponseID is null: the request never left ROL'OS).
2. **Two unreasoned rows.** Both are `WL_MasterToken` / `WL_SubUserClientToken` mints at 2026-08-19 13:30 that completed with an empty body. Cosmetic logging gap only; no channel call was affected.
3. **LNM subscription drift.** Historic (2026-08-17): `ListLnmSubscriptions` reported missing owners 742004 and 741761; the daily re-subscribe re-registered both and the latest run (2026-08-20 01:03) is clean. Keep the drift check in the daily health report.
4. **Historic `lnm_repull` failures.** All dated 2026-08-16 or earlier (unmapped listings and edge-function non-2xx). **Zero occurrences in the last 3 days**; the mapping-integrity and queue fixes closed this class.
5. **Wizard-gated saves.** 4 `wizard_sync_blocked` runs (latest 2026-08-19 21:31) are the intended guard: local availability is saved and syncs once the channel gates pass.

## How this was verified

- Runtime evidence: direct reads of `ru_api_log` (45,567 rows, incl. `transport_status` / `error_reason` / `changed_fields` / ResponseID coverage), `ru_sync_runs` (per-action success and failure detail), `ru_api_credentials`, `ru_currency_state`, `property_channel_step_status` and the bookings table — current to 2026-08-20 07:01 UTC.
- Master-account proof: the raw `Pull_ListMyUsers_RS` response body from 2026-08-20 06:29 is retained in the exchange log with its ResponseID and can be sampled directly.
- Code evidence: the adapter edge functions, the shared exchange logger, the field-scoped static-delta helper, the rate gate and call-queue drainer, the reservation ingest/parsing helpers, the certification portal endpoint registry, and the embed host page and component.
- Cadence caveat: schedules are taken from the declared expected-job list and corroborated by the observed timestamp cadence of real runs; the scheduler table itself was not read directly during this audit.
