## Set Tiered Cancellation Policy for All ROL'OS Properties

### What This Does

Replaces the single-tier cancellation logic with a multi-tier system and sets the following default for all 32 active ROL'OS properties:


| Window                                  | Deposit Refund |
| --------------------------------------- | -------------- |
| >2 months (60 days) before check-in     | 100% refunded  |
| 1–2 months (30–60 days) before check-in | 50% refunded   |
| <1 month (30 days) before check-in      | 0% refunded    |


### Changes

**1. Data Update — All 32 ROL'OS property policies**
Update all existing `rolos_policies` rows (policy_type = 'cancellation') for ROL'OS properties with:

```json
{
  "mode": "standard",
  "non_refundable": false,
  "tiers": [
    { "days_before": 60, "forfeit_percent": 0 },
    { "days_before": 30, "forfeit_percent": 50 },
    { "days_before": 0, "forfeit_percent": 100 }
  ]
}
```

The `tiers` array is evaluated top-down: if days until check-in >= 60, use 0% forfeit; if >= 30, use 50%; otherwise 100%.

**2. `src/lib/policyFormatter.ts**`

- Add `tiers?: Array<{ days_before: number; forfeit_percent: number }>` to `CancellationRule`
- Update `formatCancellationPolicy` to check for `tiers` first: iterate tiers (sorted descending by `days_before`), find the matching tier based on days until check-in, and use that tier's `forfeit_percent`
- Generate a multi-line summary text describing all tiers

**3. `supabase/functions/experience-engine/index.ts**`

- Update the cancellation_policy evaluation block (lines 96–127) to handle `tiers`: same logic as the formatter — iterate tiers to find the applicable forfeit percentage based on days until check-in

**4. `src/components/property/PoliciesTab.tsx**`

- Add UI for managing tiers: a list of tier rows (days_before + forfeit_percent) with add/remove buttons
- When `tiers` is present, hide the single days_before/forfeit_percent fields and show the tiers editor instead
- Keep backward compatibility with single-tier rules

**5. `src/components/booking/CancelBookingModal.tsx` and `src/pages/GuestPortal.tsx**`

- No changes needed — these consume the `evaluation` object from the experience engine, which already returns `forfeit_percent`, `forfeit_amount`, `is_free_cancel`. The tiered logic is resolved server-side.

### Technical Notes

- Tiers are always sorted descending by `days_before` for evaluation
- The `days_before` and `forfeit_percent` root-level fields are kept for backward compatibility with any properties not using tiers
- `forfeit_percent: 0` means 100% deposit refunded; `forfeit_percent: 100` means 0% refunded

there already exist a cancellation UI capturing frame on page  /edit property/ house rules/ cancellation Policies. this update should merge/work with this  as this UI elelment is commopn for all properties in the system