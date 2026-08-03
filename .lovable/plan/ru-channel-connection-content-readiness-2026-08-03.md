# RU Channel-Connection Content Readiness

## Verification result (what is already pushed)

All 15 minimum-content elements are already emitted by the property push and scored by the readiness validator:


| RU requirement                        | Status                         | Source in ROLOS                                 |
| ------------------------------------- | ------------------------------ | ----------------------------------------------- |
| Name                                  | Pushed + scored                | Property name                                   |
| ObjectTypeID                          | Pushed + scored                | Property type / RU building composition         |
| CanSleepMax                           | Pushed + scored                | Room type occupancy                             |
| Floor                                 | Pushed + scored                | Rooms → Floor selector (per unit type)          |
| Space                                 | Pushed + scored                | Rooms → Room size (m²)                          |
| Street / ZipCode / DetailedLocationID | Pushed + scored                | Address fields + RU Location picker             |
| Latitude / Longitude                  | Pushed + scored                | Map / coordinates                               |
| Amenities (min 10)                    | Pushed + scored                | Amenities tab                                   |
| CompositionRooms (rooms provided)     | Pushed + scored                | Room types / bedrooms                           |
| Room amenities + beds vs guests       | Pushed + scored                | Rooms → Amenities & bed configuration           |
| Descriptions                          | Pushed + scored                | Description tab                                 |
| Images (min 10, 1024x683, main photo) | Pushed + scored                | Images tab (heart = main photo)                 |
| PaymentMethods                        | Pushed, but **not authorable** | Hard-coded fallback `[1, 2]`                    |
| CancellationPolicies                  | Pushed, but falls back         | Policies tab (default 100%/50% used when empty) |


Three real gaps remain, all of them silent fallbacks that will satisfy RU's validator with data the owner never confirmed:

1. **Payment methods** have no UI anywhere in property setup. Every property is pushed as "Cash + Credit card" regardless of what it actually accepts.
2. **Floor and size** only exist per room type. A property with no room type authored is pushed with Floor 0 and Space 50 m² defaults.
3. **Cancellation policy** silently defaults when the Policies tab is empty, and the push never tells the admin that it substituted a default.

## What to build

### 1. Accepted Payment Methods (new UI)

Add a "Accepted payment methods" panel to the Policies tab of property setup (embedded ROLOS view included), writing to `amenities.payment_methods`.

- Multi-select of the RU payment dictionary already mapped in the push (cash, credit card, bank transfer, PayPal, cheque, debit card, EFT, etc.), RU-supported options first.
- Pink asterisk as mandatory, minimum 1 selection.
- Inherit defaults from portfolio when a portfolio property has none set, matching the existing branding/payment inheritance pattern.
- Remove the blind `[1, 2]` fallback in the push: when nothing is authored, keep the push working but flag `payment_methods_is_default` so readiness shows it as unconfirmed rather than green.

### 2. Property-level Floor and Size fallback

Add "Floor" and "Property size (m²)" fields to the property General/Identity section, used when no room type supplies them.

- Push order becomes: unit value → property value → default (and the default keeps setting `floor_is_default` / `space_is_default`).

### 3. Cancellation policy honesty

Flag `cancellation_policies_is_default` in the push validation when the default schedule was substituted, and surface it in the readiness card as note ("default policy used — confirm terms"). If successful, passed

### 4. Channel Content Readiness card

Extend the existing Rentals United readiness panel in property setup so it lists all 15 RU minimum-content items in RU's own wording, each with green / amber (default or padded value used) / red (blocking), plus a jump link to the tab that fixes it. Amber states to expose: padded amenities, default floor, default size, default payment methods, default cancellation policy, unverified image dimensions, beds below guest count.

## Technical notes

- Payload builder and validator: `supabase/functions/push-property-to-ru/index.ts` (`buildValidation`, `mapPaymentMethods`, `mapCancellationPolicies`, `resolveUnitFloor`, space resolution at both single-unit and multi-unit branches).
- UI: `src/pages/PropertyForm.tsx` (General/Identity fields, Policies tab), `src/components/property/PushToRentalsUnited.tsx` (readiness card), room-level values stay in `src/components/property/RoomManagerTab.tsx`.
- New payment-method picker as its own component under `src/components/property/` to keep `PropertyForm.tsx` from growing.
- No schema migration needed: payment methods, floor and size all live in the existing `properties.amenities` JSONB.
- Both dry-run and live push paths must score identically (they already share `buildValidation`).