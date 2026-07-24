## Problem

On `/admin/billing-defaults`, opening the **ROL'OS PMS — Subscription** preset, enabling **Listing commission**, entering a %, and clicking Save does not persist. Additionally, the current label/description is too generic — this specific commission is what ROL earns when a booking comes through our own OTA (`book.sleepinafrica.roomsonline.co.za`), not a generic "listing".

## Root cause (confirmed via `pg_policy` on `billing_global_defaults`)

Two policies exist:

- `Admins and devs can view billing defaults` — SELECT only, granted to admin/dev/fearless_leader.
- `Admins can manage billing defaults` — ALL, but the `USING` / `WITH CHECK` clauses only allow `dev` and `fearless_leader` (admin is excluded despite the policy name).

So an `admin` user can open the preset and edit the form, but the UPDATE is blocked by RLS and the row keeps its `default_commission_rate = NULL`. That matches what we see in the DB for `strategy='rolos_pms'`.

## Changes

### 1. Fix RLS so admins can actually save presets

New migration that rewrites the manage policy to include `admin` alongside `dev` and `fearless_leader`, matching the intent of its name:

```sql
DROP POLICY "Admins can manage billing defaults" ON public.billing_global_defaults;
CREATE POLICY "Admins can manage billing defaults"
  ON public.billing_global_defaults
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'fearless_leader')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'fearless_leader')
  );
```

### 2. Reword the field in `BillingConfigBuilder.tsx`

In `src/components/admin/billing/BillingConfigBuilder.tsx` (the row at ~line 148):

- Title: **"OTA listing commission"**
- Description: **"Flat % ROL earns on bookings made through ROL's own OTA (e.g. `book.sleepinafrica.roomsonline.co.za`). Does not apply to widget/WBE, WordPress or channel-sourced bookings — those use their own commission/fee models below."**

Also update the matching in-code comment (`// Listing commission (flat %)` → `// OTA listing commission (flat %)`) so future readers aren't misled.

### 3. Verify

After the migration + edit:

- Query `billing_global_defaults` for `strategy='rolos_pms'` after saving via the UI and confirm `default_commission_rate` now stores the value.
- Confirm the new copy renders on `/admin/billing-defaults` and on the property-level Billing tab (same component, same wording).

## Out of scope

No changes to the property-level `property_billing_configs` policies (those already allow admin writes), no changes to how the value is consumed by `calculate-billing` (it already reads `commission_rate` correctly), and no changes to the widget flat/tiered rows.
