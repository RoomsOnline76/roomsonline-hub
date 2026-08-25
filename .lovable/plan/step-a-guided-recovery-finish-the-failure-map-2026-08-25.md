# Step A guided recovery — finish the failure map

Step A already turns a failed password/key mint into an amber "blocked" state with a remedy card and manual key entry (`channelStepARemedies.ts`, `StepAccountDialog.tsx`, `channelOnboardOrchestrator.ts`). This plan closes the gaps that still let a failure reach the user as a raw non-2xx error, and extends the same treatment to the rest of the onboarding steps.

## What changes

1. **Password remedy popup, not a toast**
   When a run stops on a password/credential code, open the account dialog scrolled to the credentials card with the field focused and the remedy note above it, including the "reset the password in the channel portal, then paste it here" path. Today the dialog opens but the user must find the card.

2. **No raw error text anywhere in Step A**
   Any code with no registry entry falls back to a generic remedy card ("The channel refused this step") plus the technical detail in a collapsible line, so a blank screen or a bare `422` string can never be the whole message.

3. **Complete the failure map**
   Add remedies for the codes not yet in the registry, each with cause + what the operator must supply:
   - identity/company: missing company name, address, phone, VAT/registration rejected
   - login creation: invalid email format, weak password refused by the channel, login already ours (adopt instead of create)
   - roster: OwnerID visible but detached from the master account
   - transport: channel outage / 5xx (retry only, never asks for input)

4. **Same treatment for Step B**
   Push/read-back failures get their own registry (missing mandatory property fields, image size, no rate plan for the window, unit inventory mismatch), each naming the field and linking to the property editor tab that fixes it. Rate-window deferrals stay a countdown, never a failure.

5. **Verification pass**
   Walk each remedy path against a test sub-account: wrong password, correct password with key mint refused, manual key pair pasted, detached OwnerID, incomplete company details — confirming each ends in a prompt for exactly the missing input and that Step A resumes without re-running earlier tasks.

## Technical notes

- Registry stays declarative in `src/config/channelStepARemedies.ts`; a sibling file holds the Step B map. Codes are added to `STEP_A_RECOVERABLE_CODES` so the orchestrator marks them `blocked`, not `failed`.
- `portal()` already recovers JSON bodies from non-2xx invokes; the fallback remedy is applied at the UI boundary so an unmapped code still renders guidance.
- No schema changes. Edge-function work is limited to making sure `ru-cert-portal` and `ru-onboard-property` always return `{ success:false, error:{ code, message } }` with the field name when the refusal is about a specific value.
