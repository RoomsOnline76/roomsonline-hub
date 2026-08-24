# Step A: one "Preview account" modal, no separate company push

Step A's preview becomes a full modal that shows exactly what will happen, carries the owner binding controls and the distribution account manager, and lists the company details that will be sent. The separate "Accounts & Company" rail tab is removed, and pushing company details is no longer a manual action.

## What the modal contains

Opened from Step A's "Preview account" button (loads the plan preview before it renders):

1. **What will happen** — plain-language outcome: create a new distribution account or adopt the existing one, the login email and where it came from, contact first/last name, account scope (this property only, or portfolio-wide with the member count), country/location resolution, and the OwnerID when one already exists. Any warnings from the preview (shared platform login skipped, already linked to a different login, no resolvable location) are shown as amber notices, and a blocking reason disables the confirm action.
2. **Owner binding** — the panel currently on the Onboard tab and the corrections previously only possible on the Accounts tab: owner email, account login, scope, listing state, plus "Re-assign to owner email" with the existing confirm dialog. Corrections are made here.
3. **Distribution account management** — moved out of the retired rail tab: the account list for the selected property/portfolio with create, archive, key/secret storage, password save, verify, and OwnerID visibility. The "Push company details" button and its result block are not carried over.
4. **Company details to be sent** — collapsed by default. Expanded it lists every field that goes to the channel with its resolved value and where it came from (property name/portfolio name, address, city, country, postal code, phone, website, contact name, VAT/registration, legal representative fields). An "Edit company details" link deep-links to the property editor's Company Information frame, which opens in a new tab so the modal state is not lost.
5. **Footer** — "Run Step A" (runs the same task chain with the previewed identity confirmed) and "Close".

## Company details push

- The manual push action is retired. Step A keeps a company-profile task that runs **only when the profile is missing or not yet accepted** — an already-accepted profile is skipped, and re-verifying credentials no longer makes it look stale.
- A changed profile (edited in the property editor) marks it un-accepted so the next Step A run re-sends it.

## Rail tab removal

- "Accounts & Company" is removed from the Channel Monitor rail. Existing `?tab=accounts` links redirect to the Onboard tab so no bookmark breaks.
- `PortfolioRuAccountsTab` is refactored into a modal-embeddable account-manager panel scoped to the selected property/portfolio; the company-details push UI in it is deleted.

## Technical notes

- New `src/components/admin/channel-monitor/StepAccountDialog.tsx` holds the modal; `ChannelOnboardTab.tsx` loses the inline binding card and inline preview block and opens the dialog instead, passing the gate snapshot, plan, rebind handlers and step runner it already owns.
- The plan preview already returns everything panel 1 needs (`plan_owner_account`): outcome, login/source, contact names, company name, country, scope, portfolio name and count, existing OwnerID, location ids, warnings, `can_create`/`blocked_reason`.
- Panel 4 needs a read-only company preview. `ru-cert-portal` gets a `preview_company_details` action that reuses the existing payload builder to return the resolved field/value/source list without sending anything; the modal renders it inside a collapsible.
- `PortfolioRuAccountsTab` is split: the account-manager body becomes `RuAccountManagerPanel` (accepts an optional property/portfolio scope), the company push block is removed, and the old page-level wrapper is deleted along with the rail entry in `src/pages/AdminChannelMonitor.tsx`.
- The deep link uses the editor's existing section/focus params (`/properties/<id>/edit?section=general&focus=…`) targeting the Company Information card.
- Step A's `company_profile` task keeps its skip-when-accepted behaviour; no new push button anywhere.
