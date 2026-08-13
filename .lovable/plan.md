# Make imported NightsBridge data visible (and non-commissionable)

## What I verified in the database

Seesig's import worked. There are **585 NightsBridge bookings** on the property (543 confirmed/paid, 36 pending, 6 other), R16.4m gross, and the property is active/trading. Nothing is missing from the database — the problem is how the data lines up with the app's default windows and mappings:

- **All but 1 booking are in the past.** Check-ins run 2 Jun 2024 → 10 Jun 2026; today is 13 Aug 2026. The ROLOS Dashboard room plan opens on 13 Aug – 12 Sep 2026, the Bookings page defaults to the last 30 days, and Revenue's future/past windows are 14/30 days — so every screen legitimately shows zero.
- **189 of 585 rows have no unit / room type** (`rolos_room_ids` and `room_type_id` are null), so even inside a matching window they cannot draw on the room plan or count towards per-unit occupancy.
- **`calculated_commission` is null on all 585 rows**, so ROL metrics that iterate commission values skip these bookings entirely — they contribute neither revenue nor booking counts.
- **2 rows have implausible stay lengths** (one renders as a 159-night bar on the room plan today).

## What to build

### 1. History-aware views
- Add an explicit period control so imported actuals can be seen: date presets (This month / Last 3 months / Last 12 months / Since first booking) on ROLOS Dashboard, Bookings, Reports and Revenue, seeded from the property's earliest booking date rather than a hard-coded 30-day default.
- ROLOS Dashboard: a "Jump to" affordance already exists; add a small notice when the current window is empty but bookings exist outside it ("585 bookings outside this range — view last 12 months").
- Label imported rows with a source badge ("Imported · NightsBridge") in Bookings, the booking sheet and Reports channel breakdowns.

### 2. Unit mapping repair
- Add a one-click "Fix unmapped rooms" action in the NightsBridge import panel: lists the 189 unmapped bookings grouped by the original NB room name, lets each name be mapped to a ROL'OS unit/room type, and backfills `rolos_room_ids`, `room_type_id` and `rolos_booking_rooms` lines.
- Flag and list the implausible-date rows in the same panel for correction or exclusion.

### 3. Non-commissionable actuals (ROL side)
- Stamp imported bookings as `commission_type = 'none'` with `calculated_commission = 0` so intent is explicit rather than null.
- Update ROL metrics (ROL Pulse revenue, owner account, payout and commission reports) to count imported bookings as **property actual revenue** with **zero ROL commission**, instead of dropping any booking whose commission is 0. Commission reports, payout statements and invoices stay unchanged in value — imported volume appears as an information line ("imported actuals, non-commissionable").
- Property/portfolio dashboards and metrics then include imported revenue, ADR, occupancy and booking counts.

### 4. Upstream sync to Rentals United
- Imported stays with a future check-out are real occupancy, so they must block channel availability: queue an ARI delta for the affected dates after an import (and after a mapping fix), using the existing automatic delta pipeline and gate parking.
- Past stays are never pushed. Today only 1 Seesig booking qualifies; the mechanism matters for the next import.

## Technical notes

- Backfill migration: set `commission_type='none'`, `calculated_commission=0` where `integration_type='nightsbridge'`, plus grants unchanged (existing table).
- `nb-import-bookings`: write the commission fields on insert/update, return unmapped room-name groups, and expose a `mode: "remap"` action for the repair tool; queue ARI deltas for future-dated rows via the existing `ruPendingDeltas` helper.
- Commission-aware readers to adjust: `useRolActualRevenue`, `useOwnerAccount`, `usePropertyPayouts`, PMS Revenue/Reports aggregation — treat 0-commission bookings as revenue-bearing rows.
- Date defaults live in `PMSDashboard.tsx`, `Bookings.tsx`, `PMSReports.tsx`, `PMSRevenue.tsx`; introduce a shared preset helper so the four screens agree.
- No schema change beyond the value backfill.

## Open point

The file imported for Seesig contains no reservations after 10 Jun 2026, so "future reservations" are effectively absent. After this work, re-export from NightsBridge with the future window included — the importer is idempotent on NB id, so re-running only adds/updates.
