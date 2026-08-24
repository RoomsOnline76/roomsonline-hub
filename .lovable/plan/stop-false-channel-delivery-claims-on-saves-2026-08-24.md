# Stop false "channel delivery" claims on saves

## The problem

When you save a property that is still inside onboarding (not through the Ready-to-Sell gate, no sub-account bound, listing not published), the save toast still says:

> "house rules, check-in / check-out times, units, rate types saved; channel delivery is being confirmed."

Nothing is being confirmed. The underlying push helper (`pushChangedChannelFields`) correctly checks the onboarding gate and stays completely silent when it is closed — but the toast is written *before* that check runs, so it promises channel activity that never happens. The same pattern exists on a few other save surfaces that mention the Channel Manager without first asking whether the property is connected.

## What changes

1. **Property save toast becomes gate-aware.** The save keeps confirming instantly (no waiting on the channel), but the wording is resolved from the actual gate state:
   - Gate open (connected, published, entitled): "… saved; channel delivery is being confirmed." (unchanged)
   - Gate closed (still onboarding / not bound / not published): "… saved. Channel delivery starts once onboarding is complete." — no promise of a channel call.
   - No channel-relevant change: unchanged ("Local changes saved. No channel update is required.").

2. **One shared truth for the wording.** Add a small helper next to the existing gate (`channelEditGate.ts`) that returns the correct "what happens next" sentence for a property, so every save surface says the same thing and nobody re-implements the rule.

3. **Sweep every save surface in this part of the flow** so none of them can trip a false channel toast while the gate is closed:
   - Property editor (all tabs: general, location, rooms, images, policies, rates) — the single save toast above.
   - Charges (`usePropertyCharges`) — already silent via the push helper; verify the local "Charge saved" toasts make no channel claim.
   - Rate plans (create / update / toggle / delete / copy) — already gated; confirm no spinner or "sending" toast appears for a closed gate.
   - Restrictions manager — "Saved, but the Channel Manager update could not be queued" must not fire when the property simply is not connected yet; suppress it for the gate-closed / not-connected reason and keep it only for genuine failures.
   - Bulk rate rules and availability/ARI edits reached from the same editor — same rule.

4. **Nothing about push behaviour changes.** No new channel traffic, no change to what is pushed or when. This is wording and suppression only, driven by state that is already read today.

## Technical notes

- `src/lib/channelEditGate.ts`: export a `channelSaveOutcomeCopy(propertyId)`-style helper returning `{ willPush, sentence }` from the existing cached `channelEditGateState` (closed-by-default, no extra reads).
- `src/pages/PropertyForm.tsx` (~line 4145): await/resolve that helper before composing the save toast; keep the toast immediate by using the cached gate verdict and defaulting to the neutral sentence when the verdict is not yet cached.
- `src/components/restrictions/RestrictionsManagerDialog.tsx`: only show the error toast when `syncRestrictionsToChannels` returns a real failure, not the `onboarding_incomplete` / `not_connected` reasons.
- Audit pass over the other `Channel Manager` toast strings in the property editor / onboarding save paths; leave explicit operator actions (manual push, wizard publish, certification console) untouched — those are deliberate and should keep reporting.
