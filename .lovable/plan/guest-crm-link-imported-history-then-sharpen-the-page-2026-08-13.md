# Guest CRM: link imported history, then sharpen the page

## What is wrong today

The NightsBridge import does create a guest profile for every name and does attach it to each imported booking (711 of 711 imported stays carry a guest link). What it never does is roll that history up onto the profile: 659 profiles have bookings attached, and every one of them still reads **0 stays / R0 spent / no last stay**. So a returning guest looks brand new, and nothing on the card hints that they have stayed nine times before.

Two smaller matching faults compound it:

- Profile lookup during import matches on the exact name string, so `Anna Botha` and `anna botha ` (trailing space, different case) become two profiles instead of one.
- Profiles are keyed per property, so the same guest staying at two portfolio properties appears twice in the portfolio view with no link between them.

## What we will do

### 1. Roll history onto the profile (the actual fix)

- Add a shared rebuild step that recomputes, per guest profile, the stay count, total spent and last stay date from that guest's non-cancelled bookings.
- Run it at the end of every NightsBridge import for the profiles the run touched, so the numbers are correct the moment the import finishes.
- Run a one-off backfill over existing profiles so the 659 already-imported guests get their history now.
- Trigger the same rebuild when a booking is created, modified or cancelled, so the figures stay honest (replacing the current "+1 stay" increment in the manual booking dialog, which double counts on edits).

### 2. Match guests properly on import

- Match on a normalised name (trimmed, case-folded, collapsed inner spaces), and on email where the sheet has one, before creating anything new.
- Look across the property's portfolio siblings first, so a guest already known at another property in the same portfolio is reused instead of duplicated.
- Merge the one existing duplicate pair we found and keep the normalised key unique going forward.

### 3. Guest CRM page improvements

- **A–Z rail** down the side of the guest list, filtering by surname initial, with counts and letters that have no guests dimmed; `#` for names starting with a digit or symbol.
- **Sort control**: last stay (default), most stays, highest spend, name A–Z.
- **Segment chips**: All / Repeat guests (2+ stays) / VIP (top spenders or tagged) / Has complaints / Blacklisted / No contact details (no email and no phone).
- **Richer guest rows**: last-stay date, nights, home property in portfolio mode, a "Repeat" badge, and correct spend now that the rollup exists.
- **Detail sheet**: editable name/email/phone/tags/notes plus blacklist toggle, a favourite-room and channel summary derived from stay history, and each booking row links through to the booking.
- **Export CSV** of the current filtered list.
- **Header stats**: total guests, repeat-guest share, average spend per guest, guests with contact details.

## Technical notes

- New shared helper `supabase/functions/_shared/guestStats.ts` with `rebuildGuestStats(supabase, guestIds)`, called from `nb-import-bookings`, `roomsonline-pms-api` (booking create/modify/cancel) and a small `backfill` action for the one-off pass.
- Name normalisation helper reused by the importer and by `ManualBookingDialog` guest search so both resolve the same identity.
- Migration: add a `normalised_name` generated column plus a unique index per property on it, and an index on `bookings.rolos_guest_id` if not already present; merge the duplicate profile before the unique index is applied.
- `src/pages/pms/PMSGuests.tsx` splits into `GuestListTab` (rail, filters, rows, export) and the existing detail sheet; filtering and sorting stay client-side over the fetched page, with search still hitting the database.
- Recompute uses non-cancelled, non-no-show bookings only; imported NightsBridge stays continue to carry zero ROL commission.
