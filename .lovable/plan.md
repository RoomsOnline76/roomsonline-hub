

# Property Code Validation & Popup Guide Card Display Fixes

## Overview
This plan addresses two issues reported on the admin property form:
1. **Property Code Validation**: The activation readiness check needs to validate PMS-specific property codes (BBID for NightsBridge, Benson Code for Benson)
2. **Truncated Popup Guide Cards**: The contextual help tooltips are truncating content and not displaying fully

---

## Technical Section

### Issue 1: Property Code Validation Enhancement

The current `check-activation-readiness` edge function checks for `external_property_id` but doesn't account for PMS-specific property code fields:

| PMS | Property Code Field | Current Status |
|-----|---------------------|----------------|
| NightsBridge | `bb_id` / `external_id` | Not validated as PMS code |
| Benson | `benson_property_code` | Not validated in blockers |
| Checkfront | `checkfront_property_code` | Not validated in blockers |
| Cloudbeds | `cloudbeds_property_id` | Not validated in blockers |
| Little Hotelier | `littlehotelier_channel_code` | Not validated in blockers |
| HotelBeds | `hotelbeds_hotel_code` | Not validated in blockers |
| Hostfully | `hostfully_property_uid` | Not validated in blockers |

**Solution**: Update the `checkPMSConflicts` function in `check-activation-readiness` to validate the correct PMS-specific property code based on `external_system`:

```text
File: supabase/functions/check-activation-readiness/index.ts

Update checkPMSConflicts() to:
1. Check external_system value
2. For each PMS, validate the corresponding code field:
   - nightsbridge: external_id OR amenities.external_ids.nightsbridge_bb_id
   - benson: benson_property_code
   - checkfront: checkfront_property_code
   - cloudbeds: cloudbeds_property_id
   - littlehotelier: littlehotelier_channel_code
   - hotelbeds: hotelbeds_hotel_code
   - hostfully: hostfully_property_uid OR owner_pms_credential_id
3. Return appropriate blocker message with the correct field name
```

---

### Issue 2: Popup Guide Cards Truncation

The `ContextualHelp` component uses a `TooltipContent` that:
1. Has `max-w-xs` class limiting width to ~320px
2. Truncates preview text to 150 characters
3. May be clipped by parent containers or z-index issues

**Solution**: Improve the tooltip display:

```text
File: src/components/help/ContextualHelp.tsx

Changes:
1. Increase max-w-xs to max-w-sm or max-w-md for more content visibility
2. Add overflow handling and proper z-index
3. Consider using Popover instead of Tooltip for richer content
4. Ensure the tooltip content has proper line-clamp styling
```

Additionally, check if the issue occurs in specific locations:

```text
File: src/components/property/QualityGateIndicator.tsx

The CheckItem component shows blocker/warning details in a compact format.
Review the min-w-0 and truncation behavior:
- Ensure the message text has proper wrapping
- Consider adding a tooltip on the message for long content
```

---

## Implementation Steps

### Step 1: Update check-activation-readiness Edge Function

Modify the `checkPMSConflicts` function to validate PMS-specific codes:

```typescript
// Get the correct property code based on PMS type
function getPMSPropertyCode(property: any, externalSystem: string): string | null {
  switch (externalSystem.toLowerCase()) {
    case 'nightsbridge':
      return property.external_id || property.amenities?.external_ids?.nightsbridge_bb_id;
    case 'benson':
      return property.benson_property_code;
    case 'checkfront':
      return property.checkfront_property_code;
    case 'cloudbeds':
      return property.cloudbeds_property_id;
    case 'littlehotelier':
      return property.littlehotelier_channel_code;
    case 'hotelbeds':
      return property.hotelbeds_hotel_code;
    case 'hostfully':
      return property.hostfully_property_uid || property.owner_pms_credential_id;
    case 'siteminder':
      return property.siteminder_property_code;
    default:
      return property.external_property_id;
  }
}

// Get human-readable PMS code label
function getPMSCodeLabel(externalSystem: string): string {
  switch (externalSystem.toLowerCase()) {
    case 'nightsbridge': return 'BBID';
    case 'benson': return 'Benson Code';
    case 'checkfront': return 'Checkfront Property Code';
    case 'cloudbeds': return 'Cloudbeds Property ID';
    case 'littlehotelier': return 'Channel Code';
    case 'hotelbeds': return 'Hotel Code';
    case 'hostfully': return 'Hostfully Property UID';
    case 'siteminder': return 'SiteMinder Property Code';
    default: return 'External Property ID';
  }
}
```

### Step 2: Fix ContextualHelp Tooltip Display

Update the TooltipContent styling to prevent truncation:

```tsx
// Before
<TooltipContent 
  side="top" 
  className="max-w-xs"
>

// After
<TooltipContent 
  side="top" 
  align="start"
  className="max-w-sm z-[100]"
  sideOffset={5}
  avoidCollisions={true}
>
  <div className="space-y-1 max-h-64 overflow-y-auto">
    ...
  </div>
</TooltipContent>
```

### Step 3: Improve BlockerItem Display in ProgressDashboard

Ensure blocker messages don't get truncated:

```tsx
// In BlockerItem component, ensure text wraps properly
<div className="flex-1 min-w-0">
  <p className="font-medium text-wrap">{item.name}</p>
  <p className="text-xs text-muted-foreground whitespace-normal break-words">{item.message}</p>
  {item.fix && (
    <p className="text-xs text-primary/80 mt-0.5 whitespace-normal break-words">{item.fix}</p>
  )}
</div>
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/check-activation-readiness/index.ts` | Add PMS-specific property code validation |
| `src/components/help/ContextualHelp.tsx` | Fix tooltip max-width and overflow |
| `src/components/property/ProgressDashboard.tsx` | Improve text wrapping in BlockerItem |
| `src/components/property/QualityGateIndicator.tsx` | Fix truncation in CheckItem component |

---

## Testing Checklist

After implementation:
1. Navigate to a NightsBridge property and verify BBID appears in blockers if missing
2. Navigate to a Benson property and verify "Benson Code" appears in blockers if missing
3. Open any property form with contextual help icons and verify the tooltip shows full content
4. Check the Progress Dashboard blockers section to confirm messages are fully readable
5. Test on mobile to ensure tooltips/popovers don't get cut off

