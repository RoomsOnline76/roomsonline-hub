# RU white-label: sub-user authentication, richer owner/company push, image + bed fixes

## 1. Why the property push landed on the master account (confirmed)

`rentalsunited-api` builds `Push_PutProperty_RQ` with the **master** `AccessKey`/`SecretKey`
(`buildAuthXml(creds)`) and relies on a `<OwnerID>` element inside `<Property>` to attribute the
listing to the sub-user. `push-property-to-ru` only forwards the child key pair
(`childAuthPayload`) to `list_buildings` and `push_building`; `push_property`, `push_availability`,
`push_prices` and the long-stay/last-minute discount pushes are all sent under master auth.

Rentals United treats every sub-user as its own account, so an authenticated master request creates
the property on the master account regardless of `<OwnerID>` — exactly what happened with Tidal Pools.

### Fix

- Extend the child-auth envelope (already used for buildings and company details) to every
  child-scoped action: `push_property`, `push_availability`, `push_prices`,
  `push_long_stay_discounts`, `push_last_minute_discounts`, plus the matching pulls used to verify a
  push (`get_property`, `get_availability`, `get_prices`, `list_owner_properties`).
- When child keys are present, authenticate as the child and **omit** `<OwnerID>` (same rule already
  proven for `Push_FillCompanyDetails_RQ`). Keep the master + `<OwnerID>` shape only as the explicit
  legacy fallback for accounts with no stored keys.
- `push-property-to-ru` forwards `childAuthPayload` on every one of those invocations, and refuses to
  push (clear `RU_CHILD_KEYS_REQUIRED` error) rather than silently falling back to master auth for an
  account that has keys on file.
- Log `auth_mode` on each of those calls and record it in `ru_sync_runs` details so a master-auth
  regression is visible in the Sync Observability tab.
- Add a guard in the certification suite: after a push, confirm the new RUID appears under
  `Pull_ListOwnerProp_RQ` **for that sub-user**, and fail the step if it only appears on the master.

## 2. Images flagged "may be invalid"

Today every image is sent as a bare URL with `ImageTypeID` 1/3, and readiness counts images with
unknown dimensions as passing (`images_size_unverified` is folded into `images_meeting_size`). RU
fetches each URL and rejects anything unreachable, too small, or not a plain public image.

- Add a pre-push image verification step: fetch each image URL (HEAD, then ranged GET when needed),
  capture content-type, byte size and real pixel dimensions, and cache the result on the image record.
- Drop images that fail verification from the payload instead of sending them, and report each
  rejected image with its reason (unreachable, not an image, below 1024x683, signed/expiring URL) in
  the Rentals United Sync Readiness card and the certification console.
- Stop treating unknown dimensions as a pass — unverified becomes an explicit "not yet verified"
  state that the verify step resolves.
- Because RU needs stable public URLs, verification also flags URLs carrying query-string tokens or
  pointing at a private bucket path.

## 3. "Add sufficient amount of beds"

Beds are only emitted as bed amenities inside `CompositionRoomAmenities CompositionRoomID="257"`
blocks derived from `bed_configuration`, and:

- the bed-type lookup only matches a short list of slugs (`single`, `double`, `queen`, `king`,
  `sofa-bed`, `bunk`), so ROLOS labels like "Queen Bed", "3/4 bed", "sleeper couch", "twin beds"
  fall through to a single default double with the raw entry count;
- the single-property builder (`buildSinglePropertyPayload`, used when a property is pushed as one RU
  listing) ignores `bed_configuration` completely and emits one bedroom with **one** bed per room
  type, which is what RU is complaining about.

### Fix

- Normalise bed labels properly (strip "bed/beds", handle 3/4, twin, sleeper couch, futon, cot,
  bunk, king-single, etc.) with a single shared mapper used by both builders.
- Feed real `bed_configuration` into the single-property builder, aggregating per room type.
- Ensure the emitted bed amenity counts total at least the RU minimum (>= 50% of `CanSleepMax`), and
  when ROLOS data genuinely falls short, surface it as a readiness gap naming the unit instead of
  silently sending one bed.
- Report unmapped bed labels in the readiness card so the owner can correct the wording.

## 4. Owner (My Profile) push — more fields

`Push_CreateUser_RQ` only carries first name, last name, email, password and locations. Everything
else on RU's My Profile page (address, city, post code, country, mobile, nationality, language,
"what describes you best") is set through the profile/company call, not user creation.

- Verify each field against the current `Push_FillCompanyDetails_RQ` schema and send every supported
  one: contact address, city, post code, country, phone/mobile, birth date, language, nationality and
  the owner-type descriptor.
- Where ROLOS has no field for a supported value, add it to the RU account (owner) form in
  **Portfolios → RU accounts**: nationality, language, mobile, owner-type, and the contact address
  block, with sensible defaults inherited from the portfolio/property.
- Values RU has no API field for are documented in the UI as "portal-only" so nobody expects them to
  push.

## 5. Company profile push — more fields

The RU Company Profile page carries far more than we send today (we send company name, website, city,
address, country, post code, phone, VAT, merchant name, locations).

- Verify support and add: time zone, region, manager identification number, confirmation email,
  business description, number of employees, number of properties, years in business, main
  destination, legal-representative block (name, address, city, post code, country of residence,
  nationality, email, birthday) and the Matching Profile answers (can charge by credit card, can send
  confirmations, channels charging on your behalf, rack vs net rates, accept another site's
  cancellation policy, commission-secured bookings).
- Add a **Company profile** editor for these in the RU account UI, pre-filled from the portfolio /
  property owner record, with the Matching Profile answers defaulted to the RoomsOnline standard
  (net rates, we charge the card, we send confirmations, pre-payment required).
- Only verified-supported fields go on the wire; unsupported ones are stored in ROLOS and labelled
  portal-only.

## Technical notes

- `rentalsunited-api` is under adapter lock for the child authentication builders,
  `fill_company_details`, `push_property`, `push_building`, `list_buildings`, `get_building`.
  This plan edits those locked regions — approving it is the explicit approval.
- Field-support verification is done against the RU reference before any new element is added; each
  new element is added in its correct XSD position and smoke-tested against a test sub-user
  (`Status ID="0"`), since RU rejects out-of-order elements outright.
- New ROLOS columns for the owner/company profile fields land on the RU account record with GRANTs
  matching the table's existing policies; nothing secret is returned to the browser.
- Redaction of `AccessKey`, `SecretKey` and `Password` in logs stays intact.
- Deploy and smoke-test `rentalsunited-api`, `push-property-to-ru` and `ru-cert-portal`: push Tidal
  Pools under child auth and confirm the RUID appears on the sub-user account, not the master.

## Verification I could not do up front

Which of the extra My Profile / Company Profile fields the RU XML API actually accepts is not
confirmed from the code in this repo — step 1 of the build is checking the RU reference for each one
and only wiring the supported ones.
