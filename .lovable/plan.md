# Guest confirmation email: match sample content, rebuild layout on brand

The sample (Nightsbridge-style) confirmation carries more useful content than our current guest email, but its layout is plain. We keep our brand look, upgrade it, and add every content block from the sample. Journey / brochure / itinerary emails are untouched.

## Content blocks to have in the guest email

Sourced from data we already store; each block is omitted when the data is absent.

1. **Greeting** — "Thank you for booking with {property}" + "Dear {guest first name}".
2. **For queries please call** — public property phone (property contact details, public rows).
3. **Booking information** — Arriving (full weekday date), Leaving, Staying (n nights), Booking reference (`ROL-<PROP>-<NNNN>`).
4. **Accommodation** — per room/unit line: room type name, meal/rate plan basis, occupancy, per-night rate, line total; multi-unit and per-room dates supported (already available).
5. **Totals** — Accommodation total, extras/charges, Total amount, Deposit amount / amount due now, Balance and due date.
6. **Booking notes** — special requests.
7. **Payment or deposit instructions** — paid bookings show the existing payment-confirmed block; unpaid/reservation-only show banking details, payment reference and proof-of-payment email (extends today's reservation-only-only block to any deposit-due booking).
8. **Property details** — welcome/host name, physical address, email, website, cell, tel, "View on Google Maps" link built from latitude/longitude.
9. **How to get here** — coordinates plus arrival/check-in instructions text (`amenities.house_rules.check_in_instructions`, room-level fallback). No dedicated "directions from airports" field exists today, so we add an optional **Directions / how to get here** rich text field in the property editor (House Rules / Arrival group) that feeds this block and the channel arrival instructions.
10. **Cancellation policy** — rendered from the resolved policy tiers (reservation policies library / master mode), as a readable list like the sample.
11. **Other terms and conditions** — house-rules fine print, deposit terms, pets/smoking flags.
12. **Sign-off** — "Enjoy your stay!" plus the existing contact footer.

## Layout and branding

- Rebuild the email as a single 600px card in the Equatorial Luxe direction: ivory body, charcoal header band, pink accents, generous spacing, Italiana-style display headings with web-safe fallbacks (serif) and clean sans body.
- Per-property personalisation stays first-class: property logo, brand primary/secondary/font colours and heading font from `brand_*` columns when `brand_override_enabled`, otherwise the ROL palette. Sender name/reply-to logic unchanged.
- Content organised as clear labelled sections with quiet dividers instead of the current bordered tables: hero (property name + confirmed badge + reference), booking information grid, accommodation table with money right-aligned, totals block with emphasised amount due, notes, payment/deposit panel, property details with map link, how to get here, policies, sign-off.
- Mobile-first: stacked table cells, 16px minimum body text, single-column at narrow widths, inline styles only (no external CSS), alt text on the logo.
- Failure email, property notification and admin alert emails inherit the same header/footer/section primitives so everything looks consistent.

## Technical notes

- All work in `supabase/functions/send-booking-email/index.ts`: extract shared layout primitives (`section`, `keyValueRow`, `moneyTable`, `panel`) and rewrite `generateEmailHeader`, `generateEmailFooter`, `generateInvoiceSection`, `generateSuccessEmail`, plus generalise `generateReservationPaymentBlock` into a deposit/payment-instructions block.
- Data hydration extended in the handler: public contact rows (phone/email), `property_bank_details` fallback (already present), `latitude`/`longitude`, `address`/`postal_code`/`city`, `property_url`, `amenities.house_rules` (arrival, fine print, deposit terms), resolved cancellation policy text via the existing policy resolution helper.
- New optional property field `amenities.house_rules.directions` written by the property editor (Setup Property → House Rules) and read by the email and the RU arrival instructions builder.
- Template placeholder list (`MESSAGE_PLACEHOLDERS`, custom-template variables) extended with deposit amount, balance, banking, cancellation policy and directions so custom property templates can use them; `EmailTemplatePreview` mock data updated to match.
- No schema migration needed (JSONB house rules + existing columns). Deploy `send-booking-email` after the change and send one test to verify rendering.
