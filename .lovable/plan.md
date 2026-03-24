

# Rentals United — Admin Card, Adapter Build & Tracking

## Overview
Unhide Rentals United, add a full custom card to AdminKeys (matching ProfitRoom pattern), and build out the `rentalsunited-api` edge function as a working XML adapter against the Rentals United API.

## Changes

### 1. Unhide Rentals United in config
- `src/lib/pmsSystemsConfig.ts`: Remove `hidden: true` from the `rentalsunited` entry
- `src/components/pms/channels/ChannelLogo.tsx`: Fix key inconsistency — rename `rental_united` to `rentalsunited` so it matches everywhere

### 2. Add Rentals United custom card to AdminKeys
Following the ProfitRoom card pattern exactly:

**State (in `AdminKeys.tsx`):**
- `rentalsunitedCredentials`, `rentalsunitedApiKey`, `rentalsunitedUsername`, `rentalsunitedEndpointUrl`
- `rentalsunitedEnvironment`, `editingRentalsunited`, `savingRentalsunited`, `togglingRentalsunited`

**Handlers:**
- `fetchRentalsunitedCredentials()` — query `pms_credentials` where `system_type = 'rentalsunited'`
- `handleSaveRentalsunitedCredentials()` — upsert with `api_key`, `username`, `base_url`
- `handleToggleRentalsunited()` — toggle `is_active`

**Card renderer `renderRentalsunitedCard()`:**
- Icon: `BedDouble`, title "Rentals United", badge "XML API"
- `IntegrationStatusDropdown` for tracker status
- `Switch` for on/off toggle
- `EnvironmentToggle` (sandbox/production)
- Credential fields: API Username, API Password (stored as api_key), Endpoint URL
- `PMSProgressToggles`, `PMSContactDetails`, `PMSDevNotes`
- "Field Mappings" button → `/admin/pms-config/rentalsunited`
- "Test Connection" button → calls edge function health_check

**Insert into render:** Replace `{/* Rentals United hidden */}` comment with `{renderRentalsunitedCard()}`

### 3. Expand `rentalsunited-api` edge function
Build the XML adapter following the RU developer docs:

**Authentication:** XML body with `<Authentication><ApiKey>` or `<UserName>/<Password>` tags, POST to the configured endpoint URL.

**Supported actions:**
- `health_check` — existing, enhanced to actually call RU's service connection endpoint
- `list_properties` — `Pull_ListOwnerProp_RQ` XML call
- `get_property` — `Pull_ListSpecProp_RQ` for single property details
- `get_availability` — `Pull_ListPropertyAvailabilityCalendar_RQ`
- `get_prices` — `Pull_ListPropertyPrices_RQ`
- `list_reservations` — `Pull_ListReservations_RQ`

**XML helper functions:** Build/parse XML using string templates (no external deps needed for simple XML). Include proper error parsing from RU's `<Status ID="1">` error responses.

**Credentials:** Read from `pms_credentials` table where `system_type = 'rentalsunited'`, using the authenticated user's property mapping or global credentials.

### 4. Update `RolosChannelApiCards.tsx`
Fix the key from `rental_united` to `rentalsunited` to match the system-wide convention.

### 5. Add `rentalsunited` to `getPMSIcon` switch
Add case in AdminKeys icon mapper.

## Files Summary

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/lib/pmsSystemsConfig.ts` | Remove `hidden: true` |
| Modify | `src/pages/AdminKeys.tsx` | Add RU state, handlers, card renderer |
| Modify | `supabase/functions/rentalsunited-api/index.ts` | Full XML adapter with 6 actions |
| Modify | `src/components/integrations/RolosChannelApiCards.tsx` | Fix key `rental_united` → `rentalsunited` |
| Modify | `src/components/pms/channels/ChannelLogo.tsx` | Fix key `rental_united` → `rentalsunited` |

