# Guest CRM: honest spend figures + guest editing

## The problem

Lifetime spend currently adds up the full value of every non-cancelled booking, whether or not a cent was received. Across the portfolio that inflates the numbers by roughly R3.7m of pending, unpaid bookings, plus another R1.2m of part-paid confirmed bookings counted at full value. Cancelled bookings are excluded entirely, so cancelled-but-paid money simply disappears instead of being visible.

There is also no way to edit a guest from the CRM (only "Add Guest"), and no way to archive or delete a bad, duplicate, or test profile.

## What changes

### 1. Spend split into four honest figures

Every guest profile will carry, derived from their bookings:

- **Received** — money actually paid (includes externally settled bookings). This becomes the headline "spend" figure everywhere: list rows, sorting, CSV.
- **Outstanding** — booked value not yet paid on live bookings (pending, unpaid, part-paid).
- **Cancelled** — value of cancelled/no-show bookings, shown separately and muted, never folded into spend.
- **Stays** — completed or in-house stays counted separately from future bookings, so "3 stays" no longer includes a speculative enquiry.

In the list, a guest with money owing gets an amber "R12 400 owing" chip next to their received total; cancelled history shows as a muted strike-through chip. The guest detail sheet gets a small four-figure summary (received / owing / cancelled / nights) and each booking row is tagged with its payment state (Paid, Part paid, Unpaid, Cancelled) so the arithmetic is self-evident.

Two new segment chips: **Owing** and **Never paid**.

### 2. Edit, archive and delete guests

- **Edit** — pencil action on each row and in the detail sheet opens a dialog for name, email, phone, nationality, notes, VIP tag and blacklist flag. Saves through the existing `update_guest_profile` action.
- **Archive** — a soft hide. Archived guests drop out of the list, counts and CSV, with an "Archived" filter to review and restore them. Nothing is destroyed and booking history stays intact.
- **Delete** — permanent, restricted to property owners, admin, dev and fearless leader. If the guest has bookings attached, the dialog refuses the delete and offers archive instead, so booking records never end up orphaned. Guests with no bookings delete outright after a typed confirmation.

## Technical notes

- Migration: add `total_received`, `total_outstanding`, `total_cancelled_value`, `cancelled_stays`, `is_archived` (default false) to `rolos_guest_profiles`; partial index on `(property_id) WHERE NOT is_archived`.
- Rewrite `public.rebuild_guest_stats(uuid[])` to compute all figures in one aggregate: received = `sum(amount_paid)` over non-cancelled bookings, outstanding = `sum(greatest(total_price - amount_paid, 0))` over non-cancelled, cancelled value = `sum(total_price)` over `cancelled`/`no_show`, stays = non-cancelled bookings with `check_in_date <= current_date`. `total_spent` is kept in sync with received for any legacy reader. Backfill by calling it with `null`.
- Existing DELETE/UPDATE policies already cover owner/admin/dev; add `fearless_leader` to both for parity with the rest of the app.
- `src/pages/pms/PMSGuests.tsx`: extend the `Guest` type and select list, add the owing/cancelled chips, the two new segments, the archived filter, and row actions. Extract the edit/archive/delete dialog into `src/components/pms/crm/GuestEditDialog.tsx` to keep the page under control.
- `supabase/functions/roomsonline-pms-api/index.ts`: extend `update_guest_profile` to accept the new editable fields plus `is_archived`, and add a `delete_guest_profile` action that counts bookings first and returns a `HAS_BOOKINGS` refusal instead of deleting.
- Memory note updated: received/outstanding/cancelled are derived read-model columns written only by `rebuild_guest_stats`.
