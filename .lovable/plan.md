

# Add Email Template Preview to ExperienceEmailDesigner

## Problem

The `ExperienceEmailDesigner` (Templates tab in Edit Property for Experience Engine properties) has the AI Writer but is missing the `EmailTemplatePreview` component. Users can write/generate email content but cannot see a branded preview of the result.

The PMS Messaging page (`/pms/messaging`) already has both — this is just a missing import in the Experience Engine version.

## Fix (1 file)

**`src/components/property/ExperienceEmailDesigner.tsx`**

1. Import `EmailTemplatePreview` from `@/components/pms/EmailTemplatePreview`
2. Fetch the property's brand colors and logo (query `rolos_experience_configs` where `experience_type = 'brand_kit'`) to pass into the preview
3. Add the `EmailTemplatePreview` component inside the edit dialog, below the editor area, showing a live preview of the current subject + body with mock data substitution

The preview will update in real-time as the user types or after AI generation, matching the same behavior as the PMS Messaging page.

## Files

| Action | File | What |
|--------|------|------|
| Modify | `src/components/property/ExperienceEmailDesigner.tsx` | Import `EmailTemplatePreview`, fetch brand config, render preview below editor in the edit dialog |

