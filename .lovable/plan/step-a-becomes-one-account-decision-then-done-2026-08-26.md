# Step A becomes one account decision, then done

Today Step A is a card with a "Preview account" button buried inside it, and the modal mixes four cards (what will happen, owner binding + destructive re-assign, credentials, company details) with a "Run Step A" footer. The new flow makes the account question the first thing the operator answers after picking a property, and one click finishes Step A completely.

## New behaviour

1. **Pick the property** in the "Onboard a property" card.
2. **The account modal opens by itself** and states the linkage plainly:
   - linked: "This property is linked to sub-account `julius@polka.co.za`" (with scope — property or portfolio-wide, and the listing state)
   - not linked: "This property is not linked to a distribution account" followed by a prompt for the account email to use, pre-filled with the resolved owner/portfolio email.
3. **Change account email** is a single button. Until it is clicked the email is read-only text — no input, no destructive button on show. Clicking it reveals the email field (plus the offered login candidates when the channel has refused an address) and a Cancel to go back to the stated email.
4. **Proceed** runs Step A end to end from inside the modal — account create/adopt, company profile, password/key minting, verification — with the live per-task progress and the rate-window countdown shown in the modal instead of the operator being dropped back to the card. On success the modal reports "Step A complete" and closes; on a recoverable stop it keeps the existing remedy card (password prompt, XML-API-refused notice, login conflict chooser) in place so the fix and the retry happen in the same surface.
5. **"Preview account" moves out of the Step A card** and sits next to **Refresh** in the "Onboard a property" card header, so the modal can be reopened at any time.

The Step A card keeps its status badge, its task list and Re-run, but loses the inline "Preview the account…" panel and its button.

The modal opens automatically on each property selection while Step A has not passed. Once Step A has passed for the selected property it does not auto-open — the operator reopens it from the Preview account button.

## Technical notes

- `ChannelOnboardTab.tsx`
  - Move the `Preview account` button into the picker card's action row beside `Refresh` (same `openPlan()` handler, disabled while `planLoading` or no `propertyId`).
  - Remove the `step === "a"` inline preview panel from `renderStep`.
  - Auto-open: effect on `propertyId` that calls `openPlan()` once per selection when `gate.stepAStatus !== "passed"` (guarded by a ref of the last auto-opened id so a gate refresh does not reopen it).
  - `onRunStepA` no longer closes the dialog; pass `runningStep`, the live `taskStates`/`waiting` slice for step A and a completion signal so the dialog can show progress and close itself on pass.
- `StepAccountDialog.tsx`
  - Restructure the top card into a single "Distribution account" statement built from `binding.login_email` / `plan.existing_login_email` (linked) or `plan.login_email` + `login_source` (not linked).
  - Gate the email field and the `Unbind & re-assign` action behind a `changingEmail` state toggled by a "Change account email" button; keep the existing `onRequestRebind` confirmation dialog and the `sameEmailReset` warning for the linked case, and route the not-linked case to `onChosenLoginEmailChange`.
  - Fold the login-candidate radio group into that same disclosure instead of a separate card.
  - Footer button becomes `Proceed` (spinner + per-task line while running), keeping the existing `canRun` guards; credentials and company-details cards stay as-is below.
- No backend or orchestrator changes — `planOwnerAccount`, `ru-cert-portal` and the 9-task orchestrator are untouched.
