

# Link HyperGuest Credentials & Metrics Across Admin Pages

## Problem
1. **DevPMS** (`/dev/pms-control`): Shows HyperGuest card with metrics but no way to edit credentials — you have to navigate separately to `/admin-keys` to find the Channel API Credentials section
2. **AdminKeys** (`/admin-keys`): Has the `RolosChannelApiCards` component where HyperGuest credentials CAN be edited, but it's buried among all other API keys with no link back to tracker/metrics
3. No cross-linking between the HyperGuest tracker status and its credential configuration

## What will be done

### 1. Add inline credential editor to DevPMS HyperGuest card
Extend the `HyperGuestDetails` component to include an embedded credential form (API Key, Secret, Endpoint, Environment) that reads/writes directly to `rolos_channel_api_config`. This way credentials can be managed right where the metrics and health checks live — no need to navigate away.

### 2. Add credential quick-edit to all distribution channel cards in DevPMS
For HotelBeds, Rentals United, and ProfitRoom cards in DevPMS, add the same inline credential section. Extract a reusable `ChannelCredentialEditor` component from the existing `RolosChannelApiCards` field definitions so both pages share the same logic.

### 3. Add quick-nav links between pages
- In the HyperGuest card on DevPMS, add a "View in API Keys" link to `/admin-keys`
- In `RolosChannelApiCards` on AdminKeys, add a "View Tracker" link to `/dev/pms-control` for each distribution channel

## Files Changed

| File | Change |
|---|---|
| `src/components/pms/ChannelCredentialEditor.tsx` | New — reusable credential form extracted from RolosChannelApiCards field definitions; reads/writes `rolos_channel_api_config` |
| `src/components/pms/HyperGuestDetails.tsx` | Add `ChannelCredentialEditor` for hyperguest; add nav link to `/admin-keys` |
| `src/pages/DevPMS.tsx` | For distribution channel cards (hyperguest, hotelbeds, rentalsunited, profitroom), render `ChannelCredentialEditor` inline |
| `src/components/integrations/RolosChannelApiCards.tsx` | Add "View Tracker →" link next to each distribution channel heading |

