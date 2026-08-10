# Only show real voucher codes in Journey

The voucher code guests see in the Journey brochure is invented at render time — `generate-itinerary-pdf` mints a random code (`SUNSET-4F2A`, `EXPLORE-…`) with a randomly picked description ("25% off your next local experience", "Complimentary sunset drinks…"), stores it in `experience_vouchers`, and prints it on the brochure. Nothing validates or redeems it: the checkout voucher field on `/journey/checkout` validates against `promo_codes` only, so these codes always fail. TOBI's delight engine does the same thing (`generateVoucherCode` producing `VIP-CPT-…` / `EXPLORE-…`).

## What changes

A voucher only appears in Journey when a property/portfolio has actually loaded one.

1. **Brochure (Journey PDF)** — stop generating random codes. Instead look up a real, currently usable promo code for the journey's properties: `promo_codes` that are active, inside their `valid_from`/`valid_until` window, not over `max_uses`, and either scoped to one of the journey's properties or global. If one is found, show it in the gift/voucher block with its own description and expiry. If none, the voucher block is omitted entirely (no placeholder, no "gift awaits you" copy).
2. **Existing invented vouchers** — brochures already issued keep working: if an `experience_vouchers` row exists for that itinerary it is still shown, but no new ones are minted.
3. **TOBI delights** — the silver/gold/platinum tiers stop attaching fabricated codes. A delight becomes either a genuine local tip / note (no code) or, when a real promo code exists for the property, that code. Codeless delights keep their friendly wording without implying a redeemable discount.
4. **Checkout stays authoritative** — nothing about `validate-voucher` or the checkout field changes; a code that shows in the brochure now actually validates there.

## Technical notes

- `supabase/functions/generate-itinerary-pdf/index.ts`: replace `generateSurpriseVoucher` with `resolveRealVoucher(supabase, itineraryId, propertyIds)` — read-through of existing `experience_vouchers` row first, else query `promo_codes` (active, date-valid, uses remaining, `property_id in (...) or property_id is null`) and return `{ code, description, valid_until }`; return `null` when nothing qualifies. `generateVoucherHTML(null)` already renders nothing, so the section disappears cleanly. Remove the random prefix/description arrays and the insert of fabricated codes.
- `supabase/functions/ai-booking-concierge/index.ts`: delete `generateVoucherCode` and make `generateValueBasedDelight` code-free unless a real promo code is available (the function already fetches usable vouchers via `fetchOffers`/`isVoucherUsableForStay` — reuse that result). Prompt rule "never invent codes" stays.
- No schema change. `experience_vouchers` is kept read-only for historic brochures.
