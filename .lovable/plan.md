

# Fix Hostfully Building Import Count Display

## Problem Summary

The Hostfully owner connection card shows **"5/0 imported"** when it should show **"5/7 imported"** (5 of 7 available buildings imported).

## Root Cause Analysis

The display logic relies on two data sources:

1. **Total Count (denominator)**: Parsed from `credential.available_listings` column in the database
2. **Imported Count (numerator)**: Direct SQL count of properties linked to this credential

**The Issue**: The `available_listings` column is **empty** (`[]`) in the database. This happens because:

- When the user clicks "Sync Now" or "Import Properties", the UI calls `list_all_properties` action
- `list_all_properties` fetches property data from Hostfully API but **does not persist it** to `available_listings`
- Only the `sync_owner_listings` action updates `available_listings`, but it's never called in the current UI flow

**Result**: `total = 0` because `available_listings` is empty, causing the display to show `5/0` instead of `5/7`.

---

## Solution

Update the `list_all_properties` edge function action to **also persist** the fetched listings to the `available_listings` column (when `owner_credential_id` is provided).

### File: `supabase/functions/hostfully-api/index.ts`

**Location**: Lines 846-876 (inside `handleListAllProperties` function)

Add database update logic before returning the response. The function already has access to all the fetched properties, we just need to persist them:

**Current Code (simplified):**
```typescript
async function handleListAllProperties(creds: HostfullyCredentials) {
  // ... fetch logic ...
  
  // Returns data but DOESN'T save to database
  return createSuccessResponse({
    properties: allProperties,
    agency_uid: agencyUid,
    agency_name: agency?.name || agency?.companyName || null,
    total_count: allProperties.length,
  }, "list_all_properties");
}
```

**Updated Code:**
```typescript
async function handleListAllProperties(creds: HostfullyCredentials, supabase: any) {
  // ... fetch logic ...
  
  // Persist listings to available_listings if owner_credential_id provided
  if (creds.owner_credential_id && allProperties.length > 0) {
    const { error: updateError } = await supabase
      .from("owner_pms_credentials")
      .update({
        available_listings: allProperties,
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", creds.owner_credential_id);
    
    if (updateError) {
      console.error("[Hostfully] Failed to update available_listings:", updateError);
    } else {
      console.log(`[Hostfully] Saved ${allProperties.length} listings to available_listings`);
    }
  }
  
  return createSuccessResponse({
    properties: allProperties,
    agency_uid: agencyUid,
    agency_name: agency?.name || agency?.companyName || null,
    total_count: allProperties.length,
  }, "list_all_properties");
}
```

### Additional Change: Pass supabase client to handleListAllProperties

The function signature needs to be updated to accept the Supabase client, and the call site in the main handler needs to pass it.

**In main serve handler** (around line 260-270 where actions are dispatched):
```typescript
case "list_all_properties":
  return handleListAllProperties(creds, supabase);  // Add supabase parameter
```

---

## Why This Works

1. When the UI calls "Import Properties" or "Sync Now", `list_all_properties` is invoked
2. The edge function now persists the fetched listings to `available_listings`
3. When the parent component (`AdminUsers`) refetches credentials, it gets the populated `available_listings`
4. The `useEffect` in `OwnerPMSConnectionCard` parses these listings into buildings
5. Total count is correctly calculated (e.g., 7 buildings)
6. Display shows `5/7 imported` correctly

---

## Technical Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/hostfully-api/index.ts` | Update `handleListAllProperties` to accept `supabase` client and persist listings to `available_listings` column |

---

## Expected Result

After this fix:
- **Before**: "5/0 imported" (because total = 0 from empty `available_listings`)
- **After**: "5/7 imported" (total = 7 parsed from persisted `available_listings`)

