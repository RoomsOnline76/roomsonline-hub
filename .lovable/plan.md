

# Fix Contact Information Blocker Mapping

## Problem

Two issues causing the false blocker:

1. **FIELD_TO_TAB mapping is wrong**: `amenities.telephone` and `amenities.contact_email` are mapped to `info-facilities`, but the actual contact form fields (Telephone, Contact Email) live on the **General** tab (~line 5082).

2. **Quality gate checks wrong paths**: `checkContactInfo()` looks for `amenities.telephone` and `amenities.contact_email` at the root of the amenities object. But the form saves contact data to **nested** paths: `amenities.contact.telephone` and `amenities.contact.email`. The root `amenities.telephone` is also set, but `contact_email` is only saved as `amenities.contact.email` — so the gate never finds it.

## Changes

### 1. Fix `FIELD_TO_TAB` in `PropertyForm.tsx`
- Move `amenities.telephone` and `amenities.contact_email` from `info-facilities` to `general`

### 2. Fix `checkContactInfo()` in `check-activation-readiness/index.ts`
- Also check `amenities.contact?.email` and `amenities.contact?.telephone` paths
- This matches how the form actually persists the data

## Files

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/pages/PropertyForm.tsx` | Fix FIELD_TO_TAB: contact fields → `general` tab |
| Modify | `supabase/functions/check-activation-readiness/index.ts` | Check nested `contact.email` / `contact.telephone` paths |

