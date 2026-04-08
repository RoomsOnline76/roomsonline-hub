

# Add Airbnb API Adapter (via SearchAPI.io)

## Context
Airbnb does not offer a public PMS API. The SearchAPI.io Airbnb API provides read-only access to listings, availability, pricing, reviews, and property details via a search/scraping proxy. This means the adapter is **pull-only** — no booking creation, modification, or cancellation.

## Changes

### 1. `src/lib/pmsSystemsConfig.ts`
Add new entry in the "A" section (before Benson, alphabetically):

```typescript
{
  key: 'airbnb',
  name: 'Airbnb',
  description: 'Airbnb listing data via SearchAPI.io — availability, pricing, reviews (read-only)',
  hasCustomCard: false, // uses placeholder card with progress toggles
  deploymentStatus: 'in_development',
}
```

### 2. `src/components/PMSProgressToggles.tsx`
Add `'airbnb'` to both `MODIFY_NOT_SUPPORTED` and `CANCEL_NOT_SUPPORTED` arrays, since SearchAPI.io is read-only (no write operations).

### 3. `supabase/functions/airbnb-api/index.ts`
New edge function following the established adapter pattern. Uses SearchAPI.io (`https://www.searchapi.io/api/v1/search?engine=airbnb`).

**Auth**: Bearer token or `api_key` query param (SearchAPI.io API key stored in `pms_credentials` for the property).

**Supported actions**:

| Action | SearchAPI Endpoint | Notes |
|---|---|---|
| `get_capabilities` | (local) | Read-only declaration |
| `health_check` | `GET /search?engine=airbnb&q=test` | Verify API key works |
| `fetch_availability` | `GET /search?engine=airbnb&q=...&check_in_date=...&check_out_date=...` | Pull pricing/availability for a location |
| `fetch_listing` | `GET /search?engine=airbnb_listing&listing_id=...` | Get specific listing details |
| `fetch_reviews` | `GET /search?engine=airbnb_reviews&listing_id=...` | Pull reviews for a listing |

**Capabilities**:
```typescript
const CAPABILITIES = {
  supports_live_availability: true,
  supports_rate_fetch: true,
  supports_create_booking: false,  // Read-only API
  supports_modify_booking: false,
  supports_cancel_booking: false,
  supports_webhooks: false,
  supports_owner_credentials: false,
};
```

**Credential resolution**: Reads `api_key` from `pms_credentials` where `system_type = 'airbnb'`. The API key is the SearchAPI.io key, not an Airbnb credential.

### 4. Database — `pms_tracker_status`
Insert a tracker row for `airbnb` with `integration_status = 'in_development'` and `has_docs = true` (docs are available). This ensures it appears in PMS Control with milestone toggles.

### 5. No changes needed
- `src/pages/AdminKeys.tsx` — placeholder cards already render `PMSProgressToggles` for systems without `hasCustomCard`
- `/admin/integrations` — automatically picks up from `VISIBLE_PMS_SYSTEMS`

## Files

| File | Change |
|---|---|
| `src/lib/pmsSystemsConfig.ts` | Add Airbnb entry |
| `src/components/PMSProgressToggles.tsx` | Add `'airbnb'` to modify/cancel not-supported lists |
| `supabase/functions/airbnb-api/index.ts` | New edge function (read-only adapter) |
| Database migration | Insert `pms_tracker_status` row |

