

# Un-hide Guesty PMS

Guesty is already configured correctly (key: `guesty`, name: `Guesty`) but is marked `hidden: true` in the central config, which excludes it from PMS Control and integrations pages.

## Changes

### 1. `src/lib/pmsSystemsConfig.ts`
- Remove `hidden: true` from the Guesty entry (line ~68)
- This automatically re-includes it in `VISIBLE_PMS_SYSTEMS` and all derived lists (PMS Control cards, property form dropdown, integrations page)

### 2. `src/pages/AdminKeys.tsx`
- Remove the comment `{/* Guesty hidden - no longer required */}` (~line 4532)
- Guesty has no `hasCustomCard: true`, so it will appear as a generic system card — no custom card renderer needed unless you want one

That's it — two lines changed. The name is already "Guesty" everywhere (config, edge function status report).

