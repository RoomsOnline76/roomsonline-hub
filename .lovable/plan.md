

# Fix Hostfully Push-Booking API Key Retrieval

## Problem Identified

The booking shows "SUCCESS" in the modal but the email reports "Hostfully API key not found in owner credentials" because of **two bugs** in the `push-booking` edge function:

### Bug 1: Non-existent Column Reference
Line 1114 queries by `property.owner_id`, but the `properties` table doesn't have an `owner_id` column - it only has `owner_email` and `owner_pms_credential_id`.

### Bug 2: Incorrect Variable Assignment
Line 1139 uses `Object.assign(ownerCreds || {}, fallbackCreds)` which creates a new object but doesn't update the `ownerCreds` variable. The original variable remains `null`, so line 1145 `ownerCreds?.api_key` still returns `undefined`.

## Database Evidence

The data shows the connection exists and works:
- Property `[SANDBOX] Victorian House (Sample)` has `owner_pms_credential_id = 839ec420-...`
- That credential has `api_key = EJOnIxlU7yrLbmNp` and is active
- The property's `owner_email = marketing@fluent.sandbox.co.za` correctly maps to profile ID `2ac69111-...`

## Solution

Update `push-booking/index.ts` to:

1. **Primary lookup**: Use `property.owner_pms_credential_id` directly (the simplest and most reliable method)
2. **Fallback 1**: Query by owner profile via `owner_email`
3. **Fallback 2**: Keep the email-based lookup as final fallback
4. **Fix the variable assignment**: Use proper assignment instead of `Object.assign`

## Code Changes

| File | Changes |
|------|---------|
| `supabase/functions/push-booking/index.ts` | Lines 1110-1148: Fix credential lookup logic |

### Updated Logic:

```typescript
// Get owner credentials for Hostfully
let ownerCreds: any = null;

// Option 1: Use property.owner_pms_credential_id directly (most reliable)
if (property.owner_pms_credential_id) {
  const { data } = await supabaseClient
    .from('owner_pms_credentials')
    .select('*')
    .eq('id', property.owner_pms_credential_id)
    .eq('is_active', true)
    .maybeSingle();
  
  if (data) {
    ownerCreds = data;
  }
}

// Option 2: Fallback - try to get credentials via owner_email -> profile -> credentials
if (!ownerCreds && property.owner_email) {
  const { data: ownerProfile } = await supabaseClient
    .from('profiles')
    .select('id')
    .eq('email', property.owner_email)
    .maybeSingle();

  if (ownerProfile) {
    const { data } = await supabaseClient
      .from('owner_pms_credentials')
      .select('*')
      .eq('owner_id', ownerProfile.id)
      .eq('system_type', 'hostfully')
      .eq('is_active', true)
      .maybeSingle();
    
    if (data) {
      ownerCreds = data;
    }
  }
}

if (!ownerCreds) {
  throw new Error('Hostfully owner credentials not configured for this property');
}

const apiKey = ownerCreds.api_key;
if (!apiKey) {
  throw new Error('Hostfully API key not found in owner credentials');
}
```

## Technical Details

**Why the current code fails:**

```typescript
// Line 1114 - property.owner_id is UNDEFINED (column doesn't exist)
.eq('owner_id', property.owner_id)  // matches nothing

// Line 1139 - Object.assign returns a new object, doesn't update ownerCreds
Object.assign(ownerCreds || {}, fallbackCreds);  // result is discarded!

// Line 1145 - ownerCreds is still null
const apiKey = ownerCreds?.api_key;  // undefined!
```

**Why the fix works:**

1. Uses `property.owner_pms_credential_id` which is explicitly set during property import
2. Properly reassigns `ownerCreds = data` instead of using broken `Object.assign`
3. Clear fallback chain with proper variable mutation

## Expected Result

After this fix:
- Hostfully bookings will successfully retrieve the API key from owner credentials
- Lead creation in Hostfully will work
- Booking confirmation emails will show success (not error)

