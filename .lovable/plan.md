# Group Bookings & Packages — Enterprise Upgrade (Phase 1 first)

## What exists today (verified)

- `PMSGroups.tsx` (481 lines) creates groups, adds room blocks, releases blocks, and adds **name-only** placeholder rows to `rolos_group_reservations`.
- `rolos_group_room_blocks` already has `status`, `release_date`, `rate_override` — but **no** `picked_up_count` and **no** inventory side-effects at all.
- `rolos_group_reservations` has nullable `booking_id` / `reservation_id` and a free-text `guest_name`; nothing links a picked-up room to a real booking or a specific block.
- `rolos_groups` has `attrition_rate`, `release_date`, `total_rooms`, text `notes`; no billing mode, no master folio, no deposit, no contract reference, no cut-off date.
- `rolos_inventory_calendar` has `total_units / booked_units / blocked_units` with a generated `available_units`. Nothing in the app writes `blocked_units` today.
- **Important:** the native availability the booking engine consumes is served from `pms_availability_cache` (in `roomsonline-pms-api → fetch_availability`), not from `rolos_inventory_calendar`. `create_reservation` writes both. Group blocks must therefore do the same, or blocked rooms will still be sellable online.
- `rolos_folios.booking_id` is **NOT NULL**, so a group master folio needs a schema change before it can exist.
- Manual bookings are created in `bookings` (+ `rolos_booking_rooms`) by `ManualBookingDialog`, which is what the Room Plan and dashboard read. Pickup should therefore create `bookings` rows, not orphan `rolos_reservations`.
- Existing inventory increment inside `create_reservation` upserts `booked_units = requiredCount` and then increments the same row again — it both overwrites and double counts. Phase 1's atomic RPC replaces this code path.

## Phase 1 — Groups foundation

### 1. Schema (one migration)

- `rolos_groups`: add `master_folio_id`, `billing_mode` ('master' | 'individual' | 'hybrid', default 'individual'), `deposit_amount`, `contract_ref`, `cutoff_date`, `notes_json` JSONB (keep the existing text `notes` untouched for back-compat).
- `rolos_group_room_blocks`: add `picked_up_count` (default 0), `property_id` (denormalised for RLS/indexes), `released_at`, `attrition_charged` boolean; keep `status` as 'blocked' | 'released' | 'picked_up'.
- `rolos_group_reservations`: add `block_id` FK → `rolos_group_room_blocks`, `room_type_id`, `arrival_date`, `departure_date`, `room_preference`, `special_requests`, `guest_email`, `guest_phone`, `adults` / `children`, and a real FK on `booking_id` → `bookings.id`.
- `rolos_folios`: make `booking_id` nullable and add `group_id` FK, with a check that exactly one of `booking_id` / `group_id` is set. This is what lets a master folio exist.
- Indexes: `(group_id)`, `(property_id, status)`, `(block_id)`; RLS mirrors the existing property-access pattern already used by `rolos_groups`, plus GRANTs for `authenticated` and `service_role`.
- Backfill: `picked_up_count = 0`, `property_id` from the parent group, existing folios keep their `booking_id`.

### 2. Atomic inventory integration

Two security-definer SQL functions so every date in a range moves in one statement (no read-then-write races):

- `rolos_apply_block_inventory(property_id, room_type_id, start_date, end_date, delta)` — upserts `rolos_inventory_calendar` rows and applies `blocked_units = greatest(0, blocked_units + delta)`.
- `rolos_convert_block_to_booked(property_id, room_type_id, start_date, end_date, units)` — decrements `blocked_units` and increments `booked_units` in the same statement.

Wired into:

- **Create block** → `+blocked_units` for each night, plus a matching decrement of `pms_availability_cache.available_units` so the online engine and channels stop selling those rooms.
- **Release / attrition** → `-blocked_units` and restore the cache; if the group has an `attrition_rate` and the block is released after `cutoff_date`, post an attrition charge to the master folio via the existing `pms-financial` path (`revenue_stream = 'accommodation'`).
- **Pickup** → creates a real `bookings` row (+ `rolos_booking_rooms` line) using the same payload shape as `ManualBookingDialog`, links it to `rolos_group_reservations.booking_id`, bumps `picked_up_count`, and calls `rolos_convert_block_to_booked`. Marks the block `picked_up` when fully consumed.

All of this lives behind new actions on the existing `roomsonline-pms-api` edge function (`group_create_block`, `group_release_block`, `group_pickup_room`, `group_import_rooming_list`), so the adapter stays the isolation layer and the UI stays PMS-agnostic.

### 3. UI (evolve `PMSGroups.tsx`, do not replace it)

New components under `src/components/pms/groups/`:

- `GroupBlockGrid.tsx` — per-block card with pickup progress bar (picked up / blocked), remaining inventory pulled live from the inventory calendar, release countdown ("releases in 4 days"), and Pick up / Release actions.
- `GroupPickupDialog.tsx` — guest details + dates + room preference → creates the linked booking.
- `RoomingListTable.tsx` — editable rooming list with inline save, plus **CSV import** (name, email, arrival, departure, room type, preference, notes) validated against remaining blocked inventory.
- `GroupBillingPanel.tsx` — master / individual / hybrid toggle, deposit + contract ref + cut-off date, and an "Open master folio" button reusing `BookingFolioTab` in group mode.
- Status transitions in the group menu trigger their inventory and folio side-effects (confirm → keep blocks, cancel → release all blocks and restore inventory).

### 4. Scheduled release

Extend the night-audit job: any block whose `release_date` has passed and is still `blocked` is auto-released (inventory restored) and, where the group's attrition terms apply, an attrition charge is posted to the master folio. Logged to `rolos_night_audit_log`.

## Phase 2 — Packages (after Phase 1 lands)

- `rolos_packages` (name, code, description, `base_rate_plan_id`, `is_active`, `sell_standalone`, images) and `rolos_package_components` (`component_type`, amount or percentage, `revenue_stream`, quantity basis) with RLS + GRANTs.
- `ChargeCalculator` gains package expansion: applying a package to a reservation or block produces folio lines already tagged `accommodation` / `fnb` / `other`, so the F&B split and net accommodation KPIs shipped previously stay accurate.
- Packages management section under Rate Plans with a component builder, plus the ability to attach a package to a group block or an individual reservation.

## Phase 3 — Enterprise polish

Bulk group check-in/out, tokenised guest rooming-list portal capped at remaining blocked inventory, group contribution reporting (revenue, occupancy, ADR, F&B split) in PMSReports and Revenue Pulse, contractual attrition rules, distinct block visualisation on the Room Plan, TOBI knowledge + help articles, and full audit-log / permission-matrix entries.

## Technical notes

- No changes to `booking-orchestrator-api` availability contracts, `ManualBookingDialog`'s existing signature, or any external PMS adapter file.
- The inventory RPCs become the single writer for `blocked_units` / `booked_units`; the buggy inline increment in `create_reservation` is switched over to them in the same pass.
- Everything typed (no `any` on new code), shadcn/ui primitives only, files kept small and focused.

## Acceptance checks for Phase 1

1. Creating a block drops availability for that room type and date range in both the inventory calendar and the online availability the booking engine serves.
2. Picking up a room creates a real booking visible on the Room Plan and dashboard, and converts blocked → booked.
3. Releasing (manually or by night audit) restores availability and posts attrition when configured.
4. Master folio opens for 'master' / 'hybrid' groups; individual folios continue to work untouched.
5. Existing single-reservation, rate-plan, and adapter paths behave exactly as before.
