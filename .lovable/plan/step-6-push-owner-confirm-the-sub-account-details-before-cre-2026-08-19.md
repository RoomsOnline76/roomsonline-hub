# Step 6 (Push owner): confirm the sub-account details before creating

Today "Create or link distribution identity" fires straight into the channel: the wizard invokes the create/ensure action, which resolves the login email and owner name server-side from a cascade of sources (property owner email, portfolio owner email, sibling properties, linked profile, an already-bound account) and then either adopts an existing sub-user or creates a new one — with no chance for the operator to see or correct what will be used. That is how a wrong login (an internal ROL mailbox, an outdated owner email) ends up permanently attached to a live distribution account.

Step 6 must stop and ask first.

## What the operator will see

Clicking the step 6 action no longer creates anything. It opens a confirmation card showing exactly what will be sent to the channel:

- **Sub-account login** — the email that becomes the portal login, plus which source it came from (this property's owner email, the portfolio's owner email, a sibling property, or an existing bound account).
- **Contact name** — first and last name as they will be submitted.
- **Scope** — whether the account is created for the whole portfolio (and which properties inherit it) or for this property alone.
- **Company/portfolio name and country** used for the account's location.
- **Outcome** — plainly stated: "A new sub-account will be created" or "An existing sub-account will be adopted and linked (OwnerID …, login …)".
- Any warning the resolution produced: no usable owner email, the resolved address is an internal/shared login, or the login differs from the bound account's current login.

Two choices:

- **Confirm and create** — proceeds with exactly the previewed values (they are passed back with the request, so nothing can drift between preview and creation).
- **Cancel / Correct details** — closes the dialog, creates nothing, and drops the operator into account editing: the distribution account panel on this step with the owner email field focused, so the correction is made where the value actually lives. After saving, step 6 is re-previewed.

When the preview cannot produce a usable login, "Confirm and create" is disabled and only the correction route is offered, with the reason stated.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`: add a read-only `plan_owner_account` action that reuses the existing `ensure_owner_account` resolution (owner email cascade, internal-login filter, name split, portfolio scope, portfolio member count, country/location resolution, existing-account and RU roster match) and returns the resolved values plus `outcome: "create" | "adopt"`, the matched OwnerID/login when adopting, `source` of the email, and any blocking reason. It performs no channel writes.
- `ensure_owner_account` gains an explicit confirmation contract: when called from the wizard it must carry `confirmed_owner_email` (and optional `confirmed_owner_name`); those values are used verbatim instead of re-running the cascade, and a mismatch against what the cascade would resolve is reported rather than silently overridden. Existing server-side/automated callers keep working unchanged.
- `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx`: `pushOwner` becomes a two-phase flow — fetch the plan, render it in a confirmation dialog, and only invoke `ensure_owner_account` on confirm with the previewed values. The `nextAction` label for `push_owner` becomes "Review distribution identity". Cancel routes back to the account panel and focuses the owner email field.
- Wording follows the channel vocabulary rules (distribution sub-account / Channel Manager), never the vendor name.
- No schema change.

## Verification

- Step 6 on a property with a valid owner email: the dialog names that login and "new sub-account"; cancelling leaves the channel untouched (no new row in the accounts table, no OwnerID assigned).
- Step 6 where the portfolio already holds a live account: the dialog says it will adopt and shows that account's OwnerID and login.
- Step 6 with only an internal/shared login available: confirm is blocked, the reason is shown, and the correction route lands on the owner email field.
