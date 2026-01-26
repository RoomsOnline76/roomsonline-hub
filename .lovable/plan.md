
# Fix Hostfully Sync - Link Property to Owner's PMS Credential

## Problem

The "Sync Property Data" button fails with "Failed to retrieve owner credentials" because the property record has `owner_pms_credential_id` set to NULL, even though:
- The property has `owner_email` = `marketing@fluent.sandbox.co.za`
- That owner has a valid Hostfully credential with API key

## Root Cause

The property was created without linking to the owner's PMS credential. The sync function in PropertyForm.tsx requires `owner_pms_credential_id` to be set directly on the property.

## Data State

| Table | Field | Current Value |
|-------|-------|---------------|
| `properties` | `id` | `1a4d3334-16ec-4554-b228-e3e552c1cad8` |
| `properties` | `owner_email` | `marketing@fluent.sandbox.co.za` |
| `properties` | `owner_pms_credential_id` | **NULL** ← Problem |
| `owner_pms_credentials` | `id` | `839ec420-2075-4f69-9f18-0617d127c9bb` |
| `owner_pms_credentials` | `owner_id` | `2ac69111-5c58-453e-a635-7bd39e7fbb7a` |

## Solution

### Part 1: Fix Database Record

Link the property to the owner's Hostfully credential:

```sql
UPDATE properties 
SET owner_pms_credential_id = '839ec420-2075-4f69-9f18-0617d127c9bb'
WHERE id = '1a4d3334-16ec-4554-b228-e3e552c1cad8';
```

### Part 2: Improve Sync Logic (Fallback)

Update `PropertyForm.tsx` to look up owner credentials via `owner_email` when `owner_pms_credential_id` is not set. This prevents this issue from recurring.

**Current code (line ~660):**
```typescript
const { data: property } = await supabase
  .from("properties")
  .select("owner_pms_credential_id")
  .eq("id", propertyId)
  .single();

if (!property?.owner_pms_credential_id) {
  throw new Error("No owner PMS credential linked to this property");
}
```

**Improved code with fallback:**
```typescript
const { data: property } = await supabase
  .from("properties")
  .select("owner_pms_credential_id, owner_email")
  .eq("id", propertyId)
  .single();

let credentialId = property?.owner_pms_credential_id;

// Fallback: Look up credential via owner_email
if (!credentialId && property?.owner_email) {
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", property.owner_email)
    .maybeSingle();
  
  if (ownerProfile?.id) {
    const { data: credential } = await supabase
      .from("owner_pms_credentials")
      .select("id")
      .eq("owner_id", ownerProfile.id)
      .eq("system_type", "hostfully")
      .eq("is_active", true)
      .maybeSingle();
    
    credentialId = credential?.id;
    
    // Auto-link for future use
    if (credentialId) {
      await supabase
        .from("properties")
        .update({ owner_pms_credential_id: credentialId })
        .eq("id", propertyId);
    }
  }
}

if (!credentialId) {
  throw new Error("No owner PMS credential linked to this property");
}
```

## Files Modified

| File | Change |
|------|--------|
| Database (direct update) | Link Victorian House property to owner's credential |
| `src/pages/PropertyForm.tsx` | Add fallback logic to find credentials via owner_email |

## Data Flow After Fix

```text
User clicks "Sync Property Data"
           │
           ▼
┌────────────────────────────────────┐
│ Check property.owner_pms_credential_id │
│           = NULL                   │
└────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────┐
│ FALLBACK: Look up via owner_email  │
│ profiles → owner_pms_credentials   │
└────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────┐
│ Found credential_id               │
│ Auto-link to property             │
└────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────┐
│ Call hostfully-api with credential │
│ SUCCESS!                           │
└────────────────────────────────────┘
```

## Expected Result

After this fix:
1. The Victorian House property will be linked to the Hostfully SandBox owner's credential
2. "Sync Property Data" will work immediately
3. Future properties with only `owner_email` set will auto-link when sync is attempted
