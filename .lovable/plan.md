# Verify Step A and Step B end-to-end on "Leopard"

Run the full two-step channel onboarding against the test property **Leopard** (slug `ru-test-4`), from creating the distribution sub-account through to the property being ready to connect channels — checking every task's real outcome at the channel, not just the green tick in the UI.

## Confirmed starting state (read from the database just now)

- Leopard is active and its readiness gate (`ready_to_sell`, steps 1–5: content, location, rooms, media, commercial) is **passed**.
- Leopard has **no distribution account bound** — no `ru_owner_accounts` row for the property or its portfolio.
- `monitor_step_a`, `monitor_step_b` and `ready_to_connect` were all reset with "distribution account testc@polka.co.za was retired", so they are back to pending.
- Channel steps `connect`, `currency`, `entitlement`, `publish` are stale; `signoff` pending.

So Leopard is a genuine clean run: account creation, key minting, company profile, listing push and ARI all execute for real.

## What gets verified, task by task

Step A (5 tasks):
1. **Account created** — a new sub-account on the slug login `ru-test-4@roomsonline.co.za`, one identity only, new OwnerID recorded and resolved from the master roster.
2. **Credentials minted** — key pair issued while authenticated as the child account, never the master; stored encrypted.
3. **Credentials verified** — the stored pair signs in and reports the expected OwnerID (`key_scope='child'`); a master pair must be refused, not stored.
4. **Company profile** — sent on the child pair and read back.
5. **Adopt listings** — nothing pre-existing on a brand-new account; confirm no phantom adoption and no duplicate listing rows.

Step B (5 tasks):
6. **Review published listings** — read-back before push, so the push is a create not a duplicate.
7. **Push property, rooms and ARI** — unit(s) created, then 365 days of availability and pricing; confirm one push per unit, no master-account writes, no repeated full pushes.
8. **Read listings back** — every unit exists under the expected OwnerID with the local UUID mapping stored.
9. **Location & currency** — published location and currency agree on both sides (no redundant ChangeCurrency call).
10. **Channel Manager entitlement** — switched on for the billing profile and persisted on re-read.

Then the durable gate is checked: `monitor_step_a`, `monitor_step_b` and `ready_to_connect` all `passed`, and the property offers "Configure channels" instead of onboarding.

## How it will be verified

- Drive the real Step A and Step B runs from Channel Monitor → Onboard property (browser automation on the preview, admin session), capturing each task card's result.
- After each step, cross-check the truth in the backend rather than trusting the UI: the account row, credential rows and verified timestamps, unit/listing id mappings, the step ledger rows, and the outbound traffic log for the run.
- Read the traffic log for the run window to confirm: correct documented verbs, no master-pair writes, no duplicate or rate-limited repeat calls, and no calls that the recent adapter compliance sweep retired.
- Anything that fails or is noisier than it should be gets fixed in place and the affected task re-run on its own (each task is individually retryable), then re-verified.

## Deliverable

A short per-task verdict table (pass / fixed / blocked with the channel's own reason), plus the list of code fixes made. If a step is blocked by something on the vendor side that cannot be fixed from here (for example key creation not enabled on a fresh account), that is reported explicitly with the evidence rather than worked around silently.

## Notes

- No new tables or functions are expected; changes, if any, land in `ru-onboard-property`, `ru-cert-portal`, `rentalsunited-api`, `src/lib/channelOnboardOrchestrator.ts` and the Onboard tab UI.
- Leopard is a disposable test property, so the run is safe to execute live. Its sub-account can be archived afterwards from the master roster if you want the slot released.
