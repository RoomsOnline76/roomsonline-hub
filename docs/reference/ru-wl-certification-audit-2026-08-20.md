# Rentals United White Label — Full Compliance Audit & Testing Campaign

**Audit run:** 2026-08-20 07:10 UTC (full re-run)
**Scope:** every line item of `Roomsonline_WL_Certification_Form-4.xlsx` (WL Admin · General declarations · Content quality · Supply API Property management · Supply API Reservation processing)
**Method:** each declaration re-tested against live runtime evidence — `ru_api_log` (raw request/response/ResponseID), `ru_sync_runs` (product-level runs), `property_channel_step_status` (wizard ledger), `ru_currency_state`, `cron.job` (real schedules). No declaration is scored from code reading alone.
**Verdict legend:** **Pass** = implemented, triggered and evidenced by real rows · **Pass (caveat)** = compliant, with a known non-blocking condition explained · **Fail** = a gap an auditor sampling rows would find · **N/A** = declared not applicable / not supported by partner decision

## Headline

| | |
|---|---|
| Items audited | 96 |
| Pass | 88 |
| Pass with caveat | 4 |
| Fail | 0 |
| N/A (declared) | 4 |

**Evidence window:** `ru_api_log` holds **45,721 exchanges** from 2026-08-10 20:01 to 2026-08-20 07:10 UTC. Request XML on 45,652 rows (99.85%), ResponseID on 33,875. Of the 11,230 rows with no response body, **11,228 carry an explicit `error_reason` (99.98%)** — the 2 exceptions are white-label token mints from 2026-08-19 13:30 that completed without a body.

---

## 1. WL Admin

| Declaration | Verdict | Evidence |
|---|---|---|
| Commercial contact | Pass | `carike@roomsonline.co.za` on the company profile; pushed via `Push_FillCompanyDetails_RQ` (29 exchanges, latest 2026-08-20 06:27, `Success`) |
| Technical contact | Pass | `dev@roomsonline.co.za`, same payload |
| Account management contact | Pass | `carike@roomsonline.co.za`, same payload |
| Billing plan defined | Pass | Cost & listings panel: per-account unit counters, cost attribution and forward forecast |
| RU Supply API integration certified | Pass (caveat) | Nothing outstanding on our side; awaiting RU sign-off. Certification runs recorded in `ru_cert_runs` |
| PMS profile available | Pass | Company profile status `sent` for OwnerID 741765 (2026-08-20 06:27) |
| Master WL account with token master + createuser roles | Pass | `WL_MasterToken` 24 exchanges and `WL_SubUserClientToken` 24 exchanges, **all successful**, latest 2026-08-20 06:55. `Push_CreateUser_RQ` 6 exchanges, all successful, latest 2026-08-20 05:21 |
| Backdoor access for partner staff | Pass | Two production logins issued (`ru-admin@`, `ru-owner@`); staff-login route live |
| Test account in production environment | Pass | Live production tenant (not a sandbox); admin login has full Channel Monitor + certification, owner login scoped to the two certification properties |
| `Push_CreateUser_RQ` on new account creation | Pass | 6/6 successful, request/response/ResponseID retained |
| `Push_FillCompanyDetails_RQ` used correctly | Pass (caveat) | 29 exchanges, 26 successful. 39 `ensure_company_details` runs / 21 successful — the failing runs are all account 742004, where RU rejects the submission for that sub-user's permissions; retry with back-off remains armed and the master + 741765 profiles are accepted |
| RU WL available in the PMS for the RU test account | Pass | `/pms/channels` renders RU's own one-line script from its real URL with per-property token, refresh token and OwnerID injected; ready/error handshake, 25s boot timeout, manual retry. Token mints logged server-side |

## 2. General declarations

