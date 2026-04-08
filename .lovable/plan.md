

# Channex.io Adapter + Milestone Toggles in Placeholder Cards

## Summary
Two changes: (1) create the `channex-api` edge function adapter, and (2) add milestone progress toggles to all placeholder PMS cards so you can track progress directly.

## 1. Add PMSProgressToggles to Placeholder Cards

**File: `src/pages/AdminKeys.tsx`**

The `renderPlaceholderPMSCard` function (line ~4225) currently shows description, tracker status, contact details, and dev notes — but no progress toggles. Add `<PMSProgressToggles>` between the tracker status display and the "planned for future release" message, matching all other custom cards.

## 2. Create `channex-api` Edge Function

**File: `supabase/functions/channex-api/index.ts`**

A new adapter following the established pattern (Benson as reference). Channex.io uses:
- **Auth**: `user-api-key` header (API key from user profile)
- **Base URLs**: `https://staging.channex.io/api/v1` (sandbox) / `https://app.channex.io/api/v1` (production)
- **Rate limit**: 10 availability + 10 restriction requests per minute per property

### Supported Actions

| Action | Channex Endpoint | Method |
|---|---|---|
| `get_capabilities` | (local) | — |
| `health_check` | `GET /properties` | Verify API key works |
| `fetch_availability` | `GET /availability?filter[property_id]=X&filter[date][gte]=Y&filter[date][lte]=Z` | Pull room-level availability |
| `fetch_restrictions` | `GET /restrictions?filter[property_id]=X&filter[date][gte]=Y&filter[date][lte]=Z` | Pull rate plan restrictions/rates |
| `fetch_types` | `GET /room_types?filter[property_id]=X` | List room types |
| `create_reservation` | `POST /bookings` | Push booking |
| `modify_reservation` | `PUT /bookings/{id}` | Modify booking |
| `cancel_reservation` | `DELETE /bookings/{id}/cancel` | Cancel booking |
| `get_reservations` | `GET /booking_revisions/feed` | Pull booking feed |

### Capabilities Declaration
```typescript
const CAPABILITIES = {
  supports_live_availability: true,
  supports_rate_fetch: true,
  supports_create_booking: true,
  supports_modify_booking: true,  // Channex supports modify
  supports_cancel_booking: true,  // Channex supports cancel
  supports_webhooks: true,        // Channex has webhook support
  supports_owner_credentials: false,
};
```

### Credential Resolution
Same pattern as other adapters — reads from `pms_credentials` table filtered by `system_type = 'channex'` and `property_id`. Stores `api_key` and `environment` (staging/production).

### Response Normalization
All responses normalized to the standard `AdapterResponse<T>` shape with `source: "channex"`. Availability data mapped from Channex's `{ [room_type_id]: { [date]: availability } }` format to the ROL'OS `room_types[]` contract.

## 3. Update Config

**File: `src/lib/pmsSystemsConfig.ts`**
- Set `hasCustomCard: false` (uses placeholder card with toggles now)
- Update `deploymentStatus` to `'in_development'`

**File: `src/lib/pmsTrackerConfig.ts`**
- Channex supports modify and cancel, so it should NOT be in the `MODIFY_NOT_SUPPORTED` or `CANCEL_NOT_SUPPORTED` lists (it isn't — no change needed)

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/channex-api/index.ts` | New edge function — full adapter |
| `src/pages/AdminKeys.tsx` | Add `PMSProgressToggles` to `renderPlaceholderPMSCard` |
| `src/lib/pmsSystemsConfig.ts` | Update Channex status to `in_development` |

