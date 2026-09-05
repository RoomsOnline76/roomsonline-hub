---
name: Discount Ladder Push on Save
description: Long-stay / last-minute deals reach the channel on save via queueChannelDiscountSync (discounts_only), not through content or ARI deltas
type: feature
---

Long-stay and last-minute discounts live on their own channel endpoints
(`Push_PutLongStayDiscounts_RQ` / `Push_PutLastMinuteDiscounts_RQ`), so neither the static
content delta nor the ARI delta carries them.

- Every surface that writes `property_specials` or `ru_discounts` must call
  `queueChannelDiscountSync(propertyId, trigger)` from `src/lib/channelContentSync.ts` after a
  successful write (operator/cert console passes `{ manual: true }`). Fire-and-forget; a channel
  failure never fails the save, and the ordinary channel edit gate still applies.
- The edge path is `push-property-to-ru` `action: 'discounts_only'`; outcomes land in
  `ru_sync_runs` as `push_discounts`. The daily cron owns the ≥24h cadence half.

**Extra price per guest** is authored per season on the rate card
(`rolos_rate_plan_season_rates.extra_adult_rate`) and rides the nightly push as the season's
`<Extra>` amount. Without a value there, no extra-guest amount is sent.
