# Fix Rentals United reservation import: real guest data, calendar visibility, hold countdown

## What is wrong today (verified against the live data)

1. **The two green RU reservations did import** (Leervis 18–22 Aug R4000, Geelstert 11–15 Aug R3760) but they do **not** appear on the ROLOS calendar/dashboard. Reason: the import attaches the booking to the *Rentals United mapping* room type (`hostfully_room_types`, e.g. GEELSTERT `917672dc…`), while the ROLOS dashboard draws its rows from the canonical `rolos_room_types` records (GEELSTERT `169967ea…`), and those canonical records have no `linked_overview_id` back to the mapping row. Nothing matches, so the bars are never rendered.
2. **Guest details are lost.** RU returns the guest inside `<CustomerInfo>` as `<Name>` / `<SurName>` / `<MobilePhone>` / `<CountryID>`, and the stay inside `<StayInfos><StayInfo>` with `<Costs>` and a per-night `<ReservationBreakdown>`. The importer looks for `FirstName` / `LastName` / `Phone`, so every booking lands as **"RU Guest"** with no phone, no nightly breakdown, no comments, no paid amount.
3. **The blue request ("You Maybe", Wildeperd, 5 nights, R4100) never arrives.** RU's reservation pull returns only the 2 confirmed rows, and every lead pull for the last 12 runs returned `leads_found: 0`. So the blue item is either a request-status reservation that we filter out (we only accept StatusID 1/2/4 and silently skip anything else) or a lead the current `Pull_GetLeads_RQ` call/parse does not surface. Both paths need to be fixed and confirmed against the live account before we can claim it works.
4. **Holds have no visible countdown.** The 3-day hold and 14-day auto-withdrawal dates are stored but nothing on the booking card or calendar tells admin/property when the hold expires or when auto-cancellation is due.

## What will be built

### A. Correct unit mapping so RU bookings show on the calendar
- On import, resolve the RU `PropertyID` to the canonical ROLOS room type (match the mapping row's name to `rolos_room_types` for the same property) and store that id on the booking, keeping the RU mapping id as a fallback.
- Backfill the two existing RU bookings onto their canonical units.
- Harden the dashboard's matcher so a booking carrying a legacy/mapping room-type id still resolves to the displayed unit by name (same fallback already used for stale physical rooms).

### B. Full guest and stay detail on the booking card
Parse the real RU shape and write it to the booking:
- Guest: `CustomerInfo.Name` + `SurName`, `Email`, `MobilePhone` (fallback `Phone`), `CountryID` → nationality, address/zip where present.
- Stay: `StayInfo.DateFrom` / `DateTo`, `NumberOfGuests`, `ArrivalTime`, `Units`.
- Money: `Costs.RUPrice` / `ClientPrice` as total, `AlreadyPaid` drives payment status and paid timestamp, per-night `DayPrices` kept as the rate breakdown.
- Provenance: RU `ReservationID`, `ResapaID`, `Creator`, `CreatedDate`, `Comments` → guest notes / special requests.
- Re-run the pull so the two existing bookings are upgraded from "RU Guest" to the real guest records.

### C. Requests / leads actually captured
- Stop silently discarding non-confirmed reservation statuses: any request/provisional status becomes a **held provisional booking** (3-day hold, 14-day arrival withdrawal) instead of being skipped.
- Diagnose the empty lead pull against the live sub-user account (request window, envelope, response element names) and fix the parse so RU requests such as "You Maybe" land in ROLOS. If RU has not enabled the leads method for this integration, surface that explicitly in the sync console rather than reporting zero leads as success.

### D. Hold expiry and auto-cancellation visible to admin/property
- Booking card (dashboard sheet): a hold panel showing "Dates held until <date/time> (x h left)" and "Auto-withdrawal due <date>" for RU requests, plus the reason text used on withdrawal.
- Calendar bar tooltip and badge: held vs lapsed hold, with the countdown.
- Lapsed-but-not-withdrawn holds flagged so staff can act manually.

## Technical notes

- Files: `supabase/functions/cron-pull-ru-reservations/index.ts` (parser, mapping, lead handling), `supabase/functions/ru-lead-lifecycle/index.ts` (unchanged logic, verified against the new statuses), `src/pages/pms/PMSDashboard.tsx` (room-type fallback matcher, hold panel, tooltips), plus a small data backfill for the two existing bookings.
- `bookings` has no dedicated paid-amount or nightly-breakdown column; nightly prices, `AlreadyPaid`, `ResapaID` and `Creator` will be stored in the existing JSON notes field and reflected through `payment_status` / `paid_at`.
- Availability blocks continue to use the existing `property_availability` manual-block convention, keyed on the unit name, so no change is needed there.
- Rentals United adapter files are lock-listed; only the reservation/lead pull paths named above are touched, and `Push_RejectRequest_RQ` remains the withdrawal method.

## Verification

- Re-run the reservation pull and confirm both bookings show the real guest names, phone, nightly prices and paid amounts.
- Confirm both bars render on the ROLOS dashboard calendar for Groot-Jongensfontein in August.
- Confirm the blue request appears as a held booking with a visible hold countdown, or that the console states plainly why RU is not returning it.
