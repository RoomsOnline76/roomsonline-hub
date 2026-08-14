# White-Label Certification — completion record

Source form: `Roomsonline_WL_Certification_Form-3.xlsx` (6 sheets: WL Admin, General declarations,
Content quality, Supply API Property management, Supply API Reservation processing, Status).

This document restates every declaration against **the current code base and live data**, so each row
is either confirmed, corrected, or listed as an open action. Evidence counts were read from
`ru_sync_runs`, `ru_cert_runs`, `ru_api_log`, `ru_mcq_orders` and the registered scheduled jobs on
**14 Aug 2026 15:xx UTC**.

Certification properties: **SEESIG Self Catering CHALETS** and **Tidal Pools Self Catering Apartments**
(sub-account OwnerID 741765).

---

## 1. Actions still to complete

| # | Item | Sheet / row | State | What must happen |
|---|---|---|---|---|
| 1 | Distances to attractions declared "not supported (Partner decision)" | Supply API Property management → `Property/Distances` | **Form is stale — code now supports it** | Change the declaration to **fully supported**. Gate 10 is live: `_shared/ruDistances.ts` maps `local_experiences` to the channel destination dictionary, `push-property-to-ru` attaches `distances` to every unit payload, and `rentalsunited-api` emits `<Distances>` after `<Coordinates>` with duplicate-stripping retry. |
| 2 | Discounts pushed every 24 h | General declarations → `Push_PutLongStayDiscounts_RQ` / `Push_PutLastMinuteDiscounts_RQ` | **Gap** — no scheduled job registered; only 2 `refresh_discounts` runs and 7 `discount_ladder` runs exist | Register a daily job for `cron-refresh-ru-discounts` (proposed 02:40 UTC). Event-triggered discount pushes already work; only the daily cadence claim is unproven. |
| 3 | Cadence wording (ARI / content / RLNM) | General declarations | **Correct the wording** | Actual registered schedules: ARI `ru-ari-refresh` every 6 h (`0 */6 * * *`), full content `ru-content-weekly` Mondays 02:00 UTC, RLNM `ru-rlnm-daily` 01:00 UTC, reservations `ru-reservations-poll` every 30 min, lead lifecycle every 30 min, log prune 03:17 UTC. All meet or beat the requirement — the form should quote these values. |
| 4 | Minimum content-quality check (MCQ / LNM) | Content quality (onboarding prerequisite) | **Gap** — 14 orders, all failed; nothing ordered since 4 Aug | Re-order against real listing IDs (previous failures: status 280 before the LNM subscription existed, 219 invalid ChannelId, 56 property does not exist — the last two were ordered against OwnerID 741765 instead of a listing ID). LNM subscription and handler are now live, so re-order for the SEESIG and Tidal Pools listings and capture a passing result. |
| 5 | RU Supply API integration is certified | WL Admin | **Awaiting RU** | Nothing on our side: 36 passed certification runs (latest 12 Aug 18:52 UTC) and the evidence bundle are ready for RU sign-off. |
| 6 | Test-account credentials | WL Admin | **Administrative** | `ru-admin@roomsonline.co.za` (full admin) and `ru-owner@roomsonline.co.za` (owner of the two certification properties) exist; passwords are issued to RU by e-mail, never in this document. |
| 7 | Historic failed certification runs | WL Admin → Certification | **Informational** | 17 failed runs remain in history (latest 10 Aug 12:00 UTC), all superseded by the 36 passed runs. Keep them — RU asks for the full log — but note them as pre-fix in the evidence bundle. |

