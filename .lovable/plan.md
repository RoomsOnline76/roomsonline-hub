# Groups & Packages — close the remaining gaps

Two of the points raised check out differently against the code, so the plan starts by correcting those and then does the real remaining work.

## Verified now

- Night audit **does** call the auto-release: `pms-night-audit` invokes `pms-groups` with `group_release_due_blocks` per property. No gap there — nothing to add.
- Group contribution reporting **already exists**: `GroupPerformancePanel` is rendered from the Reports page. Phase 3 reporting is largely done.
- `expandPackage` is used only in `pms-groups`, `PackagesManager` and the shared helpers. `ManualBookingDialog` has **no** package wiring — this gap is real.

## 1. Packages on normal (non-group) bookings

Give the ordinary booking path the same treatment group pickup gets:

- Add an optional package selector to the manual booking dialog (reuse the existing active-packages hook and the pattern already in the pickup dialog).
- On save, after the booking and its room rows exist, expand the package server-side through the same shared helper so folio lines land tagged `accommodation` / `fnb` / `other` with `is_included_in_rate` respected, and add-on components lift the booking total.
- Store the chosen package on the booking room line so re-applying charges or the night audit does not double-post; expansion stays idempotent.
- Also expose the selector where a package is applied to an existing reservation from the folio tab, so stays booked before a package existed can be attached.

## 2. Acceptance run with numbers

Execute the five checks from the verification plan on one test property and report pass/fail with observed values:

1. Block creation drops both the inventory calendar and the availability the engine serves.
2. Pickup creates a real booking visible on the Room Plan and Room Type Plan; blocked → booked, no net availability change.
3. Manual release and night-audit release restore availability; attrition posts once and only when configured.
4. Master / hybrid groups get a group-scoped folio; individual groups keep per-booking folios.
5. A normal single reservation still moves inventory by exactly the right amount, and rate plans plus the breakfast/F&B split are unchanged.

Test data is created and cleaned up afterwards (blocks released, bookings and folio lines removed, inventory restored).

## 3. Operational hardening

- **Pickup atomicity:** if folio or package posting fails after the booking is created, roll the pickup back (delete the booking + room row, restore `picked_up_count` and blocked/booked units) instead of only logging.
- **Concurrent block creates:** move the capacity check inside the inventory routine so the guard and the write happen in one statement, removing the read-then-write race between two simultaneous block creates.
- **Payment status:** derive pickup `payment_status` from the group's billing mode *and* deposit state rather than the current pending/invoiced shortcut.

## 4. Room Plan block visualisation

Render group-held nights distinctly on the Room Plan (hatched/held styling with the group name on hover) so staff can see held vs booked vs free at a glance. Presentation only — no changes to how blocks are stored.

## Out of scope

External PMS adapters, `booking-orchestrator-api` availability contracts, and the locked adapter regions stay untouched. NightsBridge-style ingest mapping of inclusive rates remains deferred.

## Technical notes

- Inventory routines remain the single writer of `blocked_units` / `booked_units`; the cache stays derived from the calendar.
- Package expansion keeps one implementation shared between client preview and edge functions.
- New code fully typed, shadcn primitives only, files kept small.
