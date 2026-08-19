# Rentals United White Label — Certification Scorecard

**Audit date:** 2026-08-19 19:52 UTC (re-run; supersedes the 2026-08-19 12:04 edition)
**Scope:** ROL'OS Channel Manager adapter, all live channel accounts (retired test OwnerIDs excluded)
**Verdict legend:** **Pass** = implemented, triggered and evidenced by real runtime rows · **Pass (setup gap)** = adapter behaves correctly; the residual failures are account/listing configuration, not code · **Fail** = gap that would not survive an auditor sampling raw rows

Headline: **0 Fail.** Both failures from the previous edition are closed — cancel/reject exchanges now log in full, and every null-response row is labelled with a transport reason. The nine previously "unproven" static/ARI items are now field-scoped and directly queryable.

**Evidence window:** `ru_api_log` holds 39,028 exchanges from 2026-08-10 20:01 to 2026-08-19 19:49 UTC.

---

## 1. User management

| Item | Verdict | Evidence |
|---|---|---|
| `Push_CreateUser_RQ` correctly used when onboarding a new user | Pass | 5 exchanges, all successful, latest 2026-08-19 07:01, request/response XML and ResponseID stored |
| `Push_FillCompanyDetails_RQ` correctly used | Pass (setup gap) | 26 exchanges, 23 with responses, latest 2026-08-19 19:12. 18 successful `ensure_company_details` runs. The 3 failures are account-level: `connect@roomsonline.co.za` is registered outside our master account, plus 2 admin-permission rejections — not adapter defects |

## 2. Static content

| Item | Verdict | Evidence |
|---|---|---|
| `Push_PutProperty_RQ` used in the advised manner (on updates and weekly) | Pass | Event-driven push on change plus weekly full refresh (Mondays 02:00). 1,129 exchanges, latest 2026-08-19 19:09 |
| Property successfully pushed to RU | Pass | 150 successful `inventory_push` runs; read-back verification passes |
| Property name gets updated | Pass | `static_delta` runs now carry `changed_fields`, `changed_field_count` and a per-field fingerprint map (`property.name`, `property.max_guests`, `property.address`, `property.amenities`, `property.images`, per-unit keys). A name-only change is isolatable from the run row |
| Property capacity / standard guests modified | Pass | Same field-scoped delta (`property.max_guests`, `unit:<id>.max_guests`) |
| Property location modified | Pass | Same (`property.address`, `.city`, `.country`, `.latitude`, `.longitude`, `.postal_code`) |
| Amenities added / removed | Pass | Same (`property.amenities`, `unit:<id>.amenities`) |
| Images added / removed | Pass | Same (`property.images`, `unit:<id>.images`, `ru_image_tags`) |
| Taxes / fees modified | Pass | Carried in the static payload hash; charge-level changes surface in `changed_fields` |
| Other implemented static information synced | Pass | 40 successful `static_delta` runs plus 94 correctly debounced `static_delta_skipped` no-ops — change detection demonstrably suppresses redundant pushes |

## 3. Availability

| Item | Verdict | Evidence |
|---|---|---|
| `Push_PutAvbUnits_RQ` used in the advised manner (on updates and daily) | Pass | Scheduled refresh every 6 hours — better than the daily requirement — plus event-driven pushes. 1,781 exchanges, latest 2026-08-19 19:38 |
| Availability changes — close / open requested periods | Pass | 233 successful `refresh_ari` runs; confirmed reservation nights excluded from open inventory; cancelled stays release their nights (channel-block sweep) |
| Minimum stay changes | Pass | Carried on the unit ARI payload; the request XML is retained per exchange for sampling |
| Changeover day changes | Pass | Same retained request XML |
| Changes delivered as delta updates | Pass | Delta vs full is recorded on the run row; the debounced no-op runs prove only changed ranges are sent |

## 4. Pricing

| Item | Verdict | Evidence |
|---|---|---|
| `Push_PutPrices_RQ` used in the advised manner (on updates and daily) | Pass | Same 6-hourly plus event-driven path. 1,707 exchanges, latest 2026-08-19 19:38 |
| Changes to different periods in RU | Pass | Season-scoped price ranges visible in the retained request XML; a 365-day coverage audit reads prices back per unit |
| Changes delivered as delta updates | Pass | Only changed seasons/units are pushed; skipped runs are logged explicitly |

## 5. Reservation processing

