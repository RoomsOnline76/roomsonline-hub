# Complete Seesig RU readiness repair

## Goal

Remove the false Phase 2/3 blocker without deleting historical records or creating more duplicate units and rate links.

## Verified current state

- Seesig has nine authored room types in the property editor, but their canonical ROL'OS room-type rows and linked channel mirrors are inactive.
- The Rack plan exists once, but only 4 of its 47 historical links are active; the nine canonical links are currently soft-deleted.
- Eighteen physical room rows remain (duplicate uppercase/title-case pairs), and no reservation-room records currently reference Seesig room types.
- The readiness code now checks unit-level Min/Max Stay and supports local ROL'OS coverage when an empty live channel response follows a successful push.

## Changes

1. **Repair the nine canonical units**
   - Reactivate only the nine room types represented in the current property editor.
   - Reactivate their nine linked channel mirrors and preserve authored capacity, stay, image, facility, and type data.
   - Keep obsolete duplicate room-type and mirror rows inactive as audit history.

2. **Normalize physical room inventory**
   - Retain one physical room per authored unit and point it to the canonical room type.
   - Remove only the duplicate physical-room rows that have no reservation references.

3. **Restore Rack-plan coverage**
   - Reactivate exactly one Rack-plan link for each of the nine canonical room types.
   - Keep all stale links inactive and confirm no duplicate active link exists for any unit.

4. **Prevent recurrence and validate**
   - Confirm the property save path does not deactivate canonical units or recreate duplicate plans/links.
   - Run the shared readiness endpoint and verify: 9 active units, local priced availability, MinStay recognised, and no false `0 open days` blocker.
   - Re-run readiness after one normal property save to prove the repaired state remains stable.

## Technical details

- Apply the data repair through one transactional migration with explicit property and record IDs, assertions, and no broad name-only updates.
- Do not modify locked PMS adapter regions.
- Preserve the existing compatibility mirrors and inactive history; only canonical active state and links are corrected.
