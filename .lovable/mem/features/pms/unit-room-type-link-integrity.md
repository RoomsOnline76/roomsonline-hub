---
name: Unit ↔ room-type link integrity
description: Dangling hostfully_room_types.linked_rolos_id breaks all rate tiers; repaired by name on room-type sync
type: feature
---
Every rate tier (calendar season, plan season rate, rack, unit daily) is keyed off
`hostfully_room_types.linked_rolos_id`. When a ROL'OS room type is replaced/retired the link
dangles and the unit silently prices nothing — surfaced downstream as a false
"no rates for 365 days" / Pricing 365d blocker.

Rules:
- `repairUnitRoomTypeLinks(propertyId)` in `src/lib/pmsRoomTypeSync.ts` runs after every room-type
  sync and re-points dangling links to the active room type with the same (normalised) name.
- Readiness must report a dangling link as its own blocker, never as missing rates.
- Channel currency: a channel "already set" answer (status 339) IS a read-back — record
  `ru_reported_currency_iso` + `verified_at`, otherwise listings that were correct from the start
  stay permanently "currency unverified" and block go-live.
