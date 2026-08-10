---
name: No invented voucher codes
description: Guest-facing vouchers (Journey brochure, TOBI delights) may only show real, redeemable promo_codes — never generated codes
type: constraint
---

Never fabricate voucher/promo codes anywhere guests can see them (Journey brochure PDF, TOBI delights, emails, chat copy). Patterns like `SUNSET-4F2A`, `VIP-CPT-1234`, `EXPLORE-...` are forbidden.

**Why:** checkout validates only against `promo_codes`, so invented codes always fail and break trust.

**How to apply:**
- Resolve codes via a real lookup: `promo_codes` where `is_active`, inside `valid_from`/`valid_until`, under `max_uses`, and `property_id` matching the stay's property or NULL (global). Prefer property-specific over global.
- Shared helper: `findRealVoucherCode()` in `supabase/functions/_shared/delight-engine.ts`; the brochure uses `resolveRealVoucher()` in `generate-itinerary-pdf`.
- If no code qualifies, omit the voucher block / deliver the delight code-free (local tip, upgrade flag) with no discount implication.
- `experience_vouchers` is read-only for historic brochures — never mint new rows.