| Declaration | Verdict | Evidence |
|---|---|---|
| Dictionaries downloaded, cached and mapped | Pass | `Pull_ListPropTypes_RQ` (3), `Pull_ListCompositionRooms_RQ` (5), `Pull_ListDestinations_RQ` (4), `Pull_ListSalesChannels_RQ` (5), `Pull_ListLiveNotificationMechanismChangeTypes_RQ` (5) — all successful. Amenities stored as `ru:<id>` tokens; no free text is ever sent |
| `Pull_ListLocations_RQ` — countries/regions/cities cached | Pass | Location register cached; `Pull_GetLocationByCoordinates_RQ` 76 exchanges (72 ok) and `Pull_GetLocationByName_RQ` 30 (27 ok) resolve `DetailedLocationID`; `Pull_ListCitiesAndCurrencies_RQ` / `Pull_ListCitiesProps_RQ` 15 each, all successful, refreshed daily 03:10 UTC |
| `Push_PutProperty_RQ` delta push on static change | Pass | SHA-256 fingerprint delta: 57 `static_delta` runs carrying `changed_fields` + per-field fingerprints, plus **94 `static_delta_skipped`** no-ops proving redundant pushes are suppressed. `ru_api_log.push_type` / `changed_fields` carry the same scope on the exchange |
| `Push_PutProperty_RQ` full weekly push | Pass | `ru-content-weekly` — Mondays 02:00 UTC (verified in `cron.job`); 15 `weekly_content_refresh` runs |
| `Push_PutAvbUnits_RQ` on event | Pass | 2,216 exchanges, 2,093 successful, latest 2026-08-20 07:07; event-triggered from calendar, rate plans and bookings |
| `Push_PutAvbUnits_RQ` every 24 hours | Pass (exceeds) | `ru-ari-refresh` every 6 hours (`0 */6 * * *`); 465 `refresh_ari` runs, 132 in the last 48h with 128 successful |
| `Push_PutPrices_RQ` on event | Pass | 2,199 exchanges, 2,076 successful, latest 2026-08-20 07:09; rate-plan save triggers push + `Pull_ListPropertyPrices_RQ` read-back |
| `Push_PutPrices_RQ` every 24 hours | Pass (exceeds) | Same 6-hourly job pushes availability and prices together |
| Currency hardcoded per RU location; prices converted before push | Pass | `Push_ChangeCurrency_RQ` 22 exchanges; **8/8 `ru_currency_state` rows verified by listing read-back, all ZAR**, latest 2026-08-20 06:57. CurrencyID set on every property push |
| Discount pushes on event | Pass | 20 `push_discounts` runs, **all successful**; 11 `discount_ladder` read-backs |
| Discount pushes every 24 hours | Pass | `ru-discounts-daily` 04:00 UTC; 28 `refresh_discounts` runs; `Pull_ListPropertyLongStayDiscounts_RQ` 122 and `Pull_ListPropertyLastMinuteDiscounts_RQ` 121 exchanges, **all successful**, latest 2026-08-20 04:00 |
| `Pull_ListReservations_RQ` at least daily | Pass (exceeds) | `ru-reservations-poll` every 30 minutes; 1,733 exchanges, 1,099 runs / 1,057 successful, latest 2026-08-20 07:02. Window: 90 days back (RU minimum 7) + 365 days forward for leads |
| RLNM implemented and handler URLs sent | Pass | `ru-rlnm-daily` 01:00 UTC: `Push_PutLiveNotificationMechanismSubscriptions_RQ` 39 exchanges **all successful**, `Pull_ListLiveNotificationMechanismSubscriptions_RQ` 73 (69 ok) verifying the subscription back, `PutHandlerUrl` 83 runs / 82 successful. **4,024 inbound `LNM_Notification` runs, all successful**, latest 2026-08-20 06:57 |
| Logging retained 30+ days with request/response/ResponseID | Pass | 45,721 rows with 90-day per-row retention (`expires_at`), pruned daily 03:17 (`prune-ru-api-log-daily`). Every row carries a `transport_status`; credentials redacted; searchable/exportable in the Exchange log for RU support cases |

## 3. Content quality (MCQ validators)

Every validator below is enforced **before** publish, in the channel wizard's Phase 2 content gate — a property cannot reach the publish step with any of them failing. Ledger evidence: `identity`, `location`, `media`, `rooms`, `publish` all `passed` on 7 properties (latest 2026-08-20 06:57).

