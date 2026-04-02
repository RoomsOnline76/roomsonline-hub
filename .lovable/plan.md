
Goal: determine whether duplicate property names are blocking creation for Carike (Fearless Leader), and fix the real blocker with full dev parity.

What I found
- Duplicate property names are not the blocker.
- The property form inserts directly into `properties` without any pre-check on `name`.
- `properties.slug` is auto-generated and made unique by `generate_property_slug(...)`, so duplicate names should become unique slugs like `tugela`, `tugela-1`, etc.
- Database check confirms a property named `Tugela` already exists, which means a second “Tugela” should still be possible from a naming perspective.
- There is no existing `Explores Club` property, so that one definitely should not be failing because of duplicates.

Most likely root cause
- The main `properties` INSERT policy already includes `fearless_leader`.
- But the post-create sync path for new ROL'OS properties writes to auxiliary tables right after the property insert:
  - `hostfully_room_types`
  - `rolos_room_types`
  - `rolos_rooms`
  - `rolos_rate_plans`
- Some of those RLS policies still allow only `admin` or `dev`, excluding `fearless_leader`.
- That matches the previous symptom you reported before: the property may insert successfully, but the later sync step fails and the UI shows “Failed to create property”.

Important evidence
- `src/pages/PropertyForm.tsx`
  - new property creation is:
    `supabase.from("properties").insert([propertyData]).select("id, slug").single()`
  - no duplicate-name validation exists
  - after insert, the form immediately syncs ROL'OS room/rate data into other tables
- `supabase/migrations/20260401165926_11a6bbf7...sql`
  - `properties` INSERT policy includes `fearless_leader`
- `supabase/migrations/20260308085613_b5185577...sql`
  - `rolos_room_types`, `rolos_rooms`, and `rolos_rate_plans` policies still mention only `admin` and `dev`
- Database read:
  - `Tugela` already exists
  - `Explores Club` does not exist
- Carike accounts:
  - `carike@roomsonline.co.za` = `fearless_leader`
  - `carike.ligthelm@gmail.com` = `user`
  - `sleepinafrica@roomsonline.co.za` = `user`

Conclusion
- No: duplicate names are not what is blocking her.
- Yes: the bigger risk is either:
  1. she is logged into one of the non-privileged Carike accounts, or
  2. the property insert succeeds, then the ROL'OS follow-up inserts fail because `fearless_leader` is still excluded in some table policies.

Implementation plan
1. Backend parity fix
- Update the remaining RLS policies on all property-creation-related PMS tables so `fearless_leader` is treated exactly like `dev`.
- Priority tables:
  - `rolos_room_types`
  - `rolos_rooms`
  - `rolos_rate_plans`
  - any adjacent ROL'OS tables touched during create flow if still missing parity

2. Audit-role parity fix
- Update `get_user_audit_role(...)` so `fearless_leader` is not downgraded to `owner`.
- If needed, extend the audit enum/logic so audit-triggered writes and logs treat fearless leader as privileged instead of owner.

3. Frontend error clarity
- Improve the create-property error handling in `PropertyForm.tsx` so the actual failing step is surfaced:
  - property insert failed
  - room sync failed
  - rate sync failed
  - RLS/permission failed
- This prevents a successful insert from being reported as a total failure.

4. Account mismatch guard
- Verify the current signed-in account in the auth/profile UI and make the role visible near create/edit actions.
- If desired, add a small admin-only “current backend role” badge to avoid repeating this confusion.

5. Verification after fix
- Test creating:
  - `Explores Club` as a fresh property
  - another `Tugela`-named property to confirm duplicate names are allowed and slug uniqueness handles it
- Confirm Carike can:
  - create property
  - edit owners
  - access billing
  - complete all property-edit functions with the same rights as dev

Technical notes
- Duplicate names: allowed
- Unique slug behavior:
```text
name = "Tugela"
existing slug = tugela
new slug should become tugela-1
```
- Current gap is not in the top-level `properties` insert, but in downstream synced tables and possibly audit-role classification.

Files likely to change
- `supabase/migrations/...` new migration to update missing RLS policies
- `supabase/migrations/...` new migration to update audit role handling
- `src/pages/PropertyForm.tsx` to improve step-specific error reporting

Expected outcome
- Fearless Leader will truly have dev parity for property creation and full property editing.
- Duplicate property names will continue to work safely through unique slug generation.
- Future failures, if any, will point to the exact blocked table/step instead of a generic “Failed to create property”.
