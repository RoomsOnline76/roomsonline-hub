

## Add Push_PutAvbUnits_RQ Enhancements to RU Sync

### Current State
- The `push_availability` action and XML builder **already exist** in `rentalsunited-api` and support `units`, `min_stay`, and `changeover` attributes.
- `pushARI` in `push-property-to-ru` already calls it with season-based periods covering 365 days (with a filler period to fill gaps).
- The cron job exists but runs **weekly** (`0 2 * * 0` = Sunday 2 AM). RU requires **daily**.
- **Changeover** is supported in the XML but never populated — it always defaults to omitting the attribute, which means RU uses its own default. There is no changeover preference stored in property data currently.

### Changes

**1. Change cron schedule from weekly to daily**
- Update the `cron.job` entry from `0 2 * * 0` (weekly Sunday) to `0 2 * * *` (daily at 2 AM).
- Uses `cron.alter_job` SQL via the insert tool (not migration, since it contains project-specific data).

**2. Add changeover default to availability push (`push-property-to-ru/index.ts`)**
- In `pushARI`, set `changeover: 3` (Both check-in and check-out allowed) as the default for all availability entries. This is the most flexible setting and matches ROL'OS's standard behavior.
- If a property has a `changeover` field in amenities, use that instead. This makes it extensible for future per-property configuration.
- Changeover values: `1` = CheckInOnly, `2` = CheckOutOnly, `3` = Both, `4` = NoActivity.

**3. Ensure 365-day minimum coverage with at least 1 available day**
- The current code already fills gaps to `oneYearStr`. Add a safety check: if no seasons exist at all, push a single entry covering today → today+365 with `units: 1`, `min_stay: 1`, `changeover: 3`. This guarantees at least 1 available day even for properties with no seasons configured.

### Files to Update
- `supabase/functions/push-property-to-ru/index.ts` — add changeover + fallback coverage
- Cron job SQL update via insert tool

### What This Does NOT Change
- No new UI fields (changeover preference can be added later)
- No changes to `rentalsunited-api/index.ts` (already supports changeover in XML)
- No schema/migration changes

