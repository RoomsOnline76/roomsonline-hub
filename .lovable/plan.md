

# Highlight Blocker Fields in Edit Property Page

## Problem

When a property has outstanding quality gate blockers preventing showcase activation, there's no visual indication on the edit property page showing which tabs/sections need attention. Admins have to mentally cross-reference the quality gate results with the form tabs.

## Solution

Use the existing `useActivationReadiness` hook in `PropertyForm.tsx` to fetch blocker data, then:
1. Add a red dot/badge on tabs that contain blocker fields
2. Wrap the relevant form sections with a highlighted border when they contain a blocker field
3. Show a compact blocker summary banner at the top of the form (only when blockers exist)

## Field → Tab Mapping

| Blocker `field` value | Tab |
|---|---|
| `owner_email`, `name`, `property_type`, `description`, `address`, `city`, `country`, `external_id`, `*_property_code` | `general` |
| `images` | `images` |
| `amenities.bank_name`, `amenities.telephone`, `amenities.contact_email` | `info-facilities` |
| `amenities.room_types` | `rooms` |
| `amenities.check_in_time` | `house-rules` |

## Changes

### 1. Modify `src/pages/PropertyForm.tsx`

- Import `useActivationReadiness` from `@/components/property/QualityGateIndicator`
- Call the hook when in edit mode with `propertyId`
- Create a `FIELD_TO_TAB` mapping object
- Compute `tabsWithBlockers: Set<string>` from blocker field values
- On each tab trigger: if `tabsWithBlockers.has(tab.value)`, show a red dot indicator
- Add a compact alert banner below the header when blockers exist, showing count and listing blocker names with "Fix" buttons that navigate to the correct tab
- On the active tab content: wrap sections containing blocker fields with a `ring-2 ring-destructive/50 rounded-lg` border and a small label showing what's missing

## Files

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/pages/PropertyForm.tsx` | Add blocker awareness: red dots on tabs, highlight sections, banner |

