

# Add WETU Content API Adapter

## Context
WETU is a travel content portal providing read-only access to property content (descriptions, images, rooms, features, GPS coordinates) via a REST/JSON API at `https://wetu.com/API/Pins/<APIKEY>/...`. Endpoints: List, Get, Search, GetPinsWithPaging. No booking/ARI — content only.

## Changes

### 1. `src/lib/pmsSystemsConfig.ts` — New entry

Add under "Additional Services" (no `category: 'channel_manager'` since it's a content portal, not a distribution channel):

```typescript
{
  key: 'wetu',
  name: 'WETU',
  description: 'Travel content portal — property descriptions, images, rooms, and features (read-only content API)',
  deploymentStatus: 'in_development',
}
```

### 2. `supabase/functions/wetu-api/index.ts` — Edge function adapter

Actions:
- `list_properties` — `GET /API/Pins/<KEY>/List?suppliers=y`
- `get_property` — `GET /API/Pins/<KEY>/Get?ids=<id>`
- `search` — `GET /API/Pins/<KEY>/Search/<terms>`
- `get_paged` — `GET /API/Pins/<KEY>/GetPinsWithPaging?pageNumber=<n>`
- `health_check` — calls List with limit to verify API key

Requires secret `WETU_API_KEY`. Standard CORS, error handling, Zod input validation.

### 3. `src/components/PMSProgressToggles.tsx`

Add `'wetu'` to both `MODIFY_NOT_SUPPORTED` and `CANCEL_NOT_SUPPORTED` lists (content-only, no booking operations).

### 4. `src/pages/AdminKeys.tsx` — Add card

Add `renderPlaceholderPMSCard("WETU", "wetu", "Travel content portal — property descriptions, images, rooms, and features (read-only content API)")` in the **Additional Services** section.

### 5. `src/pages/DevPMS.tsx`

WETU will appear automatically via `PMS_CATEGORY_SYSTEMS` (no category = defaults to PMS group).

### 6. Database — tracker row

```sql
INSERT INTO pms_tracker_status (system_type, status, integration_status, has_docs)
VALUES ('wetu', 'In Progress', 'in_development', true)
ON CONFLICT (system_type) DO NOTHING;
```

### 7. Status report email

Add `'wetu'` → `"WETU"` to `getPMSDisplayName` in `send-pms-status-report/index.ts`.

## Files

| File | Change |
|---|---|
| `src/lib/pmsSystemsConfig.ts` | Add WETU entry |
| `supabase/functions/wetu-api/index.ts` | New edge function |
| `src/components/PMSProgressToggles.tsx` | Add to not-supported lists |
| `src/pages/AdminKeys.tsx` | Add placeholder card |
| `supabase/functions/send-pms-status-report/index.ts` | Add display name |
| Database | Insert tracker row |

