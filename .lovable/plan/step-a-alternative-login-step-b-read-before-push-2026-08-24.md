# Step A alternative login + Step B read-before-push

Two changes in the Channel Monitor onboarding flow: Step A recovers from "this email is already registered elsewhere" inside the preview modal, and Step B stops re-pushing units that have not changed.

## Step A — recover from an email already in use

Today the step dies on a red error (`RU_EMAIL_IN_USE`) telling the operator to go and edit records elsewhere. Instead:

- The preview modal keeps the failure in place and turns it into a choice. "What will happen" changes to state plainly that the resolved login is registered at the channel but not under our master account, so a different login must be used for this account.
- Owner binding gains a **login to use** picker listing every alternative the system can find — this property's owner email, the portfolio's owner email, sibling-property owner emails, the portfolio owner's profile email, the login already on file. Each option shows where it came from. Options that cannot be used are shown greyed with the reason:
  - shared platform logins (dev@, noreply@),
  - the address the channel just rejected,
  - an address already serving another property or portfolio.
- Below the picker, a free-text field creates the sub-account for a **brand-new email**. It does not have to be a ROL'OS user or the owner — the owner email stays the preferred default, and this is the fallback when it is unavailable.
- Choosing an alternative and running Step A creates/adopts the sub-account under that login and re-binds the property to it. When the rejected email left a dead local binding behind (a stored identity the channel does not list under our master account), that binding is cleared automatically as part of the same action — no separate unbind click.
- The **Distribution accounts** frame is removed from the modal; account create/archive/keys live in Step A itself.

## Step B — read the listings back before pushing

Step B currently pushes property, rooms and full ARI every time it runs. New order:

1. **Review what is already published** (new first task). When any unit or the property already carries a channel listing id, the listings are read back from the channel and compared with what ROL'OS holds.
2. **Push only what changed.** Units whose content is unchanged since the last successful push are skipped; changed units — and all units when a property-level field moved — are pushed with their full ARI. A first-time publish still pushes everything.
3. If everything is already published and nothing changed, the push task reports "already current — nothing to send" instead of writing to the channel, and the step continues to the read-back, currency and entitlement checks.

Each task keeps its existing behaviour on rate limits: parked with a countdown, resumed automatically, never marked failed.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`
  - Add a login-candidate collector in the `ensure_owner_account` / `plan_owner_account` block: gathers candidate emails with their source, flags each against `ru_owner_accounts` claims (bound to another scope), internal-login prefixes and the rejected address.
  - `plan_owner_account` returns `login_candidates`; the `RU_EMAIL_IN_USE` 409 returns `login_candidates` plus the rejected address.
  - In the `RU_EMAIL_IN_USE` branch, clear the stale local identity (`ru_owner_id`, `ru_user_id`, password, company flags) on the bound row before returning, so the next attempt with a new login starts clean.
  - `ensure_owner_account` already honours `confirmed_owner_email`; a candidate or new address is passed through that field.
- `src/lib/channelOnboardOrchestrator.ts`
  - `portal()` returns the error `code`; `TaskResult` carries `code` and optional `loginCandidates`, so the UI can react to `RU_EMAIL_IN_USE`.
  - New Step B runner `review_listings`: calls `resolve_ru_property_ids` for the read-back and a new `plan_push_scope` action for the changed-unit set; stores the resulting scope on the run context.
  - `push_property` uses that scope (`onlyUnitIds`) and skips when the scope is empty and the listings verified.
- `supabase/functions/_shared/ruStaticDelta.ts`: export a `planStaticPushScope()` helper reusing the existing fingerprint/diff logic (`fieldFingerprints`, `diffFingerprints`, `scopeUnitIdsFromChanges`) without pushing.
- `supabase/functions/ru-onboard-property/index.ts`: new read-only `plan_push_scope` action returning `{ unchanged, scope_unit_ids, changed_fields }`.
- `src/config/channelOnboard.ts`: register the `review_listings` task ahead of `push_property` in Step B.
- `src/components/admin/channel-monitor/StepAccountDialog.tsx`: candidate picker + new-email field, reworded "what will happen" for the in-use case, remove the distribution-accounts frame.
- `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`: hold the chosen login in state, pass it as `confirmedOwnerEmail`, re-open the modal on `RU_EMAIL_IN_USE` with the candidates loaded.
