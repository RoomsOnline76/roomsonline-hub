---
name: Partner / affiliate perks
description: property_partner_offers authoring under Specials → Partner offers, post-payment surprise reveal in brochure/email/guest portal, never a stay discount
type: feature
---

Properties can load **partner / affiliate perks** (wine tasting, spa, restaurant credit, tours) separate from `promo_codes`.

- Table: `public.property_partner_offers` — partner_name, title, description, redemption_instructions, redemption_code (nullable, real partner code only), partner_url, partner_contact, image_url, valid_from/until, max_redemptions, current_redemptions, min_nights, is_active.
- Authoring: **Property Setup → Specials → Partner offers** (`src/components/property/PartnerOffersTab.tsx`), identical in ROL'OS Setup Property and Admin → Edit property, for ROL'OS and non-ROL'OS properties alike.
- Perks NEVER discount the stay, never appear at checkout, and never alter a total.
- Reveal is post-payment only (`payment_status = paid` or `status = confirmed`): journey brochure PDF, confirmation email, guest portal.
- Shared server helper: `fetchQualifyingPartnerOffers()` + `renderPartnerOffersHTML()` in `supabase/functions/_shared/partner-offers.ts`. Client: `src/components/guest/GuestPartnerPerks.tsx`.
- Codes are never generated — see the no-invented-voucher-codes constraint.
