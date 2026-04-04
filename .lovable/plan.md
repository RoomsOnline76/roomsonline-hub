

# Add "Enrich from Website" Button to Property Edit Page

## Problem
The `enrich-property-content` edge function was created but no UI trigger was added to the property edit page. The existing "Auto-fill" button uses a different flow (`ai-website-sync`) that fills form fields, not editorial content (space_description, neighbourhood, etc.).

## Solution
Add an "Enrich Content" button to the ROL Spec tab in the property edit form. This button will call the `enrich-property-content` edge function with the property's ID and website URL, then reload the enriched data into the form.

## Changes

| File | Change |
|------|--------|
| `src/components/property/ROLSpecTab.tsx` | Add an "Enrich from Website" button (with Globe/Sparkles icon) near the top of the tab. On click, invoke `enrich-property-content` with `property_id` and `website_url` from `propertyContext`. Show loading state, toast success/error with fields updated count. Disable if no website URL is set. |
| `src/pages/PropertyForm.tsx` | Pass `websiteUrl` and `propertyId` into `ROLSpecTab` via `propertyContext` prop (verify these are already included — if not, add them). After enrichment succeeds, refetch property data to pick up the new amenities fields. |

## UI Details
- Button text: "Enrich from Website" with a Sparkles icon
- Positioned at the top of the ROL Spec tab, next to the sub-tab navigation
- Shows spinner + "Enriching..." while running
- Disabled state with tooltip "Add a Property Website URL first" when no URL is set
- Success toast: "Enriched {n} fields: space_description, neighbourhood_description, ..."
- Error toast: shows the error message from the edge function

