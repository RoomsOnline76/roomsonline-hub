

# Fix Hostfully OAuth: Correct URL & Auto-Ingest Property Data

## Problem Summary

Two issues with the Hostfully OAuth connection flow:

1. **Wrong fallback URL** - Uses `https://roomsonline.co.za` (marketing site showing "No Results Found") instead of the app URL
2. **No auto-ingestion** - After successful OAuth, the system doesn't fetch room types and rate types from Hostfully

## Solution

### Part 1: Fix the Fallback URL

Update `hostfully-oauth-callback` to use the correct production app URL:

| Current (Wrong) | Correct |
|-----------------|---------|
| `https://roomsonline.co.za` | `https://roomsonline-hub.lovable.app` |

This is the published Lovable app URL where the admin interface lives.

---

### Part 2: Auto-Ingest Property Data After OAuth

After OAuth completes successfully and we have a `property_id`, automatically call the `hostfully-api` to:
1. Fetch the Hostfully property UID from the property record
2. Call `full_ingest_property` action to import room types, rate types, and all 68+ property fields
3. Update the property with the ingested data

---

## Implementation

### File: `supabase/functions/hostfully-oauth-callback/index.ts`

#### Change 1: Fix fallback URL (line 17)

```typescript
// FROM:
return 'https://roomsonline.co.za';

// TO:
return 'https://roomsonline-hub.lovable.app';
```

#### Change 2: Add auto-ingestion after OAuth success (after line 229)

After the property update succeeds, add logic to trigger the `full_ingest_property`:

```typescript
// If property_id provided, update property's PMS connection
if (property_id) {
  // ... existing update code ...

  // NEW: Auto-ingest property data from Hostfully
  try {
    // First, get the property's Hostfully UID
    const { data: propData } = await supabase
      .from('properties')
      .select('hostfully_property_uid')
      .eq('id', property_id)
      .single();

    if (propData?.hostfully_property_uid) {
      console.log('Starting auto-ingestion for property:', property_id);
      
      // Call hostfully-api to run full ingestion
      const ingestionResponse = await fetch(
        `${supabaseUrl}/functions/v1/hostfully-api`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            action: 'full_ingest_property',
            owner_credential_id: credential_id,
            propertyUid: propData.hostfully_property_uid,
            rol_property_id: property_id,
          }),
        }
      );

      const ingestionResult = await ingestionResponse.json();
      console.log('Auto-ingestion result:', ingestionResult.success ? 'success' : ingestionResult.error);
    } else {
      console.log('No hostfully_property_uid on property, skipping auto-ingestion');
    }
  } catch (ingestionErr) {
    // Don't fail the OAuth flow if ingestion fails - just log it
    console.warn('Auto-ingestion failed (non-blocking):', ingestionErr);
  }
}
```

---

## Technical Flow After Implementation

```text
User clicks "Connect Hostfully"
    ↓
Redirects to Hostfully OAuth
    ↓
User authorizes
    ↓
Hostfully redirects back with code
    ↓
hostfully-oauth-callback:
  1. Exchange code for tokens ✓
  2. Store credentials in owner_pms_credentials ✓
  3. Update property external_system = 'hostfully' ✓
  4. NEW: Fetch hostfully_property_uid from property
  5. NEW: Call full_ingest_property to import rooms/rates
  6. Redirect to app with success
```

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/hostfully-oauth-callback/index.ts` | Fix fallback URL from `roomsonline.co.za` to `roomsonline-hub.lovable.app`; Add auto-ingestion call after OAuth success |

---

## Expected Outcome

After implementation:

1. **Correct redirects** - OAuth errors and success will redirect to the correct app URL
2. **Auto-populated data** - After connecting Hostfully, the property will automatically have:
   - Room types imported to `hostfully_room_types`
   - Rate types imported to `pms_rate_types_cache`
   - Property fields synced (amenities, images, descriptions, etc.)
   - Fields marked as PMS-managed in `pms_managed_fields`

---

## Edge Case: No `hostfully_property_uid`

If the property doesn't have a `hostfully_property_uid` set yet (first-time connection), the auto-ingestion is skipped. In this case, the user can:
1. Manually set the Hostfully Property UID in the property form
2. Use the "Import Rooms" button in the UI

This ensures the OAuth flow always succeeds, even if we can't auto-ingest.

