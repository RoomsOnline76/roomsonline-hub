

# Fix Contract Signature Saving for New Owners

## Problem Identified
The signature saving fails because for **new owners**, the contract signing flow attempts to create a property record during submission. The database rejects this because `price_per_night` is a required field (NOT NULL, no default) that isn't being provided.

**Error from logs:**
```
null value in column "price_per_night" of relation "properties" violates not-null constraint
```

## Root Cause
The `process-signature` edge function creates a new property (lines 122-145) when a new owner signs, but the insert doesn't include `price_per_night`, which the database requires.

## Solution: Two-Part Fix

### Part 1: Update Edge Function
**File:** `supabase/functions/process-signature/index.ts`

Add default values for required database columns in the property insert (around line 122-143):

```typescript
const { data: newProperty, error: propError } = await supabase
  .from("properties")
  .insert({
    name: propData.property_name,
    property_type: propData.property_type,
    address: propData.address,
    city: propData.city,
    country: propData.country,
    owner_email: contract.owner_email,
    owner_name: signee_name,
    is_active: true,
    max_guests: 2,
    price_per_night: 0,        // ADD: Default placeholder price
    bedrooms: 1,               // ADD: Default value
    bathrooms: 1,              // ADD: Default value  
    amenities: {
      registered_business_name: propData.registered_business_name || propData.property_name,
      registration_number: propData.registration_number,
      vat_number: propData.vat_number,
      telephone: propData.telephone,
      mobile_number: propData.mobile_number,
      postal_address: propData.postal_address,
      key_representative: propData.key_representative || signee_name,
    },
  })
  .select("id, name")
  .single();
```

### Part 2: Redeploy Edge Function
After making the change, the edge function must be redeployed to take effect.

## Alternative Approach (Database Change)
If you prefer, we could instead make `price_per_night` nullable or add a default value at the database level:

```sql
ALTER TABLE properties ALTER COLUMN price_per_night SET DEFAULT 0;
```

However, fixing the edge function is cleaner as it's explicit about what values are set for new properties.

## Expected Result
After this fix:
1. New owners can successfully sign contracts
2. A placeholder property is created with sensible defaults
3. The owner can later update the price, rooms, etc. via the property form
4. The signature is saved successfully

## Testing Steps
1. Send a new contract to a test email
2. Fill out property details in the signing wizard
3. Draw/upload signature and submit
4. Verify contract shows as "signed" in admin
5. Verify the new property appears in the property list

