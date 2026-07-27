## Problem

On `/admin/bookings`:
1. Bookings show **"(Deleted Property)"** for properties that aren't actually deleted. The property lookup only loads properties where `is_active = true`, so any booking against an inactive-but-existing property falls through to the "Deleted Property" label.
2. Header counters (**Total / Confirmed / Pending / Cancelled / Revenue**) include `pending` reservations. Same on `/admin/dashboard`, where the `Total Bookings` and `Pending Bookings` tiles count unpaid rows.

The user wants only **paid** bookings counted, and the property name resolved correctly whenever the property still exists (only truly-deleted rows should read "Deleted Property").

## Changes

### 1. `src/pages/Bookings.tsx` — resolve real property names

- After fetching bookings, collect any `property_id` that isn't in the already-loaded `properties` array.
- Run a second lightweight query against `properties` for those IDs **without** the `is_active` filter (keep `permanently_deleted_at IS NULL` — only truly-purged rows should read "(Deleted Property)").
- Merge the results into an ID→name map and use that map when building `internalBookings` / `pmsBookings`.
- Only fall back to `"(Deleted Property)"` when a row is truly missing or has `permanently_deleted_at` set.

### 2. `src/pages/Bookings.tsx` — counters count paid only

- Add a `isPaid(b)` helper: `b.payment_status === 'paid'` (PMS reservations that come back without a payment_status but with status `confirmed`/`guaranteed`/`checked-in` are treated as paid, matching how the PMS side records post-payment reservations).
- Redefine `stats`:
  - **Total** = count of paid bookings
  - **Confirmed** = paid AND status in (`confirmed`, `guaranteed`, `checked-in`)
  - **Cancelled** = status `cancelled` (unchanged, still useful)
  - **Revenue** = sum of `total_price` for paid, non-cancelled bookings
- Drop the **Pending** stat card (grid becomes 4 columns). Pending bookings still appear in the table with their existing badge; they just aren't tallied at the top.

### 3. `src/pages/AdminDashboard.tsx` — dashboard tiles count paid only

- Replace the "Total Bookings" and "Pending Bookings" tiles with:
  - **Paid Bookings** = `bookings` where `payment_status = 'paid'` (all time)
  - **Confirmed Bookings** = `bookings` where `payment_status = 'paid'` AND `status = 'confirmed'`
- Update the `DashboardStats` shape accordingly (`paidBookings`, `confirmedBookings`); keep the Access Requests and Active Properties tiles as-is.
- `issuesCount` no longer includes pending-booking count (it was misleading here — pending isn't an issue, it's an unfinished checkout). Base it on `pendingAccessRequests` only.

## Out of scope

- No schema changes.
- No changes to how bookings are created or how `payment_status` is set.
- The `Pending` status filter dropdown in the toolbar stays available for browsing; only the top-line counters change.
