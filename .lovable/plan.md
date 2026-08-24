# Fix Owner binding readout: portfolio count and listing status

Two labels in Channel Monitor → Onboard Property → Owner binding read wrong for portfolio-onboarded properties.

## What is actually true (verified)

For the Jongensfontein.com portfolio:

- It has **4 member properties** (Seesig, Tidal Pools, Dassiesingel, Fonteinhutte), all active.
- Dassiesingel — the selected property — is **published**: 4 of 4 expected unit listings verified on the channel, last verified today. Fonteinhutte has 9/9, Tidal Pools 4/4, Seesig has 9 unit listings recorded.

So the panel's "Portfolio-wide (3 sibling properties)" and "Listing: not published" are both misleading.

## Why they read wrong

1. **Scope count** — the readout counts *siblings* (members excluding the selected property), so a 4-property portfolio prints "3". Correct arithmetic, wrong story for the user.
2. **Listing** — the label prints only the property-level channel id (`properties.rentalsunited_property_id`), which stays empty for these portfolios because publishing happens as **standalone unit listings** (recorded per room type, plus the verified-units counters on the property). With no property-level id, it always falls back to "not published" even when every unit is live.

## Changes

- **Account scope**: print total properties on the account, i.e. `Portfolio-wide (4 properties)` — derived from siblings + the selected property. Keep the re-bind warning copy as is (it correctly talks about *other* properties affected).
- **Listing**: resolve published state from the real publishing signals instead of the single property-level id, in this order:
  - property-level channel id, if present (single-listing properties),
  - otherwise verified unit listings — show e.g. `4 of 4 units published` with the last-verified date,
  - otherwise unit listing ids recorded but never verified — show `4 units recorded · not verified`,
  - only when none of the above exist — `not published`.
- Surface the same resolved state consistently so the panel never claims "not published" while the header shows live listings.

## Technical notes

- `supabase/functions/ru-onboard-property/index.ts` → `gate_status`: extend the `property` block with the unit-listing signals (`ru_listings_verified_units`, `ru_listings_expected_units`, `ru_listings_verified_at`, count of room types carrying a channel listing id) and return `sibling_properties` unchanged.
- `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`: update the Account scope and Listing `<dd>` values to use the new fields; add a small pure helper for the listing label so the wording is defined in one place.
- No channel calls, no writes, no schema change — this is a read/label correction only.
