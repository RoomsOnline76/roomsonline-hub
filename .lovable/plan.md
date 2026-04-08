

# Add Expedia API Adapter + PMS Cards

## Summary
Create the Expedia Rapid API adapter edge function, add it to the central PMS config, register a placeholder card in AdminKeys, and insert a tracker row — following the exact same pattern as Airbnb/Channex/Guesty.

## Changes

### 1. `src/lib/pmsSystemsConfig.ts`
Add new entry alphabetically in the "E" section (between Cloudbeds and Guesty):

```typescript
{
  key: 'expedia',
  name: 'Expedia',
  description: 'Expedia Group Rapid API — lodging availability, rates, and booking management',
  deploymentStatus: 'in_development',
}
```

### 2. `src/pages/AdminKeys.tsx`
Add a `renderPlaceholderPMSCard` call for Expedia, placed alphabetically after Cloudbeds and before Guesty in the Accordion:

```typescript
{renderPlaceholderPMSCard(
  "Expedia",
  "expedia",
  "Expedia Group Rapid API — lodging availability, rates, and booking management",
)}
```

### 3. `src/components/PMSProgressToggles.tsx`
Expedia Rapid API supports booking creation and cancellation but not modification (modifications require cancel + rebook). Add `'expedia'` to `MODIFY_NOT_SUPPORTED` only.

### 4. `supabase/functions/expedia-api/index.ts`
New edge function following the established adapter pattern:

- **Auth**: EAN signature-based auth (API key + shared secret → SHA-512 HMAC signature). Credentials from `pms_credentials` table (`api_key` = EAN API key, `api_secret` = shared secret).
- **Base URL**: `https://test.ean.com/v3` (sandbox) / `https://api.ean.com/v3` (production)
- **Actions**:
  - `get_capabilities` — local capability declaration
  - `health_check` — `GET /properties/availability` with minimal params to verify credentials
  - `fetch_availability` — `GET /properties/availability` with checkin/checkout/occupancy
  - `fetch_property` — `GET /properties/{id}/content` for property details
  - `create_reservation` — `POST /itineraries` to book
  - `cancel_reservation` — `DELETE /itineraries/{id}/rooms/{id}` to cancel
- **Capabilities**: read availability, rates, create booking, cancel booking. No modify.

### 5. Database — `pms_tracker_status`
Insert tracker row: `system_type = 'expedia'`, `integration_status = 'in_development'`, `has_docs = true`.

## Files

| File | Change |
|---|---|
| `src/lib/pmsSystemsConfig.ts` | Add Expedia entry |
| `src/pages/AdminKeys.tsx` | Add placeholder card |
| `src/components/PMSProgressToggles.tsx` | Add `'expedia'` to modify-not-supported |
| `supabase/functions/expedia-api/index.ts` | New edge function |
| Database | Insert tracker status row |

