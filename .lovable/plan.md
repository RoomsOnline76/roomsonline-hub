

# Admin Voucher Management + PMS Adapter Integration

## Summary
Add a "Vouchers" sub-tab to the property form's Specials tab for CRUD management of promo codes, and extend PMS adapters that support promo/discount APIs.

## PMS Adapter Audit Results
| Adapter | Promo/Voucher API Support | Action |
|---------|--------------------------|--------|
| **Hostfully** | No promo/coupon endpoints in their API | None |
| **Benson** | `voucher` field on reservations (booking reference, not promo codes) | None — it's a booking voucher, not a discount code |
| **ROL'OS PMS** | `voucher` field on reservations (same — booking reference) | None |
| **Cloudbeds** | No promo endpoints found | None |
| **Checkfront** | No promo endpoints found | None |
| **Little Hotelier** | No promo endpoints found | None |
| **HotelBeds** | No promo endpoints found | None |
| **RentalsUnited** | No promo endpoints found | None |
| **NightsBridge** | No promo endpoints found | None |

**Conclusion**: None of the current PMS adapters expose a promo/discount code API. The `voucher` field in Benson and ROL'OS PMS is a reservation reference number, not a promotional discount. Voucher/promo management is ROL'OS-only for now.

## Changes

### 1. New component: `src/components/property/PromoCodesTab.tsx`
A self-contained CRUD component for managing promo codes per property:
- **List view**: Table showing code, discount, validity dates, uses, status (active/inactive toggle)
- **Add/Edit dialog**: Form with fields for code (auto-uppercase), discount type (percentage/fixed), discount value, description, valid_from, valid_until, max_uses, conditions checkboxes (non_refundable, min_nights)
- **Delete**: With confirmation
- **Data**: Fetches from `promo_codes` table filtered by `property_id`
- Uses `supabase` client directly with React Query for CRUD

### 2. Modify: `src/pages/PropertyForm.tsx`
- Add "Vouchers" as a new sub-tab inside the existing **Specials** tab (alongside Accommodations, Conference, Event/Wedding)
- Add `<TabsTrigger value="vouchers">Vouchers</TabsTrigger>` to the Specials sub-tabs
- Render `<PromoCodesTab propertyId={propertyId} />` when `specialsCategory === "vouchers"`

### 3. RLS policy update
The existing `promo_codes` table needs an **authenticated write** policy so property owners can manage their own codes:
```sql
CREATE POLICY "Owners can manage their promo codes"
ON public.promo_codes FOR ALL TO authenticated
USING (
  property_id IN (
    SELECT id FROM public.properties WHERE owner_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
)
WITH CHECK (
  property_id IN (
    SELECT id FROM public.properties WHERE owner_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
);
```

### 4. Edge function: No changes needed
The `validate-voucher` function already handles validation. No PMS adapters support promo code APIs, so no adapter changes required.

## PromoCodesTab UI Layout
```text
┌──────────────────────────────────────────────┐
│ [+ Add Voucher Code]                         │
├──────┬────────┬───────────┬──────┬──────┬────┤
│ Code │ Type   │ Value     │ Used │ Max  │ ⚙  │
├──────┼────────┼───────────┼──────┼──────┼────┤
│ NR15 │ %      │ 15%       │ 3    │ 100  │ ✏🗑│
│ FLAT │ Fixed  │ R 500     │ 0    │ —    │ ✏🗑│
└──────┴────────┴───────────┴──────┴──────┴────┘
```

