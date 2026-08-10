# Content-quality validators — close the gaps and produce cert evidence

## Current state (verified)

`push-property-to-ru` builds a `validation` object per unit (`buildValidation`), and `_shared/ruReadiness.ts` turns it into scored checks used identically by the ROL'OS scorecard, the certification console and the live-push gate.

Already enforced today:
- Name present (≥ 3 chars), property type, CanSleepMax ≥ 1
- ≥ 10 images, main image flagged, image probe + pixel size scoring
- Street, ZIP (non-placeholder), DetailedLocationID > 1, coordinates
- ≥ 1 payment method and ≥ 1 cancellation policy (with "is default" flags)
- Bathrooms / toilets present, rooms defined, sleeping places ≥ 50% of CanSleepMax
- Availability + price coverage over 365 days (live RU read-back in `ru-cert-portal`)

Confirmed gaps against the checklist:
1. **Name rules** — no emoji / special-character / ALL-CAPS validation at all.
2. **Description length** — presence is mandatory, but only 100 chars is advisory; no 700-char gate.
3. **Image dimensions** — minimum is 1024×683 (ROL'OS upload rule), not the cert's 1024×768, and images whose size could not be measured pass on the `verified` probe flag alone.
4. **MinStay / 3 consecutive bookable days** — MinStay is sent per period but never asserted as set; no check for ≥ 3 consecutive open days with price > 0.
5. **CheckInFrom / CheckOutUntil** — defaulted silently to 14:00 / 10:00, never validated or flagged as a default.
6. **Composition strictness** — bathrooms/toilets are checked, but not "≥ 1 bedroom", "kitchen present", or "beds distributed between rooms" (a single room holding every bed currently passes).
7. **ArrivalInstructions** — pushed when present, never validated.

## What will be built

### 1. New validator fields (`buildValidation`)
- `name_clean`: rejects emoji/pictographs, `<>{}|\^~[]` style specials, and strings where all letters are upper case (with ≥ 4 letters, so acronyms like "B&B" survive).
- `description_meets_cert`: length ≥ 700 (mandatory for the RU cert group), keeping the existing 100-char advisory as-is.
- Image sizing: raise the RU push minimum to **1024×768** and stop counting unmeasured images as passing — they become an explicit `images_size_unverified` advisory plus a mandatory "all photos measured ≥ 1024×768" check. ROL'OS upload guidance stays at its current rule; only the channel gate tightens.
- `has_check_in_from` / `has_check_out_until` plus `check_in_times_are_default` so a silently-defaulted 14:00/10:00 is reported rather than counted as authored.
- `has_bedroom` (≥ 1 composition room of a bedroom type), `has_kitchen` (kitchen room/amenity), `beds_distributed` (when the unit has ≥ 2 bedrooms, more than one room must carry bed entries).
- `has_arrival_instructions` (non-trivial text, ≥ 20 chars).
- `min_stay_set` and `bookable_window_ok`: derived from the availability/price entries the push already computes — at least one run of 3 consecutive days that is open, has units > 0 and a price > 0.

### 2. Scoring (`_shared/ruReadiness.ts`)
Add matching checks in the existing groups (Content, Rooms & beds, Photos, Availability 365d, Pricing 365d) with plain-language `detail` and `fix_hint` for each, wired as mandatory where the checklist says so (name rules, 700-char description, image size, bedroom/kitchen/bed distribution, check-in/out, arrival instructions, 3-day bookable window) and advisory for the softer ones (unmeasured photo sizes, default check-in times). Because the gate, the ROL'OS scorecard and the console all read this file, all three tighten together.

### 3. Live-push verification + evidence
- `ru-cert-portal` gains a `content_quality` evidence block per property/unit: each validator, pass/fail, observed value (description chars, image count and smallest dimensions, bed distribution, first bookable 3-day window) and the timestamp of the run.
- The certification console (`ChannelCertificationTab.tsx`) renders a **Content quality** section listing the 10 checklist items per unit with observed values, and the existing export is extended so the block lands in the support/evidence bundle (JSON + PDF) for RU.

### 4. Verification
Run the validators against the live active properties (Jongensfontein units, Latter Days, Woodlands Close, Victorian sample) via a dry-run push and record the resulting evidence, so the plan's outcome is real data rather than an assertion.

## Impact note

Tightening image size to 1024×768 and adding a mandatory 700-character description will flip some currently-passing units to blocked until owners fix them. The failures surface as specific, fixable gaps with fix hints in the ROL'OS scorecard rather than silent push errors.
