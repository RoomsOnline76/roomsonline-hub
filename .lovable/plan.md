

# Reorder Administration Menu Items

## Current Order (flat, no logical grouping)
Admin Dashboard, All Bookings, All Properties, Users, Payments, Contracts, Onboarding, Portfolios, Review Queue, Access Requests, Billing Defaults, Sales Reps, Commission Reports

## Proposed Order (grouped by workflow)

```text
── Administration ──────────────────────
   Admin Dashboard          (overview first)
   
   ── Properties ──
   All Properties           (core asset)
   All Bookings             (tied to properties)
   Onboarding               (new property pipeline)
   Contracts                (formalise relationship)
   Review Queue             (quality gate)
   Portfolios               (grouping/org)
   
   ── People ──
   Users                    (platform users)
   Access Requests          (user management)
   Sales Reps               (acquisition team)
   
   ── Finance ──
   Payments                 (transaction tracking)
   Billing Defaults         (rate config - dev)
   Commission Reports       (rep payouts)
```

## Change

**File**: `src/config/navigation.ts` — reorder the `items` array in `adminSection`:

1. Admin Dashboard
2. All Properties
3. All Bookings
4. Onboarding
5. Contracts
6. Review Queue
7. Portfolios
8. Users
9. Access Requests
10. Sales Reps
11. Payments
12. Billing Defaults
13. Commission Reports

This follows the natural admin workflow: overview → property lifecycle → people → money. No new files, no structural changes — just reordering the existing array.

