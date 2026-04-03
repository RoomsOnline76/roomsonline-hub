

# Fix: Consistent Font Sizes Across All Property Form Tabs

## Problem

The property form has inconsistent font sizes across tabs:
- **General tab**: most fields explicitly set `text-xs` (12px) — looks compact and consistent
- **Other tabs** (Billing, Policies, Promo Codes, Branding, ROL Spec, Commission, etc.): many Input, SelectTrigger, and Textarea elements have **no className** at all, so they inherit `text-sm` (14px) from the UI primitives

This creates a jarring size difference when switching between tabs.

## Approach

Rather than changing global UI primitives (which would affect the entire app), I will add `text-xs` classes to every unstyled form element across all property form tab components. This is a targeted fix scoped to property pages only.

## Files to Update

| File | Unstyled Elements |
|------|------------------|
| `src/pages/PropertyForm.tsx` | ~15 elements (SelectTriggers without className, Inputs without text size, Textareas) |
| `src/components/property/BillingConfigTab.tsx` | 7 Inputs, 1 SelectTrigger, 1 Textarea |
| `src/components/property/BrandingTab.tsx` | 4 Inputs |
| `src/components/property/CollectionsManager.tsx` | 7 Inputs |
| `src/components/property/CommissionTab.tsx` | 2 Inputs, 1 SelectTrigger, 1 Textarea |
| `src/components/property/PoliciesTab.tsx` | 4 Inputs, 1 Textarea |
| `src/components/property/PromoCodesTab.tsx` | 7 Inputs |
| `src/components/property/ROLSpecTab.tsx` | 1 Input, 6 Textareas, 1 SelectTrigger |
| `src/components/property/ReferralSection.tsx` | 1 Input, 1 Textarea |
| `src/components/property/ReviewActionPanel.tsx` | 3 Textareas |
| `src/components/property/SmartRoomInput.tsx` | 1 Textarea |
| `src/components/property/MultiUnitConfigPanel.tsx` | 3 Inputs |
| `src/components/property/GoogleFontPicker.tsx` | 1 Input |
| `src/components/property/BrandVoiceCard.tsx` | 1 Textarea |

## What Changes

Every Input, SelectTrigger, and Textarea in property form components will get `text-xs` added to their className (matching the General tab pattern). Elements that already have `text-xs` remain unchanged.

This ensures all form fields across all tabs render at the same compact 12px size — matching the owner/country dropdowns the user referenced.