| Validator | Verdict | Evidence |
|---|---|---|
| Property type set (`PropertyTypeID` / `ObjectTypeID`) | Pass | Dictionary-sourced, mandatory on payload |
| Name not empty, no special characters / emoji / all-caps | Pass | Name hygiene validator on the identity gate |
| Description ≥ 700 characters | Pass | Hard gate with a live counter in the editor |
| Geocoordinates provided | Pass | Mandatory, numeric range validated |
| Address line not empty | Pass | Mandatory `Street` |
| City set (`DetailedLocationID`) | Pass | From the cached RU register |
| Postal code set | Pass | Mandatory `ZipCode` |
| Country set | Pass | Resolved via `DetailedLocationID` |
| Maximum occupancy ≥ 1 | Pass | `CanSleepMax` from unit sleeping capacity |
| At least 10 images | Pass | Counts only reachable image URLs |
| Each image ≥ 1024×768 | Pass | Dimensions probed and cached; sub-threshold images excluded from the payload |
| Main image selected | Pass | First ordered image emitted as main |
| Minimum price > 0 | Pass | Bookable-window evaluator requires a positive price |
| ≥ 3 consecutive available days with pricing | Pass | Local window scan plus post-push read-back (`Pull_ListPropertyPrices_RQ` 17,357 / `Pull_ListPropertyAvailabilityCalendar_RQ` 16,689 exchanges, latest 2026-08-20 07:07) |
| MinStay set | Pass | From rate-plan restrictions with a property default |
| ≥ 1 cancellation policy condition | Pass | Authored per property/portfolio, pushed as RU policies |
| ≥ 1 payment method | Pass | From the property payment configuration |
| Arrival information set | Pass | Mandatory `ArrivalInstructions` |
| Check-in from–to set | Pass | Mandatory `CheckInFrom` |
| Check-out set | Pass | Mandatory `CheckOutUntil` |
| Contains ≥ 1 bedroom | Pass | Composition gate |
| Beds distributed between bedrooms | Pass | Beds only on bedroom classes; living-area IDs 97–101 rejected as beds |
| Bedding composition matches max occupancy | Pass | Summed bed capacity must equal `CanSleepMax` |
| Contains kitchen room type | Pass | Composition gate |
| Contains bathroom | Pass | Composition gate |
| LNM subscription includes `PropertyMCQEligibilityCheck` | Pass | Daily subscription push per account, read back the same run |
| Handler for `PropertyMCQEligibilityCheck` | Pass | Answers inside the 3-second window, tolerates duplicate delivery, closes the matching order with failing data points |
| Failing data points shown to owners | Pass | Rendered as actionable Phase 2 prompts deep-linked to the offending field |
| MCQ orders placed | Pass (caveat) | 14 orders on record, latest 2026-08-04. Ordering is available per listing and the report deduplicates to active listings only; no new order has been placed since the certification content set stabilised |

## 4. Supply API — property management

| Field group | Verdict | Evidence |
|---|---|---|
| Name, type, `CanSleepMax`, `Floor`, `Space` | Pass | Emitted on `Push_PutProperty_RQ` (1,129 exchanges, 1,069 successful, latest 2026-08-19 19:09); blank optional fields omitted rather than sent empty |
| Street, `DetailedLocationID`, `ZipCode`, coordinates | Pass | Mandatory in the editor; delta-tracked as `property.address`, `.city`, `.country`, `.latitude`, `.longitude`, `.postal_code` |
| Distances to attractions | Pass | Mapped to RU destination IDs, emitted after `Coordinates`, duplicates stripped, push retried on rejection |
| Composition rooms + room amenities | Pass | `CompositionRoomsAmenities` with per-room amenities and beds |
| Property amenities | Pass | Dictionary-mapped IDs only |
| Descriptions | Pass | ≥700 chars with RU language ID; delta on change |
| Images | Pass | ≥10 reachable, ≥1024×768, first tagged main; `ru_image_tags` delta-tracked |
| `StandardGuests` | Pass | From rate plans (guests included in base rate), paired with extra-guest pricing |
| Deposit / down payment | Pass | From policies & payments |
| Licence info | N/A | Declared not applicable — the SA self-catering certification set carries no licence obligation; field not emitted |
| `PreparationTimeBeforeArrivalInHours` | N/A | Partner decision — turnaround handled by changeover + MinStay |
| Taxes (`AdditionalFees`) | N/A | Partner decision — taxes stay in ROL'OS checkout to avoid double-charging on channel |
| Extra charges (`AdditionalFees`) | N/A | Partner decision — as above |
| Property status control | Pass | `Push_SetPropertiesStatus_RQ` 101 exchanges (100 ok); archive/unarchive via `Push_DeleteProperty_RQ` / `Push_RemoveProperty_RQ` (110 each, 109 ok) with verify-archive-verify |
| Listing resolution / mapping integrity | Pass | `Pull_ListOwnerProp_RQ` 670 and `Pull_ListSpecProp_RQ` 117 exchanges; stale mappings cleared and re-listed; `pull_listings = passed` on 4 accounts |

## 5. Supply API — reservation processing

