# Channel connection: turn "NOT ELIGIBLE" into a guided wizard

## What is actually happening

The white-label frame is installed correctly (token pair, one-line script, owner id, branding all in place). The "NOT ELIGIBLE" message is produced by the Channel Manager itself when you press *Get connected*: it validates the listing against that channel's minimum requirements in the background, and only launches its Connection Wizard when the listing passes. If it fails, it stops at the eligibility message — [the documented behaviour for every channel](https://docs.rentalsunited.com/external/en-gb/Content/Sales%20Channels/Expedia/02-Expedia-Onboarding-newdesign.htm).

So nothing is missing in the installation. What is missing is on our side:

- We never tell the owner, before they press connect, which requirements their listing fails.
- We already ask the channel for a content-quality verdict, but the answer is stored encoded and never decoded. The most recent verdicts we hold decode to `ImageFileNotFound` with a list of photo positions — the channel could not fetch several of our photos. That alone can block eligibility.
- Content-quality checks are ordered against a single fixed channel, so an Airbnb-specific verdict is never requested.

Confirmed for the RentalsTest example: AlbatrosTEST (listing 5975194) and Sealion (listing 6059059) each have one live listing, 10 photos, descriptions over 700 characters, address and coordinates — so the failure is most likely photo fetchability and channel-specific gaps, not basic content.

## What we will build

### 1. Per-channel requirement catalogue
A new `src/config/channelConnectRequirements.ts` holding each channel's published minimum requirements (name, type, bathrooms rule, max guests, address, coordinates, kitchen room, beds matching guests, 700-character description, photo count and 1024x768 minimum with a main photo chosen, prices and availability, minimum stay 1-28, payment methods, cancellation policy that is continuous and non-decreasing towards arrival). Airbnb, Expedia, Vrbo, Booking.com, Google and LekkeSlaap to start.

### 2. "Ready to connect" panel on the Channels page
Above the frame, a channel picker plus a checklist graded from our own data for the selected channel and listing: every requirement green or red, each red one with the exact rule and a link straight to the property-editor section that fixes it. Owners only enter the frame once the checklist is green, so the eligibility wall stops being a dead end.

### 3. Decode and surface the channel's own verdict
Decode the content-quality result we already receive into structured failing points, store them, and show them in the same panel (and in the existing content-quality report for staff). Add the codes we see in real traffic - starting with `ImageFileNotFound` and its photo positions - to the existing requirement mapping so each one reads as a plain instruction.

### 4. Fix unreachable photos
Check each photo URL we send is publicly reachable and at least 1024x768, flag the ones that are not on the panel, and re-send the photo set for the listing once they are fixed.

### 5. Ask for the verdict per channel
Resolve the target channel's own id from the channel list before ordering the check, instead of always using the default channel, so an Airbnb verdict is genuinely an Airbnb verdict.

## Technical notes

- New: `src/config/channelConnectRequirements.ts`, `src/lib/channelConnectReadiness.ts` (pure grader), `src/components/pms/channels/ChannelConnectReadinessPanel.tsx`.
- Edit: `PMSChannels.tsx` / `ChannelOnboardingWorkspace.tsx` to mount the panel above `RuWhiteLabelEmbed`; `src/lib/mcqRequirements.ts` for the validation-code map; `supabase/functions/ru-lnm-handler/index.ts` to base64-decode the MCQ payload into structured `failing_points`; `supabase/functions/_shared/ruMcq.ts` + `ru-cert-portal` for per-channel ordering; an image-reachability probe reusing the existing image audit hook.
- Migration: add `failing_points jsonb` to `ru_mcq_orders` (with grants) if absent; no other schema change.
- Adapter locks respected: no change to inventory or ARI read paths. Vendor naming stays out of owner-facing copy.
- Verification: unit tests for the grader against the two RentalsTest listings, decode test for a real MCQ payload, then a live re-order of the check for Albatros against the Airbnb channel and a screenshot of the frame after the checklist is green.
