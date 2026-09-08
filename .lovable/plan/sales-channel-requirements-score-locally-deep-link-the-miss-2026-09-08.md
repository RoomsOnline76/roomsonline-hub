# Sales-channel requirements: score locally, deep-link the miss

The channel wizard only ever says "not eligible". This work makes ROL'OS say exactly which field is wrong, by how much, and takes the operator straight to that control.

Note on the earlier decision: the checklist that was removed was a blocking card in front of the wizard. What is built here is not a blocker — the go-live standard (stages 1–5) is untouched, and every rule that can be authored upfront gets its live hint on the field itself. The panel next to the wizard is a read-only "before you click Connect" score per channel with a Show me button on each miss.

## 1. One catalogue of channel rules

New file `src/config/channelConnectRequirements.ts`:

- `ConnectChannelId`: `all | airbnb | booking | expedia | vrbo | other`.
- `ConnectRequirement` rows: title, exact requirement sentence, section, `focusKey` (an existing `PROPERTY_FIELD_REQUIREMENTS` key), `unitOwned`, optional `staffOnly` and `appliesTo`, plus `isSatisfied` / `describeShortfall`.
- Shared rows delegate to the existing predicates (`PROPERTY_FIELD_REQUIREMENTS`, `UNIT_ROW_RULES`) — no second opinion, no re-implemented logic. The catalogue only adds the wording and the focus target.
- `gradeConnectEligibility(channel, subject)` → `{ passed, failing[] }`. `all` grades shared rows plus every overlay that applies to this listing. Staff-only rows are hidden from owners. Rows whose `appliesTo` is false are skipped.

Shared coverage (all existing keys): name and name hygiene, channel property type, 700-character description, street address, postcode, city/country, map pin, resolved channel location, 10 photos at 1024x768, hero image, property amenities, the full unit set (description, floor, size, bathrooms, toilets, max guests, bedrooms, beds cover occupancy, beds spread across bedrooms, unit photos and amenities), kitchen, check-in/out times, arrival instructions, cancellation policy, payment methods, changeover rule, min/max stay, open prices and availability, verified currency, listing contact, attraction distances, and "a listing must already be published".

Overlays we can actually measure:

- `name_length_8_50` (Airbnb, VRBO) — 8 to 50 characters, shortfall quotes the name and its length.
- `room_beds_match_max` (Airbnb, Booking.com) — bed capacity must equal the unit's max guests, shortfall prints both numbers. Go-live stays at "beds cover occupancy".
- Kitchen — Booking.com wording only, and only when the mapped type is apartment/studio/condo. Same predicate as today.
- Licence — only shown when a licence field already exists and the country is in the small listed set; otherwise a staff note, never an owner block.
- VAT/tax id — reuse the existing row as recommended.
- Expedia / Other — shared layer only.

Weaker OTA floors (Airbnb's 7 photos, 50-character description, 5 amenities) are not added as separate rows; the Airbnb chip carries one help line saying our listing standard already covers them.

## 2. Live hints while authoring

- `src/lib/channelFieldRules.ts`: add `checkChannelListingNameLength(value, { min: 8, max: 50 })`, and always show a character counter on the listing name.
- When the property name falls outside 8 to 50, reveal a sibling **Channel listing name** field (`amenities.channel_listing_name`, `data-field` attribute, new registry key, mandatory only while the main name is out of range). The published name uses it when set, otherwise the property name — one line in the existing name resolver, plus the field added to the push fingerprint if the name is already listed there.
- `UNIT_ROW_RULES.bedsMatchMax` (capacity equals max) added alongside today's `beds`; surfaced on the bed control as a recommendation with the real numbers, and treated as mandatory only on the Airbnb / Booking.com / All-channels chips.
- Sweep the priority controls (name, description, address, postcode, pin, check-in/out, bed configuration, hero image, cancellation policy) so each shows its requirement sentence, not just a pink border. No new columns.
- Server side: the 8 to 50 cap is a warning only on push, never a hard failure for a long marketing name that has a short channel listing name.

## 3. The connect panel

New `src/components/pms/channels/ChannelConnectEligibilityPanel.tsx`, mounted above the channel wizard frame in `ChannelOnboardingWorkspace` (and the admin onboard tab) once listings exist:

- Title "Sales-channel requirements"; chips All channels (default), Airbnb, Booking.com, Expedia, VRBO, Other.
- Each miss shows title, the requirement verbatim, the measured shortfall, and **Show me** → the existing `goToField(section, focusKey, unit)`.
- Green state tells the operator to open that channel in the wizard and click Connect.
- Staff rows (profile certification, channel not enabled on the account) only for admin/dev/fearless leader.
- Re-check re-grades data already in memory. No new backend function, no reading or restyling of the wizard frame.

## 4. Phrase map fix

In `src/lib/mcqRequirements.ts`:

- Fix the collision: the description rule must no longer match the bare word "character", so a generic "not eligible to connect" sentence stops being reported as a description problem.
- Add rules for "not eligible / quick check" (routes to the panel, not a field), name length, and beds versus guests.
- Unrecognised channel sentences fall through to the local catalogue for the selected chip instead of guessing a field.

## 5. Deep-link targets

Add to `CHECK_TO_FIELD_KEYS`: `beds_match_max_guests`, `name_length_8_50`, and `listing_published`. Any control without a resolvable target gets a `data-field` attribute — no one-off DOM lookups.

## 6. Copy rules

Owner-facing wording stays "Channel Manager", "sales channel", "listing", "distribution account". The vendor name and internal abbreviations never appear. Requirement and measurement stay as two separate sentences, and nothing says "try again later" when a field is simply wrong.

## 7. Tests

Name hygiene and the new length helper (empty, 6, valid, 51, ALL CAPS, emoji); beds-match-max cases; `gradeConnectEligibility` for all-channels (postcode, long name, bed mismatch), Expedia (postcode only), Booking apartment without kitchen versus a villa; and the phrase map no longer mapping "not eligible to connect" to description length.

## Out of scope

Enabling a channel at the vendor, touching the wizard frame, raising the go-live standard to beds equals max, any new backend function, a full licence or host-ID product, and anything that changes a guest total, rates, specials or the calendar.

## Done when

Shared misses jump to their control from the All-channels chip; a 62-character name shows the 8 to 50 overlay and the channel listing name field while Expedia does not treat it as a hard fail; a 4-guest unit with 2 bed places shows the exact numbers on the bed control and on the Airbnb, Booking.com and All-channels chips; a Booking apartment without a kitchen jumps to the kitchen control while a villa is unaffected; and the generic "not eligible" sentence no longer points at the description.
