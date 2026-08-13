# Manage Restrictions: edit, move, remove

Today restrictions can only be *created*. The Stop Sell / Min Stay / Max Stay / Lead Days dialogs write day rows and then close — there is no list of what is already in place, and no way to change a date range, fix a reason, or clear it again except by re-running the same dialog in "unblock" mode with the exact same dates.

This adds a Restrictions manager so existing restrictions can be reviewed, edited, moved and removed.

## What gets built

### 1. Restrictions list (new "Manage" entry in the Restrictions menu)
A dialog on the ROL'OS Dashboard and Rooms pages that lists every restriction currently in effect for the selected property/portfolio and visible date window, grouped into human-readable spans instead of one row per night:

```text
Blocked   Oester            14 – 21 Aug 2026 (8 nights)   By Dawie Kotze · Owner stay   [Edit] [Move] [Remove]
Min stay 3  All room types  20 Dec – 5 Jan 2027           Manual                        [Edit] [Move] [Remove]
Closed      Rate plan: BAR   1 – 4 Sep 2026               Rate plan closure             [Remove]
```

- Consecutive nights with identical settings collapse into one span per room type.
- Channel-sourced rows (Rentals United, NightsBridge, PMS) are shown read-only with their source label, since the channel owns them — attempting to edit them would be overwritten on the next sync.
- Filters: type (blocked / min stay / max stay / lead days / rate-plan closure), room type, and "only future".

### 2. Edit
Opens the span with its current values: type, room types, date range, reason, and the stay/lead number where applicable. Saving rewrites just that span — removing nights that fell out of the range and writing the ones that came in.

### 3. Move
A quick shift control (`-1 / +1 day`, `-1 / +1 week`, or pick a new start date) that keeps the length of the span and relocates it. Nights are deleted at the old position and written at the new one in one operation.

### 4. Remove
Deletes the span's nights (for blocks and rate-plan closures) or clears the restriction fields while leaving inventory intact (for min/max stay and lead days). A confirmation shows what will be cleared.

### 5. In-grid shortcut
Right-click (and long-press on mobile) a hatched blocked cell in the Dashboard room plan and Rooms multi-calendar opens the same edit sheet for that span directly, plus a one-click "Unblock these nights".

After any edit, move or remove, the change is pushed to the connected channels the same way creation already does, and the calendars refresh.

## Technical notes

- New `src/lib/restrictionSpans.ts`: groups `property_availability` rows (per `property_id` + `room_type`, ordered by `date`) into spans keyed by an identity hash of `is_stop_sell`, `minimum_stay`, `maximum_stay`, `lead_days_advance`, `lead_days_post`, `blocked_reason`, `external_system`; plus writers `applyRestrictionSpan`, `moveRestrictionSpan`, `removeRestrictionSpan` that upsert/delete on the existing `(property_id, room_type, date)` conflict target.
- Rate-plan closures come from `rolos_rate_plan_stop_sell` and are grouped the same way (delete-only).
- New `src/components/restrictions/RestrictionsManagerDialog.tsx` (list + filters) and `RestrictionSpanEditor.tsx` (edit/move form), reusing `PropertyScopeSelector` and the existing `currentBlockAttribution` stamping so edits re-record who changed them.
- Removal for min/max stay and lead days is an update that nulls those columns and keeps the row when it still carries inventory or a block; the row is deleted only when nothing meaningful remains.
- Channel push reuses `syncRestrictionsToChannels(propertyIds, "stop_sell")`; moves push both the old and new date windows.
- Wiring points: the existing Restrictions dropdown in `src/pages/pms/PMSDashboard.tsx`, a matching control on `src/pages/pms/PMSRooms.tsx`, and context-menu handlers in `RoomPlanGrid.tsx` / `RoomTypePlanGrid.tsx`.
- No schema change required.
