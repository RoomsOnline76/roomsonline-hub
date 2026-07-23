## Goal
1. Rewrite the seven billing strategy dropdown labels/descriptions in **/edit property → Admin → Billing Config** so each option accurately reflects the current v3 billing matrix (setup fees, monthly base, per-unit, commission split).
2. Add an **Estimated Cost to Client** panel to the **Admin → Overview** tab summarising the recurring monthly and once-off charges *excluding* variable commission/transaction fees.

## Changes

### 1. `src/components/property/BillingConfigTab.tsx`
Update the `STRATEGIES` array (lines 21–28) with clearer, matrix-aligned descriptions. Proposed copy:

| value | label | description |
|---|---|---|
| default | Default — Listing Commission | 10% on direct bookings via ROL widgets. No fixed fees. |
| widget | Widget — Tiered Commission | Commission scales down with monthly booking volume. No monthly fee. |
| rolos_pms | ROL'OS PMS — Subscription | Monthly base + R60/unit channel manager. Reduced 2% PMS commission. |
| portfolio_aggregator | Portfolio Aggregator | Discounted rate for multi-property owners (shared subscription, blended commission). |
| enterprise_white_label | Enterprise White-Label | Flat monthly licence + setup fee. Zero commission on bookings. |
| volume_tiered | Volume Tiered (Per Unit) | Sliding R/unit/month based on total active units. No commission. |
| payment_facilitator | Payment Facilitator Only | No listing/PMS fees. Charges only the payment transaction fee on Rooms Online PayFast. |

Also refresh the mirrored label maps in:
- `src/pages/AdminBillingDefaults.tsx` (lines 22–27)
- `src/components/property/AdminOverviewTab.tsx` (lines 28–35, add `payment_facilitator`)

### 2. `src/components/property/AdminOverviewTab.tsx` — add Cost Estimate card
Insert a new card above "Property Flags" titled **Estimated Client Cost** with:
- **Monthly recurring (excl. commission):** sum of
  - `subscription_fee_monthly` (if strategy uses it)
  - `channel_manager_per_unit_fee × active_unit_count` for `rolos_pms`
  - `white_label_monthly_fee` (if white-label active)
  - `pricelabs_monthly_fee` (if pricelabs allowed)
  - `volume_tiered` per-unit computed monthly
- **Once-off setup:** sum of white-label setup fee + any strategy setup fee from `property_billing_configs` / defaults.
- Small breakdown list (one row per component) so admins see composition.
- Footer note: *"Excludes commission and per-transaction payment fees."*

Fetch active unit count via existing hook or a light query on `rolos_rooms`/`hostfully_room_types` (mirrors Dashboard logic) — reuse existing `useBillingConfig` values; extend `wlDomain` query to also select `white_label_setup_fee`, `channel_manager_per_unit_fee`, and any strategy-specific setup field already present.

No schema changes; purely UI/derivation.

## Out of scope
- No backend billing-engine changes.
- No changes to how fees are actually invoiced — only the descriptive UI and the admin-facing estimate.
