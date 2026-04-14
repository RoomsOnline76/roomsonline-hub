

## Image Minimum Size Validation (1024×683 px)

### What This Does
Adds a global minimum image dimension requirement of **1024×683 pixels** to all property and room image uploads. Also creates a one-time cleanup script to audit and remove existing undersized images from storage and database references.

### Scope — Which uploads get validated
- **Property gallery images** (`PropertyForm.tsx` — main property images)
- **Room type images** (`RoomManagerTab.tsx` — room-specific images)
- **Room type images** (`PropertyForm.tsx` — duplicate room upload handler)
- **Onboarding property images** (`StepMediaDocuments.tsx`)
- **Book page images** (`PropertyOverview.tsx`)

**Excluded** (not photo content): logos, favicons, hero videos, journal images, addon images, package images.

### Changes

**1. `src/lib/imageValidation.ts`** (new file)
- Export `MIN_IMAGE_WIDTH = 1024` and `MIN_IMAGE_HEIGHT = 683`
- Export `validateImageDimensions(file: File): Promise<{ valid: boolean; width: number; height: number }>` — loads file into an `Image` element via `createObjectURL`, resolves with dimensions
- Export a helper `getValidationErrorMessage(width, height)` for consistent toast text

**2. Add validation to all 5 upload handlers**
Each handler gets a dimension check before the storage upload call:

- **`src/pages/PropertyForm.tsx`** — property gallery upload (~line 2597) and room image upload (~line 952): wrap each file in `validateImageDimensions()`, skip with toast if undersized
- **`src/components/property/RoomManagerTab.tsx`** — `handleRoomImageUpload` (~line 306): same check
- **`src/components/onboarding/steps/StepMediaDocuments.tsx`** — `handleImageUpload` (~line 96): same check
- **`src/pages/PropertyOverview.tsx`** — `handleBookPageImageUpload` (~line 179): same check

Pattern applied to each:
```typescript
const dims = await validateImageDimensions(file);
if (!dims.valid) {
  toast({ title: "Image too small", description: `${file.name} is ${dims.width}×${dims.height}px. Minimum required: 1024×683px.`, variant: "destructive" });
  continue; // or return
}
```

**3. Cleanup edge function: `supabase/functions/cleanup-undersized-images/index.ts`** (new)
- Queries all properties, iterates their `images` arrays and `amenities.room_types[].images`
- For each image URL, fetches the image and checks dimensions server-side (using a canvas-less approach: fetch headers or decode dimensions from the binary)
- If undersized: removes the file from `property-images` storage bucket and removes the URL from the property's image array
- Returns a report of deleted files
- This is a one-time admin-triggered function, not automated

### Technical Notes
- Client-side validation uses `new Image()` + `URL.createObjectURL()` — works in all browsers, no library needed
- The cleanup function uses image header parsing (JPEG SOF marker / PNG IHDR chunk) to read dimensions without fully decoding — fast and memory-efficient
- Logos and branding assets are intentionally excluded since they have different size requirements

