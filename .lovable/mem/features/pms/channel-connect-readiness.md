---
name: Channel connect requirements live in steps 1–5
description: The pre-connect checklist above the Channel Manager embed is removed; photo reachability and the 1-28 night min-stay range are readiness checks instead
type: feature
---

"NOT ELIGIBLE" inside the White Label Channel Manager is the channel's own refusal: it
validates its minimum requirements when "Get connected" is pressed and never says which
one failed. The embed/token install is correct.

**Constraint:** there is no separate pre-connect checklist and nothing gates the embed.
`ChannelConnectReadinessPanel`, `channelConnectRequirements.ts`, `channelConnectReadiness.ts`
and `useChannelConnectFacts.ts` were deliberately deleted — do not re-add them. Every channel
requirement must be answered in mandatory steps 1–5 (`_shared/ruReadiness.ts`).

Checks added there for the requirements steps 1–5 did not cover:
- `images_reachable` (group `Photos`, advisory) — fed by the existing push-time image probe
  (`images_rejected_count` / `image_issues`): a photo the channel cannot fetch is named.
- `min_stay_within_channel_range` (group `Availability 365d`, mandatory) — `RU_MAX_MIN_STAY = 28`;
  `computeLocalBookableWindow` reports `min_stay_out_of_range` from room-type min stays and
  dated `property_availability.minimum_stay` rows.

MCQ results: the notification `Success` flag only means the check ran. `Result` is base64
JSON like `[{"ValidationErrorCode":"ImageFileNotFound","ValidationErrorExtraData":{"1":true}}]`.
`decodeMcqResult` (`_shared/ruMcq.ts` server, `src/lib/mcqResultDecode.ts` client) decodes it;
a listing with any validation error is recorded as failed, never passed.
