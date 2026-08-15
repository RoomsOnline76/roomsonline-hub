# Channels wizard: fix the erratic progression

The rebuilt UI is the right shape, but the progression logic behind it fights the user. Below are the defects confirmed by reading the wizard, the stage config, the macro registry and the progress hook — and what to change.

## What is actually wrong

1. **The wizard steals your place.** `?step=` is written on every click, and the step-selection effect always honours the URL step. Result: after finishing a step it never advances, and after a background refetch it can also snap the selection back. Two competing sources of "current step" (URL vs. first-open macro) with no memory of user intent.

2. **Advisory checks are shown as blockers.** Checks the resolver could not judge (`unknown`, e.g. a rate-limited live-calendar probe) are excluded from scoring but still rendered in the blocker list. That is exactly the "none of these are true" symptom: a step shows red rows while its score says 100%.

3. **Live ARI probes on every mount.** The distribution query runs with `staleTime: 0`, `refetchOnMount: "always"` and `probe_ari: true`. Every visit re-probes the channel; when it throttles, the availability/pricing groups vanish, steps that were green go grey, and the sidebar/score jump. This is the main cause of run-to-run inconsistency.

4. **Fix buttons that go nowhere.** The in-page editor only renders in the "Ready to sell" stage. A fix routed from a Published-stage step (or to a section no macro claims — `contacts`, `info-facilities`, `rate-plans`) selects a step but renders no editor, so the click appears to do nothing.

5. **Hard linear lock across all twelve steps.** Every step is locked until the one before it is complete, and stages inherit the lock. You cannot revisit a finished step or look at a later one, and one soft check (currency verification, quality advisory) freezes the rest of the wizard. Sidebar entries are simply disabled with no explanation of what to do.

6. **Regression drags a live property backwards.** The compact "channels live" view requires `readyToConnect` (all eleven earlier steps complete). If any check later regresses or goes unknown, an already-trading property is thrown back into the full wizard.

7. **Dead and mismatched checks.** `quality_check` is computed but referenced by no step. `manual_signoff`, `channel_entitlement`, `currency_verified` and `listing_ids` all silently fail while the property is unbound, so several steps read "failed" when the true story is "waiting on the bind".

8. **Sign-off and entitlement are admin-only with no owner-facing state.** Owners see disabled checkboxes and an off switch with no indication that someone else must act.

## The fix

**Selection model** — one owner of "current step":
- Track user intent explicitly. The URL step wins only while the user is on that step and it is still incomplete; once complete, auto-advance to the next open step (and update the URL).
- Stop writing an `rq` cache-buster on selection; keep the editor mount key stable so typing is not interrupted by refetches.

**Blockers and truth**
- Render `unknown` checks in a separate "waiting on the channel" group, visually distinct from blockers, never with a Fix button. Blocker list shows only actionable mandatory failures.
- Where a check is unresolvable because the property is not yet bound, label it "waiting on bind" rather than a failure.
- Remove the unused `quality_check`, or attach it to the publish step as an explicitly advisory row.

**Probing**
- Drop `probe_ari` from the mount query; probe ARI only on explicit refresh or when the user opens the pricing/availability step. Cache the last good probe result and mark it with its age instead of discarding it on a throttle.
- Give the distribution query a short `staleTime` so navigating tabs does not re-derive everything.

**Gating**
- Replace hard locking with soft gating: any step is viewable and any completed step revisitable. Only the *actions* that genuinely cannot run early stay disabled (publish before ready, connect before entitlement), each with a one-line reason on the button.
- Steps blocked purely by an unknown/advisory check no longer block later steps.

**Editor routing**
- Render the embedded editor for any step whose work lives in the property form, not just the "Ready to sell" stage.
- Complete the section map so `contacts`, `info-facilities` and `rate-plans` resolve to an owning step; if a target cannot be resolved, open the full editor at that section instead of doing nothing.

**Live properties**
- Once a channel is connected, keep the compact live view even if a check later regresses; surface the regression as a banner with a "Review go-live" link rather than reopening the wizard.

**Role clarity**
- For non-platform users, show admin-only steps as "waiting on ROL" with who to contact, instead of dead controls.

## Technical notes

Files touched:
- `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx` — selection effect, blocker grouping, editor rendering per stage, next-action resolution, role messaging.
- `src/hooks/useRolosOnboardingProgress.ts` — probe policy and caching, unknown/unbound classification, soft gating (`locked` derivation), regression tolerance for live properties.
- `src/config/rolosOnboardingMacros.ts` — retire or reclassify `quality_check`; mark advisory state tasks.
- `src/config/channelOnboardingStages.ts` — stage lock derivation, section-to-macro map completion.
- `src/lib/onboardingQueueProgress.ts` — keep the queue card's score identical to the wizard's after the gating change.

No database or edge-function changes; `ru-cert-portal` keeps its current contract (the `probe_ari` flag is simply used deliberately rather than on every mount).
