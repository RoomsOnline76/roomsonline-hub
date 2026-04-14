

## Fix Push Property Validation Mismatch

### Root Cause
Line 641 in `rentalsunited-api/index.ts` validates for `p.object_type_id`, but the payload from `push-property-to-ru` was renamed to `property_type_id` in the last refactor. This validation fails immediately, returning a 422 error before any XML is even built or sent to RU.

### Change

**File: `supabase/functions/rentalsunited-api/index.ts`** (line 641)

Update the validation check from:
```typescript
if (!p.name || !p.object_type_id || !p.can_sleep_max || p.floor == null || !p.space) {
```
to:
```typescript
if (!p.name || !p.property_type_id || !p.can_sleep_max || p.floor == null || !p.space) {
```

Then redeploy `rentalsunited-api`.

