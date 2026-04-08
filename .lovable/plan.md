

# Add Channex.io to PMS Systems

## Changes

### 1. `src/lib/pmsSystemsConfig.ts`
Add a new entry in the `ALL_PMS_SYSTEMS` array under the "C" section (after Cloudbeds, alphabetically):

```typescript
{
  key: 'channex',
  name: 'Channex.io',
  description: 'Channel manager and PMS connectivity platform with open API for property distribution',
  deploymentStatus: 'planned',
}
```

No `hasCustomCard` or `hidden` flags — it will appear as a generic/placeholder card with "Planned" status badge.

### 2. `src/pages/AdminKeys.tsx`
Add a `renderPlaceholderPMSCard("Channex.io", "channex", "...")` call alongside the other placeholder cards (Guesty, RoomKey, etc.) so it renders on the integrations page.

### 3. `src/pages/connect/ConnectIntegrations.tsx`
No change needed — Channex.io will automatically appear in any lists derived from `VISIBLE_PMS_SYSTEMS`.

### 4. Tracker milestones
Channex.io will automatically get the full 11-point progress tracker (has_account, has_docs, has_edge, has_health, has_get, has_post, has_modify, has_cancel, has_soft_test, is_certified, is_production) from the existing `pms_tracker_status` table when a row is inserted for it — no schema changes needed.

## Summary
Two files changed, one new config entry + one placeholder card render call.

