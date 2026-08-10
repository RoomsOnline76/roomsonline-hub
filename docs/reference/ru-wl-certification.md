# Rentals United White Label certification — gap register

Source of truth: `Roomsonline_WL_Certification_Form.xlsx` (uploaded 2026-08-10), archived as a
CDN asset pointer at `src/assets/ru-wl-certification-form.xlsx.asset.json`.

This is the running scoreboard. Gaps are closed one at a time, each with its own plan. Where a
gap needs new data captured on a property, the change must land in **three** places:
`PropertyForm` / ROL'OS property setup, the **main onboarding wizard** (captured up front) and
the **channels wizard** (refines whatever is still missing). Adapter work goes into
`supabase/functions/rentalsunited-api` and its shared helpers.

Workbook status vocabulary: `to be certified`, `planned to implement`, `partially supported`,
`fully supported`, `not supported (Partner decision)`, `Partner's system does not have it`,
`not applicable`.

## 1. WL Admin

| Item | RU method | Declared |
| --- | --- | --- |
| Commercial contact | — | carike@roomsonline.co.za |
| Technical contact | — | dev@roomsonline.co.za |
| Account management contact | — | carike@roomsonline.co.za |
| Billing plan defined and set | — | fully supported |
| RU Supply API integration certified | — | to be certified |
| PMS Profile available | — | to be certified |
| Master WL account with token master + createuser roles | — | to be certified |
| Backdoor access for partner staff | — | open |
| Test account in partner production environment | — | credentials to supply |
| Create account belonging to our PMS | `Push_CreateUser_RQ` | to be certified (implemented: `create_user`) |
| Company details of new account | `Push_FillCompanyDetails_RQ` | implemented: `fill_company_details` |
| RU WL available in the PMS for the RU test account (manual) | — | to be certified |

## 2. General declarations

| Declaration | RU method | Status |
| --- | --- | --- |
| Dictionary methods cached and mapped | XML dictionaries | partially — amenities, locations, composition rooms cached |
| Countries/regions/cities cached | `Pull_ListLocations_RQ` | to be certified (`list_locations`) |
| Delta property push on change | `Push_PutProperty_RQ` | to be certified |
| Full property push weekly | `Push_PutProperty_RQ` | to be certified (`cron-push-all-properties-to-ru`) |
| Availability/changeover/min-stay push on event | `Push_PutAvbUnits_RQ` | open |
| Availability push every 24h | `Push_PutAvbUnits_RQ` | open (`cron-refresh-ru-ari`) |
| Price push on event | `Push_PutPrices_RQ` | to be certified |
| Price push every 24h | `Push_PutPrices_RQ` | to be certified |
| Currency converted per RU location before push | — | to be certified (`ru_currency_state`, `verify_ru_currency`) |
| Discounts pushed on event | `Push_PutLongStayDiscounts_RQ`, `Push_PutLastMinuteDiscounts_RQ` | to be certified |
| Discounts pushed every 24h | same | to be certified |
| Reservation pull at least daily | `Pull_ListReservations_RQ` | to be certified (`cron-pull-ru-reservations`, 30 min) |
| RLNM handler URLs registered | `LNM_PutHandlerUrl_RQ` | to be certified (`ru-reservation-handler`, `ru-lnm-handler`) |
| 30-day request/response logging incl. ResponseID | — | open — verify `ru_sync_runs` retention covers request/response/ResponseID |

## 3. Content quality (MCQ validators)

All validators are scored by the readiness model (`usePropertyReadiness`) and the RU MCQ order
(`order_mcq`, `RuMcqReportPanel`). Remaining certification items:

| Validator | API path |
| --- | --- |
| Property type set | `Property/PropertyTypeID`, `Property/ObjectTypeID` |
| Name non-empty, no emoji/special chars, not all-caps | `Property/Name` |
| Description >= 700 characters | `Property/Descriptions/Description` |
| Geocoordinates provided | `Property/Coordinates` |
| Address line non-empty | `Property/Street` |
| City / country set | `Property/DetailedLocationID` |
| Postal code set | `Property/ZipCode` |
| Max occupancy >= 1 | `Property/CanSleepMax` |
| >= 10 images, each >= 1024x768, main image flagged | `Property/Images`, `Image@ImageTypeID` |
| Minimum price > 0 | `Push_PutPrices_RQ` |
| >= 3 consecutive available priced days | `Push_PutAvbUnits_RQ` |
| MinStay set | `Push_PutAvbUnits_RQ` |
| >= 1 cancellation policy condition | `Property/CancellationPolicies` |
| >= 1 payment method | `Property/PaymentMethods` |
| Arrival information set | `Property/ArrivalInstructions` |
| Check-in from/to and check-out set | `Property/CheckInOut` |
| >= 1 bedroom, beds distributed across bedrooms, bedding matches CanSleepMax | `Property/CompositionRoomsAmenities` |
| Kitchen room type present | `Property/CompositionRoomsAmenities` |
| Bathroom present | `Property/CompositionRoomsAmenities` |

## 4. Supply API — property management

`Push_PutProperty_RQ` fields to certify: `Name`, `ObjectTypeID`, `CanSleepMax`, `Floor`,
`Space`, `Street`, `DetailedLocationID`, `ZipCode`, `Coordinates`, `LicenceInfo` (local
legislation), `Distances`, `CompositionRoomsAmenities` (+ per-room amenities), `Amenities`,
`Descriptions`, `Images`, `PreparationTimeBeforeArrivalInHours`, `StandardGuests`,
`AdditionalFees` (taxes and extra charges), `Deposit`, `SecurityDeposit`,
`ArrivalInstructions` (Landlord / DaysBeforeArrival / Email / Phone), `CheckInOut`.

`Push_PutPrices_RQ`: `Season/Price`, `Season/Extra`, `Season/EGPS`, `Season/LOSS`, and
`FSPSeasons/FSPSeason` (full-stay pricing). Discounts: `Push_PutLastMinuteDiscounts_RQ`,
`Push_PutLongStayDiscounts_RQ`. Dictionaries: amenity mapping list.

Fields not yet captured anywhere in ROL'OS become their own gap entry, and each such gap must
add the field to the property form, the onboarding wizard and the channels wizard.

## 5. Supply API — reservation processing

| RU method | Requirement | Status |
| --- | --- | --- |
| `LNM_PutConfirmedReservation_RQ` | Collect bookings in real time | implemented — `ru-reservation-handler` |
| `Pull_ListReservations_RQ` | Bookings for our properties, up to 7 days back | implemented — `list_reservations` + 30-min poll |
| `Pull_GetReservationByID_RQ` | Specific booking detail by RU Reservation ID | **implemented 2026-08-10** — `get_reservation_by_id`, RLNM id-level reconcile, cert `reservation_detail_test`, support lookup in the RU Reservations panel |
| Reservation creation test | New reservation lands in our system | covered by `reservation_idempotency_test` |
| Reservation modification test | Channel-originated change applies | covered by ingest update path |
| Reservation cancellation test | Cancellation applies | covered by `rlnm_replay_test` |
| `Push_ModifyStay_RQ` | Modify a booking in RU (multi-unit hotel channels) | implemented — `modify_stay` |
| `Push_CancelReservation_RQ` | Cancel a booking in RU | implemented — `cancel_reservation`, `reject_request` |
| PCI compliance | Receive card details via API | Partner's system does not have it — cards never touch ROL'OS |

## Working order

Gaps are prioritised by the user, one at a time. Closed so far:

1. `Pull_GetReservationByID_RQ` — reservation detail pull (2026-08-10).
