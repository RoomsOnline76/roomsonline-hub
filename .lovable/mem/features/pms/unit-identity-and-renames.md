---
name: Unit identity and renames
description: Units are matched by id (not name) when saving; a rename must update the existing channel listing, never create a second one
type: feature
---

Renaming a unit is an update to that unit, never a new unit.

- `PropertyForm` room persistence resolves the target `hostfully_room_types` row by `room.id` first. The normalised-name match is only a fallback for units that have never been persisted (case/whitespace tolerant).
- A save may not resolve two editor units to the same row (claimed-id set per save).
- Adoption guard: when a row would otherwise be inserted while an active row on the same property holds a channel listing id and is absent from the editor (by id and by name), that row is adopted as the rename instead. Prevents a stranded live listing plus a fresh duplicate listing.
- `hostfully_room_types` has a unique constraint on `(property_id, lower(btrim(name)))` — retire/rename the loser before renaming the survivor.
- Repair pattern for an existing duplicate: keep the row holding the live listing, rename it, retire the duplicate row (`is_active=false`, listing id cleared) and purge its listing via `channel-manager-entitlement` `purge_listing` (archived at the channel = terminal). Then fire a scoped `ru-static-delta` so the name lands on the surviving listing.
- Incident 2026-08-20: property "RU Name Change", Albatros — listing 5733060 kept and renamed, duplicate listing 5862186 archived.