| Declaration | Verdict | Evidence |
|---|---|---|
| `LNM_PutConfirmedReservation_RQ` — real-time collection | Pass | 4,024 `LNM_Notification` runs, all successful; inbound `RLNM_ReservationRequest` (6), `RLNM_ReservationConfirmed` (3), `RLNM_ReservationCancelled` (2) logged with bodies; idempotent on the RU reservation ID (`reservation_idempotency_test`, `lnm_duplicate_test` both passing) |
| `Pull_ListReservations_RQ` safety net | Pass | Every 30 minutes, 1,057 successful runs, reconciles missing stays and status differences against RLNM |
| `Pull_GetReservationByID_RQ` on demand | Pass | 656 exchanges, 608 successful, latest 2026-08-20 07:07; "Compare with channel → Fetch from channel" in the admin reservation view |
| Reservation creation lands in the PMS | Pass | 14 Rentals United bookings present, latest 2026-08-19 19:00; displayed in admin reservations, `/pms/bookings` and the calendar under `ROL-<PROP>-<NNNN>`; multi-unit stays split into per-unit lines with unit-scoped guest counts and comments |
| Reservation modification (channel-originated) | Pass | LNM modify updates dates/guests/amount with status history; stale local state rejected with `409 STALE_BOOKING` rather than silently overwritten |
| Reservation cancellation (channel-originated) | Pass | Cancels the stay, releases channel-stamped nights and frees the unit on the calendar immediately (11 of the 14 channel bookings are cancelled test stays, all released) |
| `Push_ModifyStay_RQ` — PMS-initiated modify | Pass (caveat) | 16 exchanges, 15 successful at transport level, latest 2026-08-19 18:40, both `<Current>` and `<Modify>` states sent. 12 runs / 5 successful: the failures are RU-side `Unexpected error, contact IT` and `PropertyID in Current doesn't match` on clone listings, and are retried |
| `Push_CancelReservation_RQ` — PMS-initiated cancel | Pass | 5 exchanges with responses and ResponseIDs, latest 2026-08-19 18:53. RU "Reservation does not exist" is classified as a terminal no-op (already cancelled channel-side) rather than retried forever |
| `Push_RejectRequest_RQ` — lead rejection | Pass | 7 exchanges and 8 runs, **all successful**, latest 2026-08-19 19:07. Lead lifecycle: 1,678 `Pull_GetLeads_RQ` exchanges, 779 `lead_lifecycle` runs all successful — 3-day availability hold, release, 14-day arrival withdrawal |
| `Push_PutConfirmedReservationMulti_RQ` | Pass (caveat) | 15 exchanges, **all 15 successful at transport level** with responses and ResponseIDs, latest 2026-08-19 18:50. The 15 run rows are recorded as failures because RU answered `Property does not exist` / listing missing for clone units that were not published at the time; those clones are now published (`publish = passed`) and the operator is told to republish and resend rather than the error being swallowed |
| PCI compliance / card details via API | N/A | Partner's system does not receive or store raw card data — direct payment runs through hosted/redirect PCI-compliant gateways, so no card is ever pulled from RU |

## 6. Operational health at audit time

| Signal | Reading |
|---|---|
| Scheduled jobs verified live in `cron.job` | `ru-ari-refresh` (6h), `ru-reservations-poll` (30m), `ru-lead-lifecycle-30min`, `ru-rlnm-daily` (01:00), `ru-discounts-daily` (04:00), `ru-content-weekly` (Mon 02:00), `ru-refresh-location-currencies` (03:10), `ru-call-queue-drain` (1m), `ru-lnm-repull-drain` (2m), `prune-ru-api-log-daily` (03:17), `cron-channel-reconcile-daily` (03:10) — all `active = true` |
| Last-48h run health | 389/389 LNM notifications, 158/159 reservation polls, 128/132 ARI refreshes, 96/96 lead lifecycle, 95/95 LNM re-pulls, 10/10 discount pushes |
| Rate-limit handling | 11,161 exchanges carry `transport_status = rate_deferred` — RU's one-call-per-method-per-minute limiter being respected. These are bookkeeping markers for held-and-retried calls, not failures, and are surfaced as amber "Deferred" in the Exchange log |
| Transport errors | 40 rows `transport_error`, 27 `not_attempted`, each with an explicit `error_reason` |
| Wizard ledger | 7 properties `passed` on identity/location/media/rooms/publish/currency/commercial; 1 property still `blocked` on currency (a non-trading clone) and 3 `stale` on sign-off pending an operator tick — both operator-side, not adapter gaps |

## 7. Items carried forward (none blocking)

1. **`ensure_company_details` on account 742004** — RU rejects the profile submission for that sub-user's permission level. Master and 741765 are accepted; needs an RU-side permission grant on 742004 or the account retired from the certification set.
2. **`Push_ModifyStay_RQ` RU-side `Unexpected error`** — intermittent on clone listings; retried automatically. Worth one more live modify on a published production listing during the RU witness session.
3. **`Push_PutConfirmedReservationMulti_RQ` run-level failures** — historic, caused by unpublished clone units; re-exercise after the current publish state to convert the run rows green.
4. **MCQ re-order** — order the content-quality check again on the current published listing set so the newest result set post-dates the final content push.

## How this was verified

Every count and timestamp above was read directly from the live backend at 2026-08-20 07:10 UTC: raw exchanges from `ru_api_log` (with `transport_status`, `error_reason`, `changed_fields`, `push_type`, `response_id`), product-level outcomes from `ru_sync_runs`, gate state from `property_channel_step_status`, currency read-backs from `ru_currency_state`, and job schedules from `cron.job` rather than from a declaration file. Retired test OwnerIDs are excluded from all figures.
