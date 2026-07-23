## Problem

The "Widget — Tiered Commission" strategy shows no tier editor in **Admin → Billing Defaults**, and the tiered fields under a property's **Billing Config** also stay hidden for it. The billing engine (`calcWidget` in `supabase/functions/calculate-billing/index.ts`) already reads widget tiers, but from a different source than the other tiered strategies:

- `rolos_pms` / `volume_tiered` → **room-count tiers** stored as `tier_pricing_json` (min_rooms / max_rooms / monthly_fee). This is what `isTierStrategy()` gates and what `TierCriteriaEditor` edits.
- `widget` → **monthly-booking-volume tiers** stored as JSON rows in `billing_mappings` (`strategy='widget'`, `field='tier_threshold'`, `value='{"0":10,"20":8,"50":6}'` — threshold → commission %). There is currently no UI anywhere to edit this table.

So the tiers exist in the engine but there is no admin surface to configure them.

## Plan

1. **New editor component** `src/components/admin/billing/WidgetTierEditor.tsx`
   - Rows of `{ min_bookings_per_month, commission_rate_pct }` with add/remove.
   - Reads and writes `billing_mappings` where `strategy='widget'` and `field='tier_threshold'` (single row whose `value` is the threshold→rate JSON the edge function already parses — no schema change).
   - Save serialises the rows back to the same `{ threshold: rate }` shape.

2. **Global defaults page** `src/pages/AdminBillingDefaults.tsx`
   - In the widget strategy card, render `<WidgetTierEditor />` alongside the existing commission/subscription fields (independent of `isTierStrategy`, which stays room-count only).
   - Update the strategy description to say "volume-based commission tiers, editable below".

3. **Per-property page** `src/components/property/BillingConfigTab.tsx`
   - Under the widget strategy, show a read-only summary of the current global widget tiers with a link to Admin Billing Defaults (tiers stay global for widget — matches how `calcWidget` reads them).

4. **Admin overview** `src/components/property/AdminOverviewTab.tsx`
   - In the "Billing Model" section for widget properties, render the resolved current tier and monthly-volume threshold (using the same JSON) so admins can see which rate is active.

5. No database migration required — `billing_mappings` already has `(strategy, field, value)` and RLS.

## Technical notes

- `TIER_STRATEGIES` in `src/lib/billingTierResolver.ts` stays unchanged; room-count tier logic is not applied to widget.
- The widget JSON kept as-is (`{ threshold: rate }`) so the edge function needs no changes.
- Editor upserts one `billing_mappings` row keyed on `(strategy='widget', field='tier_threshold')`.

## Out of scope

- Per-property widget tier overrides (raise as a follow-up if wanted).
- Backfilling default widget tiers into `billing_mappings` for existing installs — the editor will seed defaults on first save.
