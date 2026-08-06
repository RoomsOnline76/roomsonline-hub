# Dashboard restrictions → Rentals United push

Short answer: **no.** Restrictions set from the ROL'OS dashboard are not pushed to Rentals United today, and the Min Stay dialog does not even save correctly.

## What I verified

- The dashboard "Restrictions" menu (Stop Sell, Min Stay, Max Stay, Lead Days Advance/Post) opens dialogs that write straight to the availability table and nothing else — no RU call, no queue, no flag (`BulkStopSellDialog`, `BulkMinimumStayDialog`, `BulkAvailabilityRuleDialog`).
- The RU availability push (`Push_PutAvbUnits_RQ`) does support `<U>` units, `<MS>` min stay, `<MX>` max stay and `<C>` changeover — but the caller builds those values only from the property's authored seasons (`minStay` per season) and the unit count. It never reads the availability table, so manual stop sells and manual min/max stay are invisible to RU.
- Rate-plan level stop sells (stored separately) are also never sent to RU.
- The Min Stay dialog writes a column name that does not exist on the table (`min_stay` vs `minimum_stay`), so that save fails outright. Confirmed in the database: 2186 availability rows, **0** with a minimum stay and **0** with a maximum stay, while 35 stop-sell rows exist.

## What to build

**1. Fix the Min Stay save (bug)**
Write `minimum_stay` (not `min_stay`) in the Min Stay dialog. Also add Max Stay / Lead Days dialogs writing `maximum_stay`, `lead_days_advance`, `lead_days_post` if they currently reuse the units-only dialog.

**2. Make the manual restriction layer authoritative for the RU push**
In the RU ARI push, after building the rolling 365-day window from seasons, overlay the manual restrictions per date:
- `is_stop_sell` or `available_units = 0` → `<U>0</U>` for that date
- `minimum_stay` → overrides the season `<MS>`
- `maximum_stay` → overrides the default `<MX>`
- keep changeover resolution as-is
Manual rows win over season-derived values; dates with no manual row keep today's behaviour. Recompress adjacent identical dates so the payload stays small.

**3. Push immediately when a restriction is saved**
After a successful save in each restriction dialog, trigger an ARI refresh for the affected properties (scoped to the edited date range) so RU reflects the change within seconds instead of waiting for the 6-hour cron. Show a small "Syncing to channels…" → "Synced" toast, and surface a clear failure toast (with the RU message) if the push is rejected.

**4. Visible sync state**
Record the push result (success/partial/error, RU status) in the existing integration log so the RU Sync/Coverage screens show restriction pushes alongside availability and price pushes. Reuse the existing verification read-back that compares requested vs returned `min_stay`/`changeover`/`units` so a silent RU rejection is caught.

## Technical notes

- Files: `src/components/BulkMinimumStayDialog.tsx`, `BulkStopSellDialog.tsx`, `BulkAvailabilityRuleDialog.tsx`, `src/pages/pms/PMSDashboard.tsx`, `supabase/functions/push-property-to-ru/index.ts` (`pushARI` / `normalizeAvailabilityWindow` / `expandAvailability`), `supabase/functions/cron-refresh-ru-ari`.
- `push-property-to-ru` is in the adapter-lock area for inventory resolution; the change is additive (overlay only, unit-type inventory source unchanged) and needs your go-ahead in this same approval.
- Multi-unit properties: manual stop sell is stored per room type, so the overlay must map room type → RU unit before zeroing units, otherwise blocking one room type would close the whole property.
- Rate-plan stop sells have no RU equivalent at unit level; they stay ROL'OS/WBE-only and I will label them as such in the dialog.
