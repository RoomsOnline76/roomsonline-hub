
# Fix Hostfully Property Image Saving During Sync

## Problem

When syncing a Hostfully API property from the sandbox query tool, the property is created but the image is **not saved**, even though the `pictureLink` is available in the API response.

### Evidence

From the network request, the property data includes:
```json
{
  "pictureLink": "https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcRfTA6qg3wFq2p6hf8jI9a68AR_tmA1mEmAnL3xijG6742a3r1B",
  "name": "Victorian House (Sample)",
  ...
}
```

But the property is created without this image.

---

## Root Cause Analysis

There are **two separate issues**:

### Issue 1: Sandbox Property Creation Ignores Image

The `handleCreateSandboxProperties` function in `AdminKeys.tsx` (lines 1101-1158):
- Creates properties but does **NOT** save `pictureLink` as an image
- Does **NOT** invoke `full_ingest_property` to populate additional data

```typescript
const propertyData = {
  name: `[SANDBOX] ${listing.name}`,
  // ... other fields ...
  // NO images field!
};
```

### Issue 2: Ingestion Ignores `pictureLink` Fallback

The `transformMedia` function in `transformers.ts` (lines 244-256):
- Only uses photos from the dedicated `/photos` endpoint
- Ignores `ctx.property.pictureLink` which is the fallback image

For sandbox/sample properties, the `/photos` endpoint often returns empty, but the property has a `pictureLink` thumbnail.

---

## Solution

### Part 1: Add Image to Sandbox Property Creation

Update `handleCreateSandboxProperties` in `src/pages/AdminKeys.tsx` to:
1. Extract `pictureLink` from the raw listing data
2. Save it in the `images` array when creating the property
3. Invoke full ingestion after property creation (like the standard import does)

```typescript
const handleCreateSandboxProperties = async () => {
  // ... existing code ...
  
  for (const listing of selectedProperties) {
    // Extract pictureLink from raw data
    const pictureLink = listing._raw?.pictureLink || listing._raw?.picture;
    const images = pictureLink ? [{ url: pictureLink, alt: listing.name, order: 0 }] : [];
    
    const propertyData = {
      name: `[SANDBOX] ${listing.name}`,
      // ... existing fields ...
      images, // ADD: Save the property image
    };

    const { data: newProperty, error } = await supabase
      .from("properties")
      .insert(propertyData)
      .select("id")
      .single();
      
    if (!error && newProperty) {
      // ADD: Invoke full ingestion for room types
      try {
        await supabase.functions.invoke("hostfully-api", {
          body: {
            action: "full_ingest_property",
            propertyUid: listing.id,
            rol_property_id: newProperty.id,
            owner_credential_id: hostfullyCredentials?.id,
          },
        });
      } catch (ingestErr) {
        console.warn("Ingestion warning:", ingestErr);
      }
      created++;
    }
  }
  // ...
};
```

### Part 2: Add `pictureLink` Fallback in Ingestion

Update `transformMedia` in `supabase/functions/hostfully-api/ingestion/transformers.ts` to use `pictureLink` as a fallback when no photos are available:

```typescript
function transformMedia(ctx: IngestionContext): PropertyImage[] {
  // First, try the photos endpoint
  if (ctx.photos && Array.isArray(ctx.photos) && ctx.photos.length > 0) {
    return ctx.photos
      .filter(p => p.originalImageUrl || p.url)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .map((photo, index) => ({
        url: photo.originalImageUrl || photo.url || '',
        alt: photo.caption || '',
        order: photo.order ?? index,
        category: photo.category || 'property',
      }));
  }
  
  // Fallback: Use pictureLink from property data (common for sandbox/sample properties)
  if (ctx.property) {
    const pictureLink = ctx.property.pictureLink || ctx.property.picture;
    if (pictureLink) {
      return [{
        url: pictureLink,
        alt: ctx.property.name || 'Property image',
        order: 0,
        category: 'property',
      }];
    }
  }
  
  return [];
}
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/AdminKeys.tsx` | 1. Extract and save `pictureLink` in sandbox property creation 2. Invoke full ingestion after creating sandbox properties |
| `supabase/functions/hostfully-api/ingestion/transformers.ts` | Add `pictureLink` fallback when `/photos` returns empty |

---

## Data Flow After Fix

```text
                    ┌─────────────────────────────────────────────────────────────────┐
                    │                    "Query Properties" Button                     │
                    └─────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
                    ┌─────────────────────────────────────────────────────────────────┐
                    │                  Hostfully API Response                          │
                    │  { name, pictureLink, bedrooms, ... }                            │
                    └─────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
                    ┌─────────────────────────────────────────────────────────────────┐
                    │               handleCreateSandboxProperties                      │
                    │  1. Extract pictureLink → images array                           │
                    │  2. Insert property with images                                  │
                    │  3. Call full_ingest_property for room types                     │
                    └─────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
                    ┌─────────────────────────────────────────────────────────────────┐
                    │                   full_ingest_property                           │
                    │  1. Fetch /photos → if empty, use pictureLink fallback           │
                    │  2. Write images to property record                              │
                    └─────────────────────────────────────────────────────────────────┘
```

---

## Expected Result

After this fix:
1. **Sandbox properties** will have their image saved immediately upon creation
2. **Full ingestion** will use `pictureLink` as a fallback when the `/photos` endpoint returns empty
3. The property card will display the image in the property list

---

## Technical Notes

### Image Field Structure

The `properties.images` column expects a JSONB array:
```json
[
  { "url": "https://...", "alt": "Property name", "order": 0, "category": "property" }
]
```

### Why Standard Import Works

The `handleHostfullyImportListings` function (line 698-752) invokes `full_ingest_property`, which fetches from `/photos`. But for properties that rely on `pictureLink` (like sandbox samples), this fails silently.

### Sandbox vs Production

| Scenario | Photos Endpoint | pictureLink | Result After Fix |
|----------|-----------------|-------------|------------------|
| Production property | Has photos | May have | Uses /photos |
| Sandbox sample | Empty | Has thumbnail | Uses pictureLink fallback |
