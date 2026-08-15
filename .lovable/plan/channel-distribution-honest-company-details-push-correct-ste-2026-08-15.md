# Channel distribution: honest company-details push + correct step order

Two problems to fix on the Channels wizard's distribution stage.

## 1. "Company details sent: Yes" is not evidence of a push

What the data actually shows for this sub-account (OwnerID 741761, rooms@roomsonline.co.za):

- company details recorded as "sent" at 17:31
- the sub-account's API key pair was only verified at 17:56

So whatever was recorded happened before the sub-account could authenticate as itself, which is exactly the case Rentals United does not accept. On another account the same flag reads "Yes" purely because keys verified (`company_details_status = credentials_verified`) — no push ever ran there either.

Fix:

- Stop treating verified API keys as a substitute for the push. Verified keys become a *prerequisite*, not evidence.
- The account panel stops printing a bare "Yes". It shows the real state: "Not sent", "Sent <date> (needs re-send — predates key verification)", or "Sent <date> with verified keys".
- Only a `Push_FillCompanyDetails_RQ` that ran at or after key verification counts as done — everywhere (wizard, push gate, sign-off checklist, certification pack).

## 2. Push the company details automatically, right after keys are saved and validated

Today it is a manual afterthought. New behaviour: saving a sub-account key pair validates it, and on success immediately submits the company profile in the background, then refreshes the panel and the wizard. If the submit fails, the panel says why and offers a retry — nothing else is unblocked in the meantime.

## 3. Step order in the wizard

Current order runs verification before the listing pull. Reorder the distribution stage to:

```text
6.  Push owner: create the distribution sub-user
7.  Create key & secret for the sub-account   (validate + auto-push company details)
8.  Pull listings (if any)                    (match to the sub-account, or "nothing to adopt")
9.  Sub-account verification                  (human ticks the RU portal details, signs off)
10. Push property & full ARI                  (update matched listings, create the rest)
11. Location & currency verification
12. Enable Channel Manager
13. Connect channels
```

The sign-off checklist keeps its lock: the "company details" item cannot be ticked (and "Confirm all" cannot forge it) until the verified push is on record, with a "Push company details" button beside it for a manual re-send.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`: remove the three `company_details_status = "credentials_verified"` writes on the key-save / key-create / login-verify paths; after a successful key verification, invoke the existing `ensure_company_details` flow and record its real outcome (`sent` / `failed` + `company_filled_at`).
- `supabase/functions/_shared/ruCompanyDetails.ts`: drop the verified-keys fallback and the backfill; satisfaction requires `company_details_status in ('sent','already_set')` with `company_filled_at >= keys.verified_at`.
- `supabase/functions/_shared/ruPhaseGate.ts`: blocker text stays, but now fires on the stricter rule.
- `src/config/rolosOnboardingMacros.ts` and `src/config/channelOnboardingStages.ts`: swap the `signoff` and `pull_listings` orders (8/9) and keep stage grouping/labels consistent.
- `src/components/property/PropertyRuOwnerPanel.tsx`: replace the Yes/Not yet line with status + timestamp + stale warning, and surface a retry action.
- `src/hooks/useRolosOnboardingProgress.ts` already derives `company_details_pushed` from the backend; it only needs the reordered macros and the panel's refresh signal.
- One data repair: reset `company_details_status`/`company_filled_at` for the two accounts whose "sent" state came from key verification, so the wizard asks for a genuine push.
