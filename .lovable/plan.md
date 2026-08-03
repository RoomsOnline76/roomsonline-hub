# Referral Partner Agreement: once-off, rep-scoped

Today the Referral Partner Agreement is sent through the same path as property owner contracts: it demands a scope (single / multiple / portfolio) and at least one property, links those properties to the signer's email, flips property listing status to "contract sent", and is versioned per owner — so a new agreement is implied every time a property is onboarded.

It should instead be a once-off engagement contract with a sales rep: independent contractor, no base salary, terms purely from the current default referral terms (tier rates, residual, clawback) already resolved in the rep terms library and Billing Defaults.

## What changes

### Send flow (Admin → Contracts → Send New Contract)
- Choosing **Referral** hides the scope selector and all property pickers.
- Instead: pick a **Sales Rep** from the existing rep list (search by name / code / email), or add a new rep inline (name, email, commission tier).
- A read-only **Engagement Terms** panel shows the resolved defaults for that rep's tier: first-year rate, residual rate, residual duration, clawback period, plus a line stating independent contractor, commission-only, no base salary.
- If the rep already has a signed (or pending) referral agreement, show a "already engaged" notice and require an explicit "Send replacement agreement" confirmation — the default is once-off, not re-sent per property.
- Button reads "Send Referral Agreement"; email/name fields are labelled for the rep, not an owner.

### Backend send
- `send-owner-contract` gets a referral branch: no property lookup, no property linking, no `listing_status` update, no portfolio/multi-property coverage, no "new owner will provide property details" account path.
- Stores the agreement with `contract_type: 'referral'`, the `rep_id`, and a **terms snapshot** (tier, rates, residual months, clawback days) captured at send time, so later default changes don't rewrite a signed agreement.
- Mirrors the record into the existing `rep_contracts` table (rep_id, template version, terms snapshot, signing token, status) so rep engagements are tracked per rep rather than per owner/property.

### Signing page
- Referral contracts skip the property-details capture form, covered-properties list, and property billing variable resolution entirely.
- Rep variables render from the stored terms snapshot (falling back to live defaults if absent).
- On signature, both the agreement record and the rep's contract row are marked signed, and the rep is flagged as engaged.

### Contracts list
- Referral rows show the rep name / rep code chip instead of "properties covered", and are excluded from property coverage stats, the uncontracted-properties list, and the per-property renewal/resend logic.
- Resend for a referral is a re-send of the same once-off agreement, never a new per-property version.

## Technical notes
- Files: `src/pages/AdminContracts.tsx` (scope/type UI + send handler), `src/pages/ContractSign.tsx` (referral rendering path), `supabase/functions/send-owner-contract/index.ts`, plus reuse of `src/lib/repContractVariables.ts` (`resolveRepTerms`) for the terms panel and snapshot.
- `rep_contracts` already exists with the needed columns (rep_id, template_version_id, terms_snapshot, signing_token, status) and is currently unused — no schema change expected; if a link back to the owner-contract row is wanted, one nullable column would be added in a migration.
- No changes to Standard or ROL'OS PMS contract behaviour.
