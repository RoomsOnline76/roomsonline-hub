# Push Company Details button in the Account Manager

A UI-only addition to the Channel Manager → Account Manager tab (`PortfolioRuAccountsTab`). Nothing else in the tab or any other tab changes.

## What to add

A new "Company details" panel rendered inside each expanded account card, between the existing **RU sub-user API keys** panel and the **RU portal credentials** panel. It contains:

1. A primary **"Push Company Details"** button.
   - Tooltip / helper text: "Required after creating a sub-user. Pushes company details to RU before any ARI or reservation calls."
   - Disabled while a push is in flight, or when the account has no bound `ru_owner_id` (nothing to push to).
2. A **"Last pushed: {timestamp}"** chip next to the button, sourced from `ru_owner_accounts.company_filled_at` (already loaded on the account row). Hidden when never pushed.
3. A small **collapsible response panel** directly under the button that shows the exact RU response JSON (success or error) from the push call. A "View response / Hide response" toggle controls it. It persists after the push so the operator can re-read it; re-pushing replaces it.

## How the push is triggered

On click, call the existing company-details push path already used elsewhere in the codebase:

```ts
supabase.functions.invoke("ru-cert-portal", {
  body: {
    action: "ensure_company_details",
    force: true,
    // scope the call to this account
    ...(acc.portfolio_id ? { portfolio_id: acc.portfolio_id } : { property_id: acc.property_id }),
  },
});
```

- `ensure_company_details` resolves the bound sub-user and re-submits `Push_FillCompanyDetails_RQ` under the sub-account's own credentials. With `force: true` it re-submits even when already satisfied.
- Response shape: `{ success, company_details_pushed, company_details_warning, account, error }`.
- Success toast only when `data.success && data.company_details_pushed === true` — e.g. "Company details pushed to Rentals United for OwnerID 741761". On failure, toast the real `error.message` / `company_details_warning` and keep the response panel open so the operator sees the raw RU error.
- After the call, refresh the accounts query (`refreshAccounts`) so the "Last pushed" chip and the existing `RuLastSentPanel` reflect the new `company_filled_at` / `company_payload`.

If the account has neither `portfolio_id` nor `property_id`, toast an error and do not invoke.

## State added (component-local, no API changes)

- `pushingCompany: string | null` — account id currently being pushed (drives the spinner + disabled state).
- `companyPushResults: Record<string, { open: boolean; raw: string }>` — per-account raw JSON string of the last push response + collapse state.

No new hooks, queries, edge functions, tables, or props. The `RuAccount` interface already carries `company_filled_at`, `company_details_status`, `portfolio_id`, `property_id`, and `ru_owner_id`.

## Out of scope

- No changes to `RuLastSentPanel`, `PortfolioChannelPushPanel`, the header buttons, the API-keys panel, the portal-credentials panel, the bind/close dialogs, or any other tab/page.
- No backend changes — `ensure_company_details` already does the real push and returns the needed fields.
