# NightsBridge Booking Import (single property)

Load a NightsBridge "Client Summary / Bookings Report" export (history + future stays) into ROLOS for one property, with a safe dry-run preview and idempotent re-imports.

## What the user gets

A **NightsBridge Booking Import** card in the property editor's Integrations tab (same place as the channel cards, admin/owner only):

- Dropzone for `.xlsx`, `.xls`, `.csv` (max 10 MB)
- **Validate (dry run)** → summary chips (new / update / skip / error / unmapped rooms) plus an expandable preview table (dates, guest, room, amount, status, action)
- Room-mapping helper: any NightsBridge room name that can't be matched is listed with a dropdown of the property's ROLOS rooms; mappings apply to the run
- **Import** → progress bar, result toast, downloadable error log (CSV) with row numbers and reasons
- "Last import" line showing when the property was last imported and by whom

## Agreed behaviour

- **Everything in the file** is imported — no date cut-off. Past stays land as history, future stays appear on the existing calendar and booking list with no calendar code changes.
- **"Unavailable" rows are skipped**, but counted and listed in the log so nothing disappears silently.
- **Guest email** is stored as an empty string (NB exports have none), so these rows read as clearly blank in the UI.
- **Guest profiles** are created/linked by full name so repeat-guest history works.

## Data mapping

| NightsBridge column | ROLOS |
|---|---|
| NBID | `external_reservation_id` (idempotency key) |
| Arrival Date | `check_in_date` |
| Last Night | `check_out_date` = last night + 1 day |
| Guest Name | `guest_name`, `guest_first_name`/`guest_last_name` |
| Made By | `booking_made_by` |
| Company | `guest_company` |
| Adults / Children | `adults` / `children` |
| Revenue (fallback Nett) | `total_price` |
| Paid to Date | `deposit_amount` + drives `payment_status` |
| Source | `booking_channel` (mapped) |
| Room Name | `rolos_rooms` match → `rolos_booking_rooms` row |
| Booking ID, Account ID, Invoice No., Proforma No., Commission, Currency, raw Source/Status | appended to `internal_notes` as a structured block |

Status: Paid → `confirmed`/`paid`; Confirmed → `confirmed` with `paid`/`partial`/`unpaid` from Paid to Date vs Revenue; Provisional and Waiting for Deposit → `pending`; anything unknown → `pending` with the original value noted.

Channels map into the vocabulary already used by the manual booking dialog (`direct`, `booking_com`, `airbnb`, `expedia`, `lekkeslaap`, `website`, `travel_agent`, `nightsbridge`, `other`).

## Technical notes

**New edge function `supabase/functions/nb-import-bookings/index.ts`** — the only ingestion path; no shared availability or reservation fetch code is touched.

- Input: `{ property_id, file_base64, file_name, dry_run, room_overrides?, default_currency? }`; Zod-validated.
- Parses `.csv` with `papaparse` (already a dependency) and `.xlsx`/`.xls` with `npm:xlsx`; header row detected by presence of both `Booking ID` and `NBID`, so title rows are ignored.
- Auth: validates the caller's JWT and mirrors the existing property write checks (admin / `fearless_leader` / property owner / portfolio admin) before any write.
- Resolves rooms against `rolos_rooms` (`room_name`, then `room_number`) and `rolos_room_types.name`, case-insensitive and trimmed, scoped to the property; unresolved names are reported and the booking header is still written with no room line.
- Upsert keyed on `(property_id, external_reservation_id)` where `integration_type = 'nightsbridge'`; missing NBID falls back to `Booking ID | Arrival Date | Room Name` with a warning.
- Writes in batches of ~50 rows with a per-row error record, so one bad row never aborts the run. Response matches the requested `{ ok, dry_run, summary, errors, preview }` shape.

**Trigger safety (verified):** `bookings` insert triggers assign the `ROL-<PROP>-<NNNN>` reference and create a folio for confirmed ROL properties; guest messaging only fires on a status *update*, so importing history sends no guest email. Imported rows are updated with a guarded write that never flips status through the confirmation validator.

**Migration (one index, no breaking changes):**

```sql
CREATE UNIQUE INDEX bookings_nb_external_uidx
  ON public.bookings (property_id, external_reservation_id)
  WHERE integration_type = 'nightsbridge' AND external_reservation_id IS NOT NULL;
```

**New UI files:** `src/components/property/NightsBridgeBookingImport.tsx` (card, dropzone, dry-run summary, mapping helper) mounted in `src/components/property/PropertyFormIntegrationsTab.tsx` alongside the existing channel cards, using existing Card/Table/Badge/Progress/Alert/Select/sonner patterns.

## Out of scope

Live two-way NightsBridge API sync, calendar rendering changes, multi-property bulk import, and confirmation emails for historical rows.
