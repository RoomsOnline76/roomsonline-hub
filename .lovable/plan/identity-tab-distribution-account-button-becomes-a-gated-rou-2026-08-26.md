# Identity tab: distribution account button becomes a gated route to onboarding

On the property Edit/Setup → Identity card, the "Create distribution account" / "Confirm & create" pair currently creates the account in place, and it is enabled from its own local checklist. Account provisioning now belongs to Step A on the Channel onboarding page.

## What changes

1. The button is only clickable once the property's mandatory steps 1–5 (the Ready-to-sell verdict) have passed.
   - Not passed: the button is disabled and shows why, listing the failing items already returned by the gate.
   - Passed: the button is enabled and labelled to reflect its new job — "Confirm & create" starts onboarding rather than minting locally.
2. Clicking it navigates to the Channel onboarding surface for this property, where Step A provisions the distribution account automatically:
   `/admin/channel-monitor?tab=onboard&property=<property id>`
3. The in-place create path (local confirm row plus the create call) is removed from the Identity card, so there is one place that creates accounts.
4. The rest of the Identity card is untouched: linked-account details, API keys, company details push, unbind and the push/pull gate banner stay as they are.

## Technical notes

- `src/components/property/PropertyRuOwnerPanel.tsx`
  - Read the durable gate with the existing `useChannelOnboardGate(propertyId)` hook (`readyToSell`, `readyToSellStatus`, `readyToSellBlockers`) — it grades locally with no channel traffic.
  - Replace the `confirmCreate` / `createSubAccount` block in the "not linked" branch with a single button that is `disabled` unless `readyToSell` is true, and which navigates via `react-router-dom`'s `useNavigate` to the onboard deep link (same shape already used by `src/pages/AdminOnboarding.tsx`).
  - Keep the existing readiness checklist rendering, and add the gate blockers as the disabled reason (tooltip + short helper line).
  - Drop the now-unused `createSubAccount` handler and its state.
- No backend, schema, or edge-function change; no change to Step A itself.
