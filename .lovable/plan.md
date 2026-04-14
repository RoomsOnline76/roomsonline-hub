

## Add Editable RU ID per Unit

### What
Make each unit's RU ID clickable and editable — matching the same inline edit pattern used for the property/building RU ID (click badge → input + save/cancel buttons). This lets you manually set or correct a unit's RU property ID directly from the UI.

### Changes

**File: `src/components/property/PushToRentalsUnited.tsx`**

1. Add state for tracking which unit is being edited and draft values:
   - `editingUnitRuId: string | null` (room_type_id being edited)
   - `unitRuIdDraft: string`
   - `savingUnitRuId: boolean`

2. Add a `saveUnitRuId` function that updates `hostfully_room_types.rentalsunited_property_id` for the given room type ID, similar to the existing `saveRuId` function.

3. In the units list (line 291-304), replace the read-only `RU: {unit.ru_property_id}` badge with the same click-to-edit pattern:
   - Default: clickable badge showing `RU: {id}` or "No RU ID — click to set"
   - Editing: small input + save/cancel buttons (same as lines 219-234)
   - After save: update the unit in local `units` state so it reflects immediately

No backend or schema changes needed — `rentalsunited_property_id` column already exists on `hostfully_room_types`.

