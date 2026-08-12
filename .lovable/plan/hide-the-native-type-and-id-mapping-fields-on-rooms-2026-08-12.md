# Hide the native "Type" and "ID" mapping fields on Rooms

## What you're seeing

In Setup / Edit Property → Rooms there is a two-field row labelled `<PMS> Type` and `<PMS> ID`. The labels are generated from the connected system's name, so on a ROL'OS-native property they read "Roomsonline Type" / "Roomsonline ID" (the screenshot value "Seester" was just leftover free text).

These two boxes are the external-system mapping pair (`pmsRoomType` / `pmsRoomId`) on each room type. They are meaningful only when the property is fed by an outside system — they carry that system's room-type name and room ID so pushes and pulls match the right unit. On a native property there is no external system to map to, so the row is exactly the artifact you describe.

## Change

- Show the mapping row only when the property is connected to a genuine external system.
- Hide it for native ROL'OS properties (and when nothing is connected), so the Rooms panel goes straight from the room basics to Description.
- Keep the stored values untouched — nothing is deleted, so a property that is later connected to an external system still has its mapping intact.
- Label the row "Channel Manager room type" / "Channel Manager room ID" style naming stays vendor-neutral where the connected system is the channel manager, per the existing channel vocabulary rules.

## Technical notes

- `src/components/property/RoomManagerTab.tsx` (~lines 706-733): gate the mapping grid on `selectedPMS && !isRolProperty` instead of `selectedPMS` alone. `isRolProperty` is already a prop and is used elsewhere in the file for the same purpose.
- No schema or data migration; `amenities.room_types[].pmsRoomType` / `.pmsRoomId` stay as-is and continue to hydrate in `src/pages/PropertyForm.tsx`.
