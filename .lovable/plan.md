# Step A — confirm the account in a modal, then it runs itself

Selecting a property in Onboard immediately asks the one question that needs a human: *is this the right distribution login?* Everything after "Accept" is automatic, and Step A no longer has a button to press.

## What the operator sees

1. Pick a property or portfolio in the dropdown.
2. If Step A has not passed, the **Distribution account** modal opens on its own, showing the resolved login (or "not linked to an account yet"), where it came from, the contact and company details, and the auto-generated fallback login the run would use if the channel rejects that address.
3. Two choices: **Accept and run Step A**, or **Change account email** — enter a different address, re-assign, and the modal reopens on the new resolution.
4. On Accept the modal closes right away. The Step A card shows the live dots turning green task by task, with the rate-limit countdown in place when the channel parks a read.
5. Step A's card has no "Run Step A" / "Re-run" button any more. To run or re-run it, the operator opens **Preview account** (next to Refresh) and accepts again.
6. The modal only reappears by itself if the run stops on something it cannot resolve — a login taken outside our master account after every generated fallback, or another blocker — carrying the candidate list and the remedy line as it does today.
7. Step B is unchanged and still has its own button, unlocked once Step A is green.

## Technical notes

`src/components/admin/channel-monitor/ChannelOnboardTab.tsx`

- Replace the current auto-run effect (`autoRanRef`, which fires `runStep("a")` on select) with an auto-open effect keyed per property: when `propertyId` changes, the gate has loaded, and `gate.stepAStatus !== "passed"`, call `openPlan()` once. No channel write happens on select.
- `onRunStepA` closes the dialog first (`setAccountDialogOpen(false)`) and then starts `runStep("a")`, so progress is read from the Step A card.
- In `renderStep`, render the run button only for `step === "b"`; Step A keeps its status badge and the Show/Hide detail toggle.
- Keep the existing failure paths untouched: `RU_EMAIL_IN_USE` and any `blocked` Step A result still re-open the dialog with the plan pre-loaded, chooser and remedy code.
- Keep the auto-open suppressed while a run is in flight, after a rebind reset, and when the readiness gate is not green (the modal would have nothing to offer) — in that case the Ready-to-sell card stays the only thing on screen.

`src/components/admin/channel-monitor/StepAccountDialog.tsx`

- Rename the primary action to **Accept and run Step A** and drop the "Completing Step A…" in-modal run state plus the section-5 live task list, since the modal is no longer open while the step runs. `runTasks` / `waitLabel` props are removed along with it.
- The "Change account email" control and the conflict chooser stay exactly as they are.

No backend change: `ru-cert-portal` already provisions Step A atomically with the slug-based login fallback.
