---
name: Channel connect readiness & decoded content-quality results
description: Pre-flight per-channel eligibility checklist above the Channel Manager embed, plus base64 decoding of minimum-content-quality results
type: feature
---

"NOT ELIGIBLE" inside the White Label Channel Manager is the channel's own refusal: it
validates its minimum requirements when "Get connected" is pressed and never says which
one failed. The embed/token install is correct — the missing piece was our own pre-flight.

- `src/config/channelConnectRequirements.ts` — per-channel specs (Airbnb, Expedia, Vrbo,
  Booking.com, Google, LekkeSlaap): min photos, 1024x768, 700-char description,
  min-stay 1–28, address with street number, bathrooms for apartment-like types, kitchen.
- `src/lib/channelConnectReadiness.ts` — pure grader (`gradeChannelConnect`,
  `connectSummary`); cancellation rules must be continuous and never drop closer to arrival.
- `src/hooks/useChannelConnectFacts.ts` — local-only facts per published listing
  (unit values fall back to property values). No channel call.
- `ChannelConnectReadinessPanel` renders above the embed in the onboarding workspace and
  the admin Channel Onboard tab, with a browser photo probe (reachability + pixel size).

MCQ results: the notification `Success` flag only means the check ran. `Result` is base64
JSON like `[{"ValidationErrorCode":"ImageFileNotFound","ValidationErrorExtraData":{"1":true}}]`.
`decodeMcqResult` (`_shared/ruMcq.ts` server, `src/lib/mcqResultDecode.ts` client) decodes it;
a listing with any validation error is recorded as failed, never passed.
