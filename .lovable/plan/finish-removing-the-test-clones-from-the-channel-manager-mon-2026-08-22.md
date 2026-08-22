# Finish removing the test clones from the Channel Manager monitor

## Why they are still there (verified)

The earlier clean-up cleared the property-level channel fields, but the unit records kept their channel listing ids:

- RU Test Clone B — 4 units, all 4 still hold a listing id
- RU Test Clone C — 10 units, 9 still hold a listing id
- RU Test Clone D — 4 units, all 4 still hold a listing id

That is exactly the 4 / 9 / 4 = 17 "Duplicates" shown, and it is also why the three rows still appear at all: the monitor lists any property that has a channel footprint (a unit listing id, a building listing id, or `ru_archived = true`). All three are still flagged `ru_archived = true`, so they render as "Archived" with an "Activate & sync" button.

RU IT Blank Slate has no listing ids and is already absent from the footprint — nothing to do there.

## What to change

One data clean-up for the three clones (Clone B, C, D):

- Clear the channel listing id on every unit record, so the 17 duplicates drop to zero.
- Clear the building-level listing id and the archived flags (`ru_archived`, `ru_archived_at`), so the properties no longer register a channel footprint and disappear from the "Properties on the Channel Manager" table and from the billable/duplicate counters.
- Leave `is_active = true` and every local detail (units, rates, images) untouched — they stay ordinary local properties in Properties.

Nothing is pushed to the channel: OwnerID 741765 is already in the retired registry, so no call is made to it. Whatever remains upstream in that dead test account stays where it is.

## Technical detail

Data-only, no schema and no code change:

- `UPDATE hostfully_room_types SET rentalsunited_property_id = NULL WHERE property_id IN (700a9471…, 0079ba7c…, c7351c08…)`
- `UPDATE properties SET rentalsunited_property_id = NULL, ru_archived = false, ru_archived_at = NULL, ru_push_enabled = false WHERE id IN (same three)`
- Delete any residual `ru_archive_events` rows for those properties so the archive log stops referencing them.

Verification: re-read the three properties and their units for null listing ids, then confirm the monitor header reads 5 of 5 properties with 0 duplicates.