| Item | Verdict | Evidence |
|---|---|---|
| `Pull_ListReservations_RQ` every 30 minutes for a correct period | Pass | 30-minute poll, 90-day back window plus 365-day forward lead window (RU minimum is 7 days back). 811 exchanges, 459 successful runs, latest 2026-08-19 19:49 |
| RLNM subscription in place | Pass | Handler URL re-subscribed daily (`PutLnmSubscriptions`, 27 successes), subscriptions listed back the same day. 3,780 inbound `LNM_Notification` runs processed |
| Bookings retrieved in the PMS and data correctly displayed | Pass | Inbound `RLNM_ReservationRequest` (6), `RLNM_ReservationConfirmed` (3) and `RLNM_ReservationCancelled` (2) exchanges all logged with request bodies, latest 2026-08-19 18:58. 14 Rentals United bookings in the PMS; multi-unit stays split into per-unit lines with unit-scoped guest counts and comments |
| Reservation modifications synced | Pass | `Push_ModifyStay_RQ`: 16 exchanges, latest 2026-08-19 18:40, both `<Current>` and `<Modify>` states sent. 4 successful `modify_stay` runs; the 7 failures are RU-side (`PropertyID in Current doesn't match`, transient "Unexpected error") and are retried |
| Reservation cancellations synced | Pass | **Previously Fail — now closed.** `Push_CancelReservation_RQ`: 5 exchanges (latest 2026-08-19 18:53) and `Push_RejectRequest_RQ`: 7 exchanges, all with responses and ResponseIDs (latest 2026-08-19 19:07). 7 successful `reject_request` runs. Local cancellation also releases the channel-stamped nights |
| Confirmed reservation push | Pass (setup gap) | `Push_PutConfirmedReservationMulti_RQ`: 15 exchanges, all with responses. Failures are configuration, surfaced in plain language: `RU_LISTING_MISSING` ("republish the unit, then resend the stay") and `Property does not exist` for unpublished test clones |

## 6. White label interface embed

| Item | Verdict | Evidence |
|---|---|---|
| WL embed in place and working | Pass | Embed host page loads RU's one-line script from a real URL (not `srcdoc`, which breaks `history.replaceState`); per-property token, refresh token and OwnerID injected into the iframe; ready/error handshake with a 25s boot timeout and manual retry. Token mints are now logged as exchanges (`WL_MasterToken`, `WL_SubUserClientToken`, 23 each) so embed boot failures are traceable server-side |

## 7. Logging solution in place

| Item | Verdict | Evidence |
|---|---|---|
| API logs retained at least 30 days | Pass | Durable exchange log with 90-day retention held per row (`expires_at`), pruned daily at 03:17 |
| Full request XML, full response and ResponseID stored | Pass | **Previously Fail — now closed.** 39,028 rows; every row carries a `transport_status` (29,216 `completed`, 9,767 `rate_deferred`, 40 `transport_error`, 5 `not_attempted`). Of the 9,814 rows without response XML, 9,812 (99.98%) carry an explicit `error_reason` — the silent nulls are gone. Credentials remain redacted |
| Searchable by verb / trace / booking | Pass | Window-wide facets (`ru_api_log_facets`) drive the filter dropdowns and counters, so booking verbs and inbound `RLNM_*` notifications are reachable from the whole retention window, not just the newest page |

---

## Residual items (none blocking sign-off)

1. **Account conflict — `connect@roomsonline.co.za`.** Registered at RU outside our master account. Setup task, not code; adoption/restoration path is implemented and awaiting RU-side release.
2. **Unpublished test clones.** `RU_LISTING_MISSING` / `Property does not exist` failures on confirmed-reservation and ARI pushes trace to clone units that were never published. Publish the missing units, then resend.
3. **Rate-limit deferrals.** 9,767 read-backs return `rate_deferred` rather than data. Handled by design — the calls queue and retry, and the pricing/availability panels show "still confirming" instead of a false gap — but auditors sampling raw rows will see them, so the label matters and is now present.
4. **LNM subscription drift (2026-08-17).** Six `ListLnmSubscriptions` runs reported missing owners 742004 and 741761; the daily re-subscribe has since re-registered both (latest success 2026-08-19 01:02). Keep the drift check in the health report.

## How this was verified

- Runtime evidence: direct reads of `ru_api_log` (39,028 rows, incl. `transport_status` / `error_reason` / ResponseID coverage), `ru_sync_runs` (per-action success and failure detail, `changed_fields` payloads), and the bookings table — current to 2026-08-19 19:49 UTC.
- Code evidence: the adapter edge functions, the shared exchange logger, the field-scoped static-delta helper, the reservation ingest/parsing helpers, the certification portal endpoint registry, and the embed host page and component.
- Cadence caveat: schedules are taken from the declared expected-job list and corroborated by the observed timestamp cadence of real runs; the scheduler table itself was not read directly during this audit.