Deliberate non-support (no action, declared as Partner decision):
`PreparationTimeBeforeArrivalInHours` (turnaround handled by changeover + MinStay), `AdditionalFees`
for taxes and extra charges (collected in ROL'OS checkout to avoid double-charging),
`LateArrivalFees` / `EarlyDepartureFees` (ops note or local charge), `LicenceInfo` (not applicable to
the SA self-catering set), and PCI card retrieval (no raw card data is ever received or stored — all
payments run through hosted/redirect PCI-DSS gateways).

---

## 2. WL Admin

| Row | Declaration | Verify in ROL'OS |
|---|---|---|
| Commercial / technical / account-management contacts | fully supported | Admin → Channel monitor → Accounts → company profile contacts |
| Billing plan defined | fully supported | Admin → Channel monitor → Cost & listings (cost attribution, forecast, unit counters) |
| Supply API certified | **awaiting RU** | Admin → Certification → Runs & milestones (36 passed / 17 historic failed) |
| PMS profile available | fully supported | Accounts → company profile `sent` for OwnerID 741765 via `Push_FillCompanyDetails_RQ` |
| Master WL account with token + createuser roles | fully supported | Accounts → master WL token + Create sub-user; Certification → Users |
| Backdoor access for Partner staff | fully supported | `https://sleepinafrica.roomsonline.co.za/staff-login?portfolio=jongensfontein` |
| Test account in production | fully supported | `https://sleepinafrica.roomsonline.co.za` — admin and owner logins above |
| `Push_CreateUser_RQ` | fully supported | Certification → Users → Create user, or property Integrations → Phase 1 |
| `Push_FillCompanyDetails_RQ` | fully supported | Accounts → company profile `sent`; Phase 1 Restart re-sends |
| WL embed available for the RU test account | fully supported | Owner → `/pms/channels` — embed rendered with a server-side WL token |

## 3. General declarations

| Declaration | Status | Evidence (live) |
|---|---|---|
| Dictionary methods cached and mapped | fully supported | Dictionary sync in Admin → integrations; amenities stored as `ru:<id>` tokens |
| `Pull_ListLocations_RQ` cached | fully supported | Location register drives the property Identity & Location picker |
| `Push_PutProperty_RQ` differential push on change | fully supported | SHA-256 fingerprint delta; **53** `static_delta` runs, latest 14 Aug 13:40 UTC; 5 `static_delta_skipped` (no diff) |
| `Push_PutProperty_RQ` full weekly push | fully supported | `ru-content-weekly`, Mondays 02:00 UTC; **8** `weekly_content_refresh` runs |
| `Push_PutAvbUnits_RQ` on event | fully supported | **235** `inventory_push` runs with read-back verification |
| `Push_PutAvbUnits_RQ` every 24 h | fully supported (better) | `ru-ari-refresh` every 6 h; **257** `refresh_ari` runs |
| `Push_PutPrices_RQ` on event / daily | fully supported | Same delta and refresh paths; prices and availability refresh together |
| Currency correctness | fully supported | `CurrencyID` on every push, FX conversion when the channel location currency differs; gated before Phase 4 |
| Discounts on event | fully supported | **7** `discount_ladder` runs (push + ladder read-back) |
| Discounts every 24 h | **open — action 2** | `cron-refresh-ru-discounts` exists but is not scheduled |
| `Pull_ListReservations_RQ` at least daily | fully supported | Every 30 min; **775** `pull_reservations` runs |
| RLNM handler URLs + subscriptions | fully supported | `ru-rlnm-daily` 01:00 UTC: **51** `PutHandlerUrl`, **40** `PutLnmSubscriptions`, **40** `ListLnmSubscriptions`; **1 227** inbound `LNM_Notification`, **989** `lnm_repull` |
| 30-day request/response/ResponseID log | fully supported (exceeds) | `ru_api_log`: **14 969** entries with full XML and ResponseID, 90-day retention, pruned daily 03:17 UTC, searchable in Diagnostics |

Rate-limit compliance (added after the form was issued): every outbound call passes through the
shared sliding-window gate (`_shared/ruRateGate.ts` + `ru_claim_rate_slot`), so the channel's
one-request-per-method-per-minute limit cannot be breached by concurrent crons; deferred calls answer
`429 RU_RATE_DEFERRED` and retry with 20–70 s backoff.

## 4. Content quality — all 24 validators

Every validator is enforced in `_shared/ruReadiness.ts`, which is read identically by the owner
scorecard, the certification console and the live push gate, so a listing cannot be published while a
mandatory validator fails.

| Validator | Enforcement | Where it surfaces |
|---|---|---|
| Property type set | Mandatory `PropertyTypeID` / `ObjectTypeID` from the dictionary | Phase 2 → Property type |
| Name not empty, no emoji/specials, not ALL CAPS | Name hygiene validator | Phase 2 → Name hygiene (`name_hygiene` evidence) |
| Description ≥ 700 characters | Hard gate with live counter in the editor | Phase 2 → Description length |
| Coordinates provided | Mandatory, numeric range validated | Phase 2 → Address & location |
| Street / city / postal code / country | Mandatory `Street`, `ZipCode`, `DetailedLocationID` | Phase 2 → Address & location |
| Max occupancy ≥ 1 | `CanSleepMax` derived from unit sleeping capacity | Phase 2 → Capacity |
| ≥ 10 images | Only reachable URLs counted | Phase 2 → Image count |
| Each image ≥ 1024×768 | Dimensions probed and cached; undersized excluded | Phase 2 → Image dimensions (upload rule in `src/lib/imageValidation.ts`) |
| Main image selected | First ordered image emitted with the main flag | Phase 2 → Main image |
| Price > 0 | Bookable-window evaluator requires a price on open days | Phase 2 → Bookable window |
| ≥ 3 consecutive available priced days | Local scan plus post-push read-back from the channel | Phase 2 → Bookable window |
| MinStay set | Rate-plan stay restrictions + property default per day | Phase 2 → MinStay |
| ≥ 1 cancellation policy | Property/portfolio policy pushed as channel policy | Phase 2 → Policies & payment |
| ≥ 1 payment method | From the property payment configuration | Phase 2 → Policies & payment |
| Arrival information | Mandatory `ArrivalInstructions` | Phase 2 → Arrival instructions |
| Check-in from / check-out until | Mandatory, emitted as HH:MM | Phase 2 → Check-in / check-out |
| ≥ 1 bedroom, kitchen, bathroom | Composition room classes enforced | Phase 2 → Composition |
| Beds distributed between bedrooms | Beds attach to bedrooms only; amenity IDs 97–101 rejected as beds | Phase 2 → Beds distribution |
| Bedding matches max occupancy | Summed bed capacity must equal `CanSleepMax`; shortfall/surplus reported | Phase 2 → Beds distribution |

Outstanding: the channel's own minimum content-quality check has not yet returned a pass — see
action 4.

## 5. Supply API — property management

All 49 rows are supported as declared, with these corrections:

- `Property/Distances` — **now fully supported** (action 1), pushed on updates with duplicate handling.
- `Property/LicenceInfo` — not applicable.
- `PreparationTimeBeforeArrivalInHours`, `AdditionalFees` (taxes and extra charges),
  `LateArrivalFees` / `EarlyDepartureFees` — not supported by Partner decision, as above.

Pricing models: standard daily price, `Extra` / `EGPS` extra-guest pricing, `LOSS` length-of-stay and
`FSPSeason` full-stay pricing, one model active per unit and season, authored solely in ROL'OS Rate
Plans. Availability, MinStay and changeover ride on `Push_PutAvbUnits_RQ` from the calendar and rate
plans; unit counts come from unit-type inventory, never summed leaf calendars.

## 6. Supply API — reservation processing

| Row | Status | Evidence |
|---|---|---|
| `LNM_PutConfirmedReservation_RQ` real-time collection | fully supported | 1 227 `LNM_Notification` runs, idempotent on the channel reservation id |
| `Pull_ListReservations_RQ` safety net | fully supported | 775 runs, every 30 min, reconciles status differences |
| `Pull_GetReservationByID_RQ` | fully supported | Admin → Reservations → Compare with channel → Fetch from channel |
| Reservation creation / modification / cancellation tests | fully supported | Booking appears in Admin Reservations, `/pms/bookings` and the calendar with reference `ROL-<PROP>-<NNNN>`; cancellation releases inventory immediately |
| `Push_ModifyStay_RQ` | fully supported | 3 `modify_stay` runs; PMS-initiated date/unit changes on channel bookings |
| `Push_CancelReservation_RQ` | fully supported | 1 `cancel_reservation` run; unconfirmed leads use `Push_RejectRequest_RQ` (1 `reject_request` run, 504 `lead_lifecycle` runs) |
| PCI compliance / card storage | Partner's system does not have it | No raw card data is received or stored; payments run through hosted PCI gateways, so no certificate applies |

## 7. Evidence exports

- Certification console → **Export evidence** (JSON): endpoint registry, run summary, certification
  runs, sync log, cadence rules.
- Certification console → **Status report** (landscape PDF).
- Diagnostics console: per-call request/response XML with ResponseID, searchable, 90-day retention —
  this is what accompanies any support case.
