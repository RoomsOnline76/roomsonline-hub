# Channel Onboarding — Rentals United, two-step monitor flow

Split the work in two: everything that is *data* stays in Edit / Setup Property; everything that is a *decision or a push* moves to Channels Monitor and happens in two confirmed steps.

## What changes for the operator

**In Edit / Setup Property (unchanged place, now the only place)**
Identity, location, rooms, media, policies/rates — steps 1 to 5. When all five pass, the property earns a durable **Ready to sell** flag. The flag locks; editing any mandatory field re-grades it on save and only a green result keeps it.

**In Channels Monitor (new "Onboard property" surface)**

1. **Pick the property** from a searchable list of properties and portfolios.
2. **Readiness gate** — the monitor reads the single Ready-to-sell flag. Not green: onboarding is blocked with a "Fix in Setup Property" link and nothing else on the screen is clickable. Nothing is sent to the channel and no account is created at this point.
3. **Owner binding** — if already bound, choose *Keep current binding* or *Unbind and re-assign*. Unbind runs as one confirmed operation: archive this property's listings on the current owner account → unbind → bind the new email (adopt the existing account if that email already has one; if it is an archived account, create a fresh account for that email since the vendor has no restore call) → archive the old account if no other bound property is left on it.
4. **Step A — Confirm / create sub-account.** One confirmation: "Create the distribution sub-account for this owner?" Then, in one run: create the account with a generated password, mint the key + secret, store them encrypted, verify them against the channel, send the company profile, verify location and currency, and pull any listings already on the account. A success modal lists each result; the operator must confirm before Step B unlocks. If the account already exists, Step A verifies and repairs instead of creating.
5. **Step B — Push property + ARI.** One confirmation, then: push the units/rooms, then the full 365-day availability and pricing, then read back. On success the property is permanently marked **Ready to connect channels**.
6. Channels are then connected as today, using the verified sub-account.

Both steps show live per-task progress, and a failed task can be retried on its own without re-running the successful ones.

## What is removed

The 14-step wizard keeps steps 1 to 5 (data readiness, in Setup Property) and its push steps 6 to 14 are retired: creating the owner, keys, company profile, sign-off, pulling listings, publish, currency verification and entitlement exist only in Channels Monitor. The wizard shows the monitor's recorded outcome for those, read-only, with a link across.

## Technical notes

- **Readiness flag** — durable row in `property_channel_step_status` with `step_key = 'ready_to_sell'`, written by the existing readiness resolver on property save, carrying `input_fingerprint` over the mandatory field set so an edit invalidates it automatically. Same table records `monitor_step_a` / `monitor_step_b` and the final `ready_to_connect` gate, so the monitor never re-derives history.
- **Gate reader** — new `useChannelOnboardGate(propertyId)` hook reading those rows plus the owner binding; the monitor renders from it and calls no channel endpoint to decide.
- **Orchestration** — a new `ru-onboard-property` edge function owns Step A and Step B as ordered task lists, writing a per-task result to the step rows. It calls `rentalsunited-api` for every channel operation, so the adapter stays the only place channel XML exists; the monitor UI calls only this orchestrator.
- **Unbind** — extends the existing `unbind_property_account` path into an atomic sequence: `set_property_status` (archive) per listing of this property → clear binding → resolve/adopt or create the target account → `ru-close-user` on the old account only when it holds no other bound property. Every leg is logged to `ru_api_log` and `ru_archive_events`, and a partial failure stops the sequence and reports which leg failed rather than leaving a half-bound property.
- **Key minting** — `create_child_api_key` authenticated as the new sub-account with the password we just set; the pair is stored encrypted in `ru_api_credentials` and verified with `verify_child_key_owner`. Manual paste-in stays available as a fallback if the mint is rejected.
- **Edit gate** — the existing `channelEditGate` continues to hold all deltas until `ready_to_connect` is recorded, so saves before onboarding stay local.
- New UI files: `ChannelOnboardTab.tsx`, `OnboardPropertyPicker.tsx`, `OnboardOwnerBinding.tsx`, `OnboardStepACard.tsx`, `OnboardStepBCard.tsx` under `src/components/admin/channel-monitor/`, each well under the file-size limit.

## Risks

- The key-mint call has not yet been exercised against a live new account; if the vendor refuses password-authenticated minting, Step A pauses at the key task and the operator pastes the pair. This will be verified live during the build against a disposable test account before the flow is declared done.
- Archiving listings and accounts is irreversible on the vendor side; both live behind the explicit unbind confirmation and are logged.
