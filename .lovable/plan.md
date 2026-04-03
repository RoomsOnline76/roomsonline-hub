

# Implement Accommodation Specials — Dedicated DB Table + Full UI

## Problem
The "Accommodation Specials" sub-tab under Specials shows "coming soon". Specials data entered during onboarding has nowhere to persist. The conference specials UI exists but uses local state only (not saved to DB either). Both accommodation and event/wedding specials need a proper backend.

## Solution

### 1. Create `property_specials` table

```sql
CREATE TABLE public.property_specials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'accommodation', -- accommodation, conference, event_wedding
  name text NOT NULL,
  description text,
  special_type text NOT NULL DEFAULT 'discount', -- discount, fixed_off, fixed_price, package
  discount_percent numeric,
  fixed_amount numeric,
  fixed_price numeric,
  currency text DEFAULT 'ZAR',
  valid_from date,
  valid_to date,
  min_stay integer,
  max_stay integer,
  applicable_room_ids uuid[],  -- which room types this applies to (null = all)
  included_items jsonb,        -- for package deals: meals, activities, etc.
  terms text,
  images jsonb,
  is_active boolean DEFAULT true,
  is_public boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.property_specials ENABLE ROW LEVEL SECURITY;

-- RLS: owners, linked owners, admins, devs can CRUD
CREATE POLICY "Property specials access" ON public.property_specials
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.is_property_owner(property_id, auth.uid()) OR
    public.is_linked_owner(property_id, auth.uid())
  );

-- Public read for active specials (booking engine)
CREATE POLICY "Public read active specials" ON public.property_specials
  FOR SELECT TO anon
  USING (is_active = true AND is_public = true);

CREATE TRIGGER update_property_specials_updated_at
  BEFORE UPDATE ON public.property_specials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2. Create `AccommodationSpecialsTab` component

New file: `src/components/property/AccommodationSpecialsTab.tsx`

- Props: `propertyId`, `roomTypes` (for room selection), `seasons` (to link specials to seasons)
- Fetches specials from `property_specials` where `category = 'accommodation'`
- Left sidebar list of specials (same pattern as conference specials UI)
- Inline editor with fields:
  - Name, description, terms & conditions
  - Type selector: Discount % / Fixed Off / Fixed Price / Package
  - Conditional fields based on type (discount_percent, fixed_amount, fixed_price)
  - Date range (valid_from, valid_to)
  - Min/max stay
  - Applicable rooms (multi-select from property's room types, "All" option)
  - Package inclusions (free-text list for meals, activities, etc.)
  - Images upload
  - Active/Public toggles
- CRUD operations via Supabase client

### 3. Wire into PropertyForm

Replace the "coming soon" placeholder for `accommodations` category with `<AccommodationSpecialsTab>`. Same component can be reused for `event-wedding` category by passing `category="event_wedding"`.

### 4. Booking engine integration

The `QuickBookDrawer` pricing logic can check `property_specials` for applicable active specials during the selected dates and apply the best discount/price automatically or show available specials to the guest.

## Files to Create/Modify

| File | Action |
|------|--------|
| Migration | Create `property_specials` table with RLS |
| `src/components/property/AccommodationSpecialsTab.tsx` | Create — full CRUD component |
| `src/pages/PropertyForm.tsx` | Replace "coming soon" placeholders with new component |

