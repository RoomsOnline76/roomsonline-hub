

# Investigation Results: Hostfully ARI Data is Working Correctly

## Findings

After thorough investigation of the SEO update and the current state of the booking pages:

### What I tested
- Loaded `SIX ON N` (Hostfully property) on both preview and published domain
- Verified the `hostfully-api` edge function is called and returns room type data
- Confirmed rooms display with live pricing (R 1,000 - R 1,615/night)
- Confirmed "Select" and "Book Now" buttons are present — no "On Request" state
- Verified the `public_properties` view includes `external_system` (required for ARI routing)
- Checked the PropertyShowcase.tsx code — all ARI fetching logic is intact and unchanged by the SEO update

### No ARI regression found
The SEO update only added a `usePageSEO` hook call to PropertyShowcase.tsx. The availability fetching code (lines 341-483) was not modified.

### Minor issue found: slug mismatch
The property slug in the database is `sixonn-3`, not `six-on-n`. If you navigated to `/property/six-on-n`, you'd get "Property Not Found" — but this predates the SEO update.

## One fix recommended: Memoize SEO config

The `usePageSEO` call creates new `jsonLd` and `breadcrumbs` objects on every render, causing the effect to re-run unnecessarily. While this doesn't break ARI, it adds unnecessary DOM churn. Fix by wrapping the config in `useMemo`.

### File: `src/pages/PropertyShowcase.tsx`
Wrap the `usePageSEO` config in `useMemo` keyed on `property?.id` to prevent unnecessary effect cycles.

## Questions

Could you share the exact URL you visited that showed "On Request" and no calendar availability? That would help me pinpoint if there's a different property or route affected. The `sixonn-3` property is working correctly on both environments.

