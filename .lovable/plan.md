# Lean out the RU onboarding traffic (RU Test 4 / OwnerID 742570)

## What the traffic log actually shows

The 18:00–18:04 onboarding run for RU Test 4 made these calls (in order):

```text
18:00:31  Push_CreateApiKey_RQ                     ok
18:00:36  Push_FillCompanyDetails_RQ               ok
18:00:39  Pull_ListOwnerProp_RQ   (adopt listings) ok
18:00:49  Push_ChangeCurrency_RQ                   status 339 "Location already has the requested currency"
18:00:50  Pull_ListOwnerProp_RQ   (push_property)  429 throttled   <- duplicate of 18:00:39
18:01:10  Pull_ListOwnerProp_RQ   (push_property)  429 throttled   <- duplicate
18:01:56  Pull_ListOwnerProp_RQ   (push_property)  ok              <- 77s lost to the retry ladder
18:01:57  Push_PutProperty_RQ                      ok
18:02:00  Push_PutAvbUnits_RQ  + Pull_...Calendar  ok  (push + read-back)
18:02:02  Push_PutPrices_RQ                        ok
18:02:05  Pull_ListPropertyPrices_RQ               ok  (price read-back)
18:02:05  Pull_ListPropertyPrices_RQ               429 throttled   <- coverage audit re-reads the same window
18:02:10  Pull_ListSpecProp_RQ    (currency check) ok
18:02:14  Push_SetPropertiesStatus_RQ (entitlement) ok
18:02:16  Push_PutAvbUnits_RQ                      429 throttled   <- second, unnecessary ARI round
18:03:00  Push_PutAvbUnits_RQ  + Pull_...Calendar  ok
18:03:02  Push_PutPrices_RQ                        ok
18:04:02  Pull_ListPropertyPrices_RQ               ok
```

Four verified sources of duplication — 5 throttles and roughly 3 of the 4 minutes are pure waste.

## The four fixes

1. **One owner-roster read per run.** `resolve_ru_property_ids` (Step A adoption) and the
   publish step each ask `Pull_ListOwnerProp_RQ` for the same owner seconds apart. The
   existing snapshot only lives in one warm worker's memory, so the second function never
   sees it. Move that snapshot to a short-lived shared cache (same pattern as the existing
   roster cache, ~60s, keyed by OwnerID) so the publish adopts the read Step A already paid
   for. Removes 3 calls, 2 throttles and the 77s retry ladder.

2. **One price read-back, not two.** The post-push verification and the 365-day coverage
   audit both pull `Pull_ListPropertyPrices_RQ` for the same listing and window in the same
   second. Have the verification hand its already-parsed price XML to the coverage audit
   (audit only pulls when it has no XML, e.g. cron use). Removes 1 call and 1 throttle;
   the coverage verdict stays derived from the channel's own copy.

3. **No second ARI round after activation.** Enabling Channel Manager fires
   `push-property-to-ru → refresh_ari` (`channel_monitor_unit_activation` /
   `channel_monitor_reactivation`) immediately after Step B has just pushed availability and
   prices. Suppress that refresh when the listing had a successful ARI push within the last
   few minutes (and pass an explicit "ARI already current" flag from the onboarding
   entitlement call). Removes 4 calls and 1 throttle.

4. **Skip the no-op currency write.** `Push_ChangeCurrency_RQ` is sent unconditionally and
   answered 339 (already set). Send it only when the currency we hold differs from the
   published one — the `Pull_ListSpecProp_RQ` verification already tells us that, so on an
   already-correct location it becomes zero calls.

## Resulting essential sequence

```text
Step A: Push_CreateApiKey_RQ -> Push_FillCompanyDetails_RQ -> Pull_ListOwnerProp_RQ
Step B: Push_PutProperty_RQ -> Push_PutAvbUnits_RQ -> Pull_ListPropertyAvailabilityCalendar_RQ
        -> Push_PutPrices_RQ -> Pull_ListPropertyPrices_RQ (verify + coverage from one read)
        -> Pull_ListSpecProp_RQ (currency, + Push_ChangeCurrency_RQ only if it differs)
        -> Push_SetPropertiesStatus_RQ  (+ RLNM subscription, unchanged)
```

Order and flow are unchanged; only repeats are removed. Every step keeps its read-back proof,
so Step A/B verdicts and the coverage audit are still evidence-based.

## Technical notes

- `supabase/functions/rentalsunited-api/index.ts` — promote `OWNER_LISTING_SNAPSHOTS` to a
  DB-backed short-TTL cache so all functions share one roster read; keep the in-memory tier
  as the fast path.
- `supabase/functions/_shared/ruPriceCoverage.ts` — `auditChannelPriceCoverage` accepts an
  optional pre-fetched `priceXml`; only pulls when absent.
- `supabase/functions/push-property-to-ru/index.ts` — pass the verification XML into the
  audit; gate `refresh_ari` on a recent successful ARI push; make the currency write
  conditional.
- `supabase/functions/channel-manager-entitlement/index.ts` — accept and honour a
  `skip_ari_refresh` flag; orchestrator sends it from the `entitlement` task.
- No schema change beyond the shared roster-cache row; no UI change. Verification: re-run
  onboarding on a test property and confirm the log shows the sequence above with zero 429s.
