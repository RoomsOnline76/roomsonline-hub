# Correct check-in / check-out times sent to the channel

## What the channel actually holds right now

A live read-back of unit "Leervis" (listing 5655617, pushed 21:20 tonight) returns:

```text
CheckInFrom   14:00
CheckInTo     20:00
CheckOutUntil 10:00
HowToArrive   (empty)
```

That matches what ROL'OS has authored for RU Test Clone B (`check_in_from 14:00`, `check_in_to 20:00`, `check_out_to 10:00`), so the units re-pushed tonight are correct. The screenshot values (check-in 10:00 to 14:00, check-out 11:00) are the channel's own defaults plus a stale pre-fix state — the three units still queued in tonight's chunked push have not been refreshed yet.

Two real gaps remain, and both need fixing so this cannot recur:

1. **No validation of the channel's own rule.** The channel rejects/refuses edits where the check-out time is later than the check-in "from" time. ROL'OS lets an owner save any combination (for example check-in from 09:00, check-out 11:00) and we push it blindly, so the listing lands in the exact broken state in the screenshot and the channel UI then throws "Check-out time must not be later than the check-in time from".
2. **Silent fallbacks.** When times are not authored we quietly push 14:00 / 22:00 / 10:00 and only record a "defaults used" flag. Owners believe their times are live when they are not. Also `check_out_from` (08:00 on this property) is authored in ROL'OS but has no channel field, and the per-unit `check_in_time` / `check_out_time` columns are all empty, so unit-level times are never a real source.

## What will change

**Author-time validation (property editor)**
- Validate the three times as a set whenever they change: check-in from < check-in to, and check-out time not later than check-in from.
- Block the save with a clear inline message naming the channel rule, rather than letting the channel reject it later.
- Mark the times as a mandatory channel field so the readiness gate lists them when blank instead of letting fallbacks apply.

**Push-time normalisation (channel push)**
- One shared resolver for the times: unit-authored time, then property house rules, then default — with the resolved values and their source returned in the push result.
- Normalise format to `HH:MM` (pad `9:00`, strip seconds) before it reaches the XML.
- Enforce the channel rule server-side as a last line of defence: if the authored check-out is later than the check-in from, the unit is reported as a blocked push with the reason, not pushed with values the channel will reject.
- Report the resolved times per unit in the push summary so the toast/report shows what was actually sent.

**Delta push**
- The times live in `amenities.house_rules`, which is already fingerprinted, so an edit does queue a delta — but it is reported only as the coarse "house rules" change. Add an explicit "check-in / check-out times" label so the save toast names it, and add the per-unit `check_in_time` / `check_out_time` to the same label set.

**Repair the live listings**
- Re-push the three remaining units of RU Test Clone B so all four carry 14:00 / 20:00 / 10:00.
- Read the times back per unit after the push and report any unit the channel did not accept.

## Technical notes

- `supabase/functions/push-property-to-ru/index.ts`: replace the inline `checkInFrom / checkInTo / checkOutUntil` resolution (both the per-unit builder around line 1484 and the single-property payload around line 1791) with a shared `resolveCheckInOut()` returning `{ check_in_from, check_in_to, check_out_until, source, is_default, violation }`; surface `violation` as a push blocker.
- `supabase/functions/rentalsunited-api/index.ts`: keep the `<CheckInOut>` element order as-is (verified correct against the live read-back); only add `HH:MM` normalisation guard.
- `src/lib/channelPushFields.ts`: add a `check-in / check-out times` label mapped to `amenities.house_rules.check_in_from|check_in_to|check_out_to`.
- `src/config/propertyFieldRequirements.ts` / property form house-rules section: cross-field time validation and mandatory marking.
- No database migration required.
