

# Fix Contract Signature Saving for New Owners

## Problem Summary
When a new owner signs a contract, the signature fails to save with the error "Failed to submit signature". This happens because the `process-signature` edge function attempts to create a property record for new owners, but the database rejects the insert.

## Root Cause Analysis
The database constraint violation occurs because:
- The `properties` table has `price_per_night` defined as `NOT NULL` with **no default value**
- The `process-signature` function (lines 122-145) creates a new property but doesn't include `price_per_night`
- Database rejects: `null value in column "price_per_night" of relation "properties" violates not-null constraint`

## Current Logic (Working Correctly)
The check for new vs existing owner IS working correctly:
```typescript
// Line 118 - Only creates property if ALL conditions are true:
if (contract_type === "owner" && contract.is_new_owner && pending_property_data) {
  // Create property...
}
```

The contract for `sleepinafrica@roomsonline.co.za` correctly has:
- `is_new_owner: true`
- `property_count: 0`

The issue is purely the missing required field.

## Solution: Update Edge Function

**File:** `supabase/functions/process-signature/index.ts`

Add default values for required database columns in the property insert (lines 122-145):

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
    price_per_night: 0,        // ADD: Required field with placeholder value
    bedrooms: 1,               // ADD: Explicit default
    bathrooms: 1,              // ADD: Explicit default
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

### Changes Required
| Field | Current | Change To |
|-------|---------|-----------|
| `price_per_night` | ❌ Missing | `0` |
| `bedrooms` | ❌ Missing | `1` |
| `bathrooms` | ❌ Missing | `1` |

## Implementation Steps
1. Edit `supabase/functions/process-signature/index.ts`
2. Add the three missing fields to the property insert
3. Redeploy the edge function

## Expected Result After Fix
1. ✅ New owners can successfully sign contracts
2. ✅ A placeholder property is created with sensible defaults
3. ✅ Signature is saved to storage and contract updated
4. ✅ Confirmation emails sent
5. ✅ Owner can later update price, rooms, etc. via the property form

## Testing Steps
1. Re-try signing the contract at the existing link
2. Complete the property details form
3. Draw/upload signature and submit
4. Verify contract shows as "signed" in admin
5. Verify the new property appears in the property list

