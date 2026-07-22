## Goal
Close the three static-content gaps identified in the API checklist by adding dedicated, read-only actions to `roomsonline-pms-api`:
1. Cancellation policies
2. Accepted payment methods
3. Property contact details (landlord / reception)

## Current state (verified)
- `roomsonline-pms-api` already exposes property core data, room types, rates, availability, reservations, folios, etc.
- Cancellation data lives in `rolos_reservation_policies` and `hostfully_room_types.cancellation_policy`, but no API action returns it.
- Payment configuration lives in `properties.payment_providers` (text array) and `payment_gateway_registry`, but no API action lists accepted methods.
- Contact data is fragmented (`properties.owner_email`, `amenities.contact_email`, `property_staff`). There is no public, structured contact-details API.

## Proposed changes

### 1. Database: structured property contact details
Create a new table `property_contact_details` so contact info is explicit, multi-role, and public/private controllable.

```sql
CREATE TABLE public.property_contact_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('reception','landlord','emergency','manager','concierge')),
  name TEXT,
  email TEXT,
  phone TEXT,
  hours TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_contact_details TO authenticated;
GRANT ALL ON public.property_contact_details TO service_role;
GRANT SELECT ON public.property_contact_details TO anon;

ALTER TABLE public.property_contact_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view public contact details"
  ON public.property_contact_details FOR SELECT TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "Owners/admins can manage contact details"
  ON public.property_contact_details FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.has_role(auth.uid(), 'fearless_leader') OR
    public.is_property_owner(property_id, auth.uid()) OR
    public.is_linked_owner(property_id, auth.uid())
  );
```

Also add an `updated_at` trigger.

### 2. Edge function: three new API actions in `roomsonline-pms-api`
Add to the allowed `actions` set and implement handlers:

#### `get_cancellation_policies`
- Input: `propertyId` (required)
- Returns all `rolos_reservation_policies` for the property, marking the default.
- Falls back to `hostfully_room_types.cancellation_policy` when no ROL policies exist.
- Response shape:
  ```json
  {
    "policies": [
      { "id": "uuid", "name": "...", "kind": "custom", "is_default": true, "rule": {...}, "description": "..." }
    ],
    "fallback_text": "..."
  }
  ```

#### `get_payment_methods`
- Input: `propertyId` (required)
- Reads `properties.payment_providers` and joins `payment_gateway_registry` for display names, currencies, and method types.
- Returns:
  ```json
  {
    "payment_methods": [
      { "key": "payfast", "name": "PayFast", "methods": ["card","instant_eft"], "currencies": ["ZAR"], "is_active": true }
    ]
  }
  ```

#### `get_property_contact_details`
- Input: `propertyId` (required)
- Returns public rows from `property_contact_details`.
- Also surfaces legacy `amenities.contact_email` if present and no manager/reception row exists.
- Response shape:
  ```json
  {
    "contacts": [
      { "role": "reception", "name": "...", "email": "...", "phone": "...", "hours": "..." }
    ]
  }
  ```

### 3. Update public API documentation
- Add the three new actions to `src/pages/ApiDocsViewer.tsx` under a new "Static Content" section.
- Update `public/docs/ROLOS-Developer-REST-API-v3.docx` (or its generated equivalent) with request/response examples.

### 4. Optional: enrich booking portfolio widget
- Extend `booking-portfolio-api` to optionally include `cancellation_policy`, `payment_methods`, and `contacts` in the property payload when a new flag `include_static_content=true` is passed.
- This lets direct booking links render terms and contact info without a second API call.

### 5. Frontend admin UI for contact details
- Add a "Contact Details" sub-section inside `PMSPropertySetup.tsx` (or the existing property form) so owners can manage reception/landlord contacts.
- Only needed if the new `property_contact_details` table is created.

## Out of scope
- Modifying cancellation-policy authoring (already implemented in ROLOS Rate Manager → Policies).
- Modifying payment-provider selection (already configured in ROLOS Integrations / Admin tab).

## Verification
- Deploy updated edge function.
- Test each new action via `supabase--curl_edge_functions` with a real `propertyId`.
- Confirm `ApiDocsViewer.tsx` lists the new actions.
- Confirm `booking-portfolio-api` returns the extra fields when requested (if step 4 is included).