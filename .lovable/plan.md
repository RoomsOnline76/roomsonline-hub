

## Plan: Owner Auto-Redirect to PMS + Enterprise PMS Calendar

Two major features: (1) route ROL'OS property owners directly to PMS on login, and (2) build an enterprise-grade calendar page in the PMS module.

---

### Part 1: Owner Auto-Redirect to PMS Landing Page

**Current behavior:** All users (including owners) redirect to `/dashboard/reports` after login via `navigate("/")` in `Auth.tsx`, which then hits `<Navigate to="/dashboard/reports" />` in `App.tsx`.

**Change:** After successful login, check if the user is a pure "owner" (has `user` role, no `admin`/`dev` roles) AND owns at least one ROL'OS property (`is_rol_property = true`). If so, redirect to `/pms` instead of `/`.

**Files to modify:**
- **`src/pages/Auth.tsx`** — After sign-in, query `user_roles` and `property_owners` + `properties.is_rol_property`. If owner-only with ROL property, navigate to `/pms` instead of `/`.
- **`src/App.tsx`** — Update the `"/"` route to also handle ROL owners (or keep the redirect logic in Auth.tsx only, which is cleaner).

---

### Part 2: PMS Calendar Page

Create a new **`/pms/calendar`** route with a full enterprise PMS calendar.

**New file: `src/pages/pms/PMSCalendar.tsx`**

A property-scoped calendar that displays:

**Grid layout** — Rows = room types (with individual rooms nested), Columns = dates (scrollable). Week/Month toggle.

**Data layers per cell:**
- **Rate**: base rate from `rolos_rate_prices` joined through `rolos_rate_seasons` (matched by date range) for that room type
- **Availability**: computed from `rolos_rooms` status + existing bookings overlapping that date
- **Blockouts/Stop-sell**: from `rolos_rate_plans` (`closed_to_arrival`, `closed_to_departure`) and season-level min-stay overrides
- **Bookings**: from `bookings` table filtered by property, rendered as horizontal spans across check-in to check-out dates

**Booking display features:**
- Bookings rendered as colored bars spanning their date range within the room row
- Color coding by status: confirmed (blue), pending (amber), checked_in (green), cancelled (red/strikethrough)
- Click to expand: opens a detail panel/drawer showing:
  - Guest name, email, phone
  - Check-in/out dates and times (`rolos_check_in_time`, `rolos_check_out_time`)
  - Adults, children, infants, pets counts
  - Room assignment (`rolos_room_ids`)
  - Special requests (`special_requests`, `special_requests_parsed`)
  - Payment status and total price
  - Booking channel and source
  - Modification history (`modification_notes`)
- Visual markers for bookings with special requests or `requires_intervention = true` (warning icon/badge)

**Enterprise enhancements:**
- Date navigation: prev/next week/month, today button, date picker jump
- Occupancy summary bar at top (% occupied per day)
- Rate display per room type per date cell
- Season indicators (peak/off-peak from `rolos_rate_seasons`)
- Legend for status colors, blockouts, and special markers
- Responsive: horizontal scroll on mobile with sticky room-type column

**Files to create/modify:**
- **Create `src/pages/pms/PMSCalendar.tsx`** — The full calendar component
- **Modify `src/pages/pms/index.ts`** — Export `PMSCalendar`
- **Modify `src/App.tsx`** — Add `/pms/calendar` route
- **Modify `src/components/layout/PMSSidebar.tsx`** — Add "Calendar" nav item with `CalendarDays` icon after "Reports"
- **Modify `src/components/layout/MobileBottomNav.tsx`** — No change needed (uses overflow "More" menu)

**Data fetching strategy:**
- Fetch `rolos_room_types` + `rolos_rooms` for the property
- Fetch `bookings` for property within visible date range
- Fetch `rolos_rate_plans` → `rolos_rate_seasons` → `rolos_rate_prices` for rate overlay
- All queries scoped to `propertyId` from `usePmsPropertyId()`

---

### Technical Details

```text
┌──────────────────────────────────────────────────────┐
│ Calendar Header: ◀ Week/Month ▶  Today  [Date Jump] │
│ Occupancy Bar: ██░░██████░░░░ (% per day)            │
├────────────┬─────┬─────┬─────┬─────┬─────┬──────────┤
│ Room Type  │ Mar8│ Mar9│Mar10│Mar11│Mar12│ ...       │
├────────────┼─────┼─────┼─────┼─────┼─────┼──────────┤
│ Deluxe     │R1200│R1200│R1500│R1500│R1200│           │
│  Room 101  │ ████████ J.Smith ████│     │           │
│  Room 102  │     │     │ ░░░░BLOCKED░░░░│           │
│ Standard   │R 800│R 800│R1000│R1000│R 800│           │
│  Room 201  │     │████ A.Jones █████████│           │
└────────────┴─────┴─────┴─────┴─────┴─────┴──────────┘
                         ↓ click booking
              ┌─────────────────────────┐
              │ Booking: J. Smith       │
              │ Mar 8 → Mar 10 (2 nts)  │
              │ 2 Adults, 1 Child       │
              │ ⚠ Special: Late arrival │
              │ Status: Confirmed       │
              │ Total: R2,400           │
              └─────────────────────────┘
```

**Auth redirect flow:**
```text
Login → Auth.tsx checks roles
  ├─ owner + ROL property → /pms
  └─ admin/dev → / → /dashboard/reports
```

