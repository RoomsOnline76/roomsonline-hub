# Re-grade the Ready-to-sell steps after a blocker is fixed

## What's happening

Fixing the check-out time and saving does not move the step back to green. Confirmed in the code:

- On save, `PropertyForm` only calls `markChannelStepsStale(...)`. Nothing re-grades the step and nothing invalidates the wizard's ledger cache.
- A Ready-to-sell step (steps 1–5) is green only when the durable ledger row says complete **and** live data shows zero mandatory blockers. Marking a row stale keeps its previous verdict, so a step that was recorded as `blocked` stays blocked until someone presses Refresh in the wizard.

So the correction is saved, but the step keeps the old "blocked" verdict — exactly the "not re-evaluated, cannot progress" behaviour.

This is a preparation-only re-grade: no channel/RU request is involved.

## The fix

1. Add one helper that a save can call: mark the affected steps stale, then immediately re-grade the ledger **locally only** (the scoring path with the live channel probe hard-wired off), and refresh the wizard's cached ledger. Never throws — a bookkeeping failure must not fail the save.
2. Call it from every save surface that currently only marks steps stale: the property editor save, the content/rates sync helper, and the billing/entitlement tab.
3. Invalidate the wizard's ledger query on save so the step list, score and the 1–5 badges repaint with the fresh verdict instead of the stale one.
4. Make the wizard pick up a re-grade that happened elsewhere (editor opened in another tab) by always refetching the ledger on mount.

Result: correct a blocker, save, and the step re-passes and the Ready-to-sell score moves — with zero calls to the channel.

## Technical notes

- `src/lib/channelStepLedger.ts`: new `regradeChannelStepsAfterSave(propertyId, stepKeys)` — `markChannelStepsStale` then `recheckChannelLedger(propertyId, { allowChannelProbe: false })`. Uses the existing probe-off path so the edge function performs local scoring only (no ARI/price pulls, no RU requests).
- `src/pages/PropertyForm.tsx` (~line 4144): replace the bare `markChannelStepsStale` call with the new helper, and add `queryClient.invalidateQueries({ queryKey: ["channel-step-ledger", savedPropertyId] })` alongside the existing readiness invalidations.
- `src/lib/channelContentSync.ts` and `src/components/property/BillingConfigTab.tsx`: swap their `markChannelStepsStale` calls for the helper.
- `src/hooks/useRolosOnboardingProgress.ts`: set `refetchOnMount: "always"` on the `["channel-step-ledger", propertyId]` query so a re-graded ledger is read on the next visit. No change to the "ledger + local data must both agree" completion rule.
