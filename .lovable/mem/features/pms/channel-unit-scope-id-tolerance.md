---
name: Channel Unit Scope Id Tolerance
description: only_unit_ids on channel deltas may carry ROL'OS room type ids or channel unit ids; a scope that matches nothing must never become a no-op push
type: feature
---
`only_unit_ids` on any push-property-to-ru delta is matched against both `hostfully_room_types.id`
and `hostfully_room_types.linked_rolos_id`, because Rate Plans links are authored against ROL'OS
room types. If the scope matches no active unit, the push falls back to all active units and logs a
warning — it must never resolve to zero targets and report `RU_NOT_LISTED`, which silently left the
channel on the old prices after a rate edit.
