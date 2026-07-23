# PriceLabs Revenue Management Integration

Automate dynamic pricing intelligence for ROLOS PMS properties via the PriceLabs IAPI. Owners see AI-driven suggested rates in Rate Manager and choose whether to apply them — ROLOS remains the source of truth.

## Architecture

```text
ROLOS property  ──(push listings + reservations + calendar)──▶  PriceLabs
                ◀──(pull suggested prices via /get_prices)────
                ▼
        Rate Manager UI shows: Current | Suggested (Δ%, occupancy signal)
                ▼
        Owner clicks "Apply" (single date, range, or bulk) → rolos_rate_prices updated
```

Suggestions never mutate `rolos_rate_prices` automatically. A per-property auto-apply switch may be enabled later.

## Credentials model (admin decides)

- **Global**: `PRICELABS_INTEGRATION_NAME` / `PRICELABS_INTEGRATION_TOKEN` (existing env in `pricelabs-api`) used as default.
- **Per-property override**: stored in `integration_configs` (system=`pricelabs`, `property_id`, config=`{integration_name, integration_token}`).
- The existing `pricelabs-api` edge function already reads global creds — extend `getCreds()` to accept an optional `property_id` and prefer the row scoped to that property.

## Rate-plan scope (admin-configurable per property)

Add a JSON column `pricelabs_config` to `properties`:

```json
{
  "enabled": true,
  "managed_rate_plan_ids": ["<uuid>", "<uuid>"],
  "managed_room_type_ids": ["<uuid>"],
  "auto_apply": false,
  "min_price_floor": 850,
  "max_price_ceiling": 4500,
  "last_pull_at": "..."
}
```

Admins toggle which rooms/rate plans PriceLabs drives inside **ROLOS → Rate Manager → PriceLabs** (new sub-tab).

## Database changes (single migration)

1. `ALTER TABLE properties ADD COLUMN pricelabs_config JSONB DEFAULT '{}'::jsonb`.
2. New table `pricelabs_price_suggestions`:
   - `property_id`, `room_type_id`, `rate_plan_id`, `date`, `suggested_price`, `current_price`, `occupancy`, `demand_signal`, `pulled_at`, `applied_at`, `applied_by`.
   - Unique on (`property_id`, `room_type_id`, `rate_plan_id`, `date`).
   - RLS: admin/dev + property staff can read; only admin/dev can write. Full GRANTs to authenticated + service_role.
3. Reuse existing `integration_configs` for per-property tokens.

## Edge function changes

**Extend `supabase/functions/pricelabs-api/index.ts`:**
- New action `sync_property_to_pricelabs` — builds listings payload from `rolos_room_types` + `properties`, calls `push_listings`, then `push_reservations` (last 730 days from `rolos_reservations`) and `push_calendar` (365-day forward inventory from `rolos_inventory_calendar`).
- New action `pull_price_suggestions` — calls `/get_prices` for the property's listing IDs, upserts into `pricelabs_price_suggestions`, updates `pricelabs_config.last_pull_at`.
- New action `apply_suggestions` — accepts `{property_id, suggestion_ids[]}`, writes to `rolos_rate_prices` respecting `min_price_floor`/`max_price_ceiling`, stamps `applied_at`/`applied_by`.
- `getCreds(property_id?)` prefers per-property credentials.

**New cron:** `cron-pull-pricelabs-suggestions` — daily 04:00 UTC, iterates properties where `pricelabs_config.enabled = true` and calls `pull_price_suggestions`.

**Webhook (`pricelabs-webhook`)** — already exists; add handler to trigger a targeted `pull_price_suggestions` when PriceLabs signals recalculation for a listing.

## Frontend changes (ROLOS only)

1. **Rate Manager → new "PriceLabs" tab** (`src/pages/pms/PMSRatePlans.tsx` or dedicated `PMSPriceLabs.tsx`):
   - Enable toggle, credential mode (global/custom), managed rate-plan multiselect, floor/ceiling inputs, auto-apply switch (default off).
   - "Push property to PriceLabs" button (calls `sync_property_to_pricelabs`).
   - Suggestions table: room type × date grid, current vs suggested, Δ%, occupancy heat, per-row and bulk **Apply** buttons.
   - "Pull latest" manual refresh.
2. **Admin gating** (`src/pages/PropertyForm.tsx` → Admin tab): switch `pricelabs_enabled` at property level so non-admin owners only see the feature when admin allows.

## Files touched (estimate)

- `supabase/migrations/<ts>_pricelabs_suggestions.sql` (new)
- `supabase/functions/pricelabs-api/index.ts` (extend)
- `supabase/functions/pricelabs-webhook/index.ts` (extend)
- `supabase/functions/cron-pull-pricelabs-suggestions/index.ts` (new)
- `src/pages/pms/PMSPriceLabs.tsx` (new) + route + nav entry
- `src/components/property/AdminOverviewTab.tsx` / Admin tab (add gating toggle)
- Docs: `docs/pricelabs-integration.md`

## Out of scope (for later iteration)

- Auto-apply without owner review (flag exists but UI hidden).
- Portfolio-level PriceLabs strategy roll-ups.
- Feeding PriceLabs occupancy from non-ROLOS PMS (Hostfully, RU) — future phase.
