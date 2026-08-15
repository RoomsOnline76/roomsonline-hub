# Fix slow, flaky channel readiness (Dassiesingel case)

## What is going wrong

Confirmed from the code and data:

- The readiness endpoint ignores the wizard's request to skip live channel probing. It forces a live probe whenever the property or any of its units already exists at the channel (`ru-cert-portal` → `phase_status`, line 3822). Dassiesingel has 4 units linked to the channel, so every single page open triggers 4 live calendar + price pulls.
- Those pulls pass a one-call-per-minute channel gate and are time-boxed. When they run long or get throttled they return "verification pending", which the wizard reads as "not ready to connect".
- The last good verdict only survives in memory — a 3-minute map inside the edge function and a `useRef` in the browser. A cold function instance or a page reload loses it, so the same property flips between ready and not ready.
- Each readiness score also rebuilds the whole outbound payload (`push-property-to-ru` dry run) plus a 365-day rate resolve before any probing happens, on every mount.

Net effect: slow wizard load, and Availability/Pricing checks that disappear at random.

## The fix

1. **Persist the last good verdict.** New table holding, per property, the most recent successful availability/pricing probe result with a timestamp and the owner scope it was read under. Written whenever a live probe succeeds, read when a probe is skipped, throttled, or times out. The wizard then shows "verified (as of <time>)" instead of dropping the check.

2. **Stop probing on page load.** `phase_status` honours the caller: no live probe unless the client asks for one (explicit Refresh, publish, or certification run). Page open serves the persisted verdict plus locally scored content/rooms/photos/policy groups — which already work offline.

3. **Never regress readiness on a failed probe.** A probe that errors or times out keeps the stored verdict and is labelled stale rather than unknown, so a throttle can no longer un-complete a finished step.

4. **Refresh the verdict in the background.** The existing nightly reconciliation job also stores a fresh availability/pricing verdict per channel-connected property, so the persisted snapshot stays current without anyone opening the wizard.

5. **Make first paint fast.** Split the readiness response so the wizard renders the local/gate portion immediately and fills in the distribution verdict when it arrives, instead of waiting for the whole payload behind the dry run.

## Verification

- Open the channel wizard for Dassiesingel twice in a row and confirm it loads without waiting on channel calls, and that Availability 365d / Pricing 365d stay resolved on both loads.
- Confirm an explicit Refresh still performs the live pull and updates the stored timestamp.
- Confirm no property that previously read "ready to connect" now reads not ready.

## Technical notes

- Files: `supabase/functions/ru-cert-portal/index.ts` (`phase_status`, `scoreProperty` ARI block, `ariProbeCache`), `src/hooks/useRolosOnboardingProgress.ts` (probe gating, cache fallback, split query), `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx` and the readiness checklist for staleness labelling, `cron-channel-reconcile` for background refresh.
- New table with RLS plus Data-API grants for `authenticated` and `service_role`; edge writes via service role.
- No change to push/gate rules: readiness thresholds and the push gate stay exactly as they are — only when and where the verdict is read changes.
