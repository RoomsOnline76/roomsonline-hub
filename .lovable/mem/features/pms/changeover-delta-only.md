---
name: Changeover Delta Only
description: Changeover edits push an availability-only forced delta (never prices, never a full property put); spans/seasons authorable; calendars mark nights that differ from the master rule
type: feature
---

- Changeover paths (`amenities.changeover`, `changeover_rules`, `changeover_by_unit`,
  `changeover_spans`) are listed in `CHANGEOVER_FIELD_PATHS` (`src/lib/channelPushFields.ts`).
  On save, `channelSavePush.ts` splits the rates section: changeover queues its own
  `changeover_change` delta with `forceAvailability` + `verifyAvailabilityReadback`; the other
  rate fields keep their own prices-only delta. The two never merge.
- `changeover` is in the `AVAILABILITY_ONLY` classifier of `_shared/ruDeltaScope.ts`, so the
  trigger can never carry `Push_PutPrices_RQ`. Forcing availability is required because
  changeover is baked into the availability hash and an unchanged hash used to swallow the edit.
- `refresh_ari` never writes static content: no `Pull_ListSpecProp_RQ` / `Push_PutProperty_RQ`
  rides along with a changeover change.
- Precedence for a night (`src/lib/changeoverRules.ts`, mirrored in
  `_shared/ruChangeoverRules.ts`): unit override → date-range/season span → weekday rule →
  property master → assumed both allowed.
- `amenities.changeover_spans` = `{id, from, to, code, season_id?, label?}` rows, later rows
  winning on overlap; authored in `ChangeoverRulesCard` by date range or by picking a season.
- Calendars mark exceptions only: a violet lane in week/month views on nights whose effective
  code differs from the master rule, hover naming the rule and its origin.
