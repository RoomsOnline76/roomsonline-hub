---
name: Channel fee/tax type tagging
description: Each property charge carries channel_fee_type (explicit RU FeeTaxType) and shows an accepted/unknown tag; dictionary mirrored in src/lib/channelFeeTaxTypes.ts and _shared/ruFees.ts
type: feature
---
Fees/taxes must publish under a code the channel accepts, otherwise they land in the portal as an "unknown tax".

- `property_charges.channel_fee_type` (smallint, nullable) is the operator's explicit FeeTaxType pick; NULL = derive from the charge name; 0 = other/unknown.
- Accepted codes (measured/documented only, never invent): 41 Cleaning, 18 Housekeeping, 34 Resort, 33 Service, 29 Pet, 31 Parking, 36 Tourism.
- Dictionary + classifier live in `src/lib/channelFeeTaxTypes.ts` (UI) and `supabase/functions/_shared/ruFees.ts` (wire) — keep both in step. `RU_CHARGE_COLUMNS` includes `channel_fee_type`.
- Every charge in the Fees & Taxes list and the editor shows a tag: green accepted type, red "Unknown tax", grey Deposit (deposit slot) or Not sent (inactive / zero / included in rate).
