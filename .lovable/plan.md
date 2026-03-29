

# Sales Rep Dashboard — "My Referrals" Section

## Overview

When a user with the `sales_rep` role logs in, their `/dashboard/reports` page should show a dedicated "My Referrals" section with their referred properties, commission status, and banking details. Currently, `sales_rep` is not tracked in `useAuth` at all — the role exists in the DB enum but the auth hook ignores it.

## Changes

### 1. Track `sales_rep` role in useAuth

Add `isSalesRep` boolean to `useAuth`. When `roles.includes('sales_rep')`, set it true and look up the user's `sales_reps` record (by `user_id`) to get their `rep_id`.

Also add `'sales_rep'` to `UserRole` type in `permissions.ts` and update `computeUserRole` to return it when the user has no admin/dev roles but has `sales_rep`.

### 2. Create `SalesRepDashboard` component

A new component `src/components/dashboard/SalesRepDashboard.tsx` that renders when the user has `sales_rep` role. Contains three cards:

**My Referrals Card** — queries `property_referrals` where `rep_id` = user's rep ID, joined with `properties(name, is_active)`. Shows property name, referral date, status badge (lead/contracted/active/churned), and conversion date.

**Commission Summary Card** — queries `rep_commission_reports` where `rep_id` = user's rep ID. Shows current period total, lifetime earnings, latest report status (pending/approved/paid), and commission tier label from `sales_reps`.

**Banking Details Card** — uses existing `useRepBankDetails` hook with user's rep ID. Shows masked account number, bank name, verification status. Read-only display (editable only by admin).

### 3. Integrate into Dashboard page

In `src/pages/Dashboard.tsx`, detect `isSalesRep` from `useAuth`. If true and the user is NOT also an admin/dev, render `<SalesRepDashboard />` instead of (or above) the standard property reports dashboard. If they're both a sales rep AND an owner, show both sections.

### 4. Add RLS policy for rep self-access

The `property_referrals` and `rep_commission_reports` tables need SELECT policies allowing a rep to read their own records. Migration to add:

```sql
CREATE POLICY "Rep views own referrals" ON public.property_referrals
  FOR SELECT TO authenticated
  USING (rep_id IN (SELECT id FROM public.sales_reps WHERE user_id = auth.uid()));

CREATE POLICY "Rep views own commission reports" ON public.rep_commission_reports
  FOR SELECT TO authenticated
  USING (rep_id IN (SELECT id FROM public.sales_reps WHERE user_id = auth.uid()));
```

## Technical Details

- `sales_reps.user_id` links the rep record to `auth.users` — this is how we resolve the logged-in user's rep ID
- `property_referrals` has: `rep_id`, `property_id`, `status` (lead_source enum), `referral_date`, `converted_at`, `clawback_until`
- `rep_commission_reports` has: `rep_id`, `period_month`, `total_amount`, `total_entries`, `status` (pending/approved/paid)
- Existing `useRepBankDetails` hook already accepts a `repId` parameter — reuse it directly

## Files

| Action | File |
|--------|------|
| Migration | Add RLS SELECT policies for `property_referrals` and `rep_commission_reports` |
| Modify | `src/hooks/useAuth.tsx` — add `isSalesRep` + `salesRepId` state |
| Modify | `src/lib/permissions.ts` — add `sales_rep` to UserRole |
| Create | `src/components/dashboard/SalesRepDashboard.tsx` — referrals, commissions, banking cards |
| Modify | `src/pages/Dashboard.tsx` — conditionally render SalesRepDashboard |

