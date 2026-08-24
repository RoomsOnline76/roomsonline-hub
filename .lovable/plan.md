# Onboarding queue + Ready-to-Sell wizard scope

Three changes: an RU-only filter on the onboarding queue, a channel score that reflects only the Ready-to-Sell gate, and a Connect-a-Channel wizard trimmed to its five Ready-to-Sell steps.

## 1. /onboarding — "RU properties only" toggle

- New toggle in the filter bar next to "Show finished properties", **on by default**.
- On: only RU properties — ROL'OS properties with the Channel Manager add-on entitled (signed or overridden contract) **or** already carrying a channel listing id / channel push enabled.
- Off: the current wider queue, including properties that only run the website listing wizard.
- Finished/complete properties stay hidden by default under the existing "Show finished" toggle, in both modes.
- The counter cards keep matching the visible queue, so they respect the toggle too.

## 2. RU channels score = Ready-to-Sell gate only

The channel column stops mixing publish, currency, sign-off and connect signals into its percentage.

- Gate passed → green "Ready to sell" (100%).
- Not passed → graded percentage of the outstanding mandatory items across steps 1–5 (identity, location, rooms, media, commercial), with the count of outstanding items in the tooltip.
- Verdicts read from the durable Ready-to-Sell record the Channel Monitor already writes, falling back to the live readiness probe when a property has no record yet.
- Properties without Channel Manager entitlement keep their existing "add-on not enabled" state.

## 3. Connect a Channel wizard = 5 steps

- The wizard renders only the Ready-to-Sell stage: steps 1–5. The "Published" and "Channels live" stages and their step panels are hidden.
- Steps 6–14 are now performed by the Channel Monitor "Onboard property" two-step atomic processor. That processor is separate code, so the old wizard steps are hidden (not deleted) — the shared gate and ledger logic behind them stays intact and in use by the monitor.
- When all five steps pass, the wizard writes the pass to the gate monitor (the same durable Ready-to-Sell step record the monitor reads), so the monitor shows the property as ready without a re-probe.
- Wizard header, progress and the continue bar count out of 5 steps; the finish action points the operator to the Channel Monitor for onboarding rather than to "connect a channel".

## Technical notes

- `src/pages/AdminOnboarding.tsx`: new `ruOnly` state (default true), a derived `isRuProperty` per row, applied in `filteredProperties` and in the counter source set.
- `src/lib/onboardingQueueProgress.ts`: `channelQueueProgress` reduced to the Ready-to-Sell verdict — pass/percent/outstanding-count; stages beyond `ready` retired from the queue score. Existing tests updated.
- `src/config/channelOnboardingStages.ts`: `CHANNEL_ONBOARDING_STAGES` limited to the `ready` stage; `published`/`live` definitions kept in the file but excluded from the wizard list.
- `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx`: stage nav, action resolver and completion copy reduced to the five macros; on completion invoke `ru-onboard-property` with `action: grade_ready_to_sell` and invalidate the channel edit gate cache.
- Gate reads (`src/lib/channelEditGate.ts`) and the monitor's `property_channel_step_status` writes are unchanged.
