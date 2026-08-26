# Onboard card: searchable picker, linked account, one Create Account button

Step A stops being a modal decision. The picker card carries the whole account question: search the property, read the sub-account it is linked to, press one button to provision it. The generated login domain stays `channels.roomsonline.co.za`.

## Picker card

- The property/portfolio dropdown becomes searchable — type part of a property name to filter the list (same eligibility rules and labels as today).
- Next to the dropdown, once a property is selected, the current binding is shown inline: the linked distribution login and OwnerID, or "Not linked to a sub-account yet" when there is none.
- The **Preview account** button is removed. Refresh stays.
- A single primary button sits beside the binding line:
  - not yet provisioned → **Create Account** — starts Step A immediately (no modal), using the slug login the backend already resolves.
  - already provisioned and Step A passed → no button; the account line reads as the confirmed login.
  - Step A failed or blocked before → **Retry Step A**.
- The button is disabled while the readiness gate is unmet or a step is running, with the existing reason text.

## Step A card

- No auto-opening modal on property select any more. Selecting a property only loads the gate.
- Pressing Create Account expands Step A and streams its existing task lines (dots turning green, rate-limit countdown, key-mint attempt trail) exactly as they run today.
- On success the Step A header becomes: `Step A — Distribution account: <login>` (for example `Step A — Distribution account: pufferfish@channels.roomsonline.co.za`), and the card collapses to its one-line verdict with Show detail available.
- The account dialog remains, but only opens on a genuine blocker (login conflict after generated fallbacks, no usable owner email, channel entitlement refusal) — same failure-only behaviour as now.

## Technical notes

- `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`: replace the `Select` with a `Command`-in-`Popover` combobox (shadcn pattern already in the project) for search; delete the Preview account button and the `autoOpenedRef` auto-open effect; add the binding line + Create Account button driven by `gate.snapshot.binding` (`login_email`, `ru_owner_id`, `account_id`) and `gate.stepAStatus`; keep `runStep("a")` as the click handler.
- Step A title comes from `CHANNEL_ONBOARD_STEP_META.a.title` today — render it as `${meta.title} — Distribution account: ${login}` when `step === "a"`, `gate.stepAStatus === "passed"` and a login is known, falling back to the plain title otherwise.
- No backend, edge-function or schema changes; the login generator and domain constant stay as they are.
