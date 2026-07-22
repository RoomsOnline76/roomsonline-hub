## Goal
When the booking subdomain is changed to a new value, automatically reset the verification lifecycle so the old Cloudflare Custom Hostname is cleaned up and the panel starts from "Pending DNS" for the new domain — instead of inheriting the old row's `active`/`pending_ssl` state and stale `cloudflare_custom_hostname_id`.

## Current behaviour
`WhiteLabelDomainPanel.save()` writes the new `white_label_domain` and sets `white_label_domain_status = 'pending'`, but:
- The previous `cloudflare_custom_hostname_id` is left in the row, so the next `verify` call polls the *old* hostname on Cloudflare and can flip straight back to `active` against the wrong domain.
- `white_label_domain_last_error` / `custom_domain_error` are not cleared.
- The old Cloudflare Custom Hostname (and its Origin Rule) is never deleted, leaving orphaned certificates in the CF account.
- On the portfolio scope the same problem exists on `property_portfolios`.

## Changes

### 1. `WhiteLabelDomainPanel.tsx` — detect domain change on save
- In `save()`, compare the cleaned new value to `currentDomain`.
- If it differs and there was a previous `currentDomain`, first call the existing `delete-whitelabel-domain` edge function for the old domain (best-effort — swallow errors so a stuck CF row doesn't block the rename).
- Then write the new domain with a full reset payload:
  - `white_label_domain = <new>`
  - `white_label_domain_status = 'pending'`
  - `cloudflare_custom_hostname_id = null`
  - `white_label_domain_last_error = null`
  - `custom_domain_error = null`
- Reset local UI state: `setLiveError(null)`, `setShowDns(true)`, dismiss any lingering provisioning toast (`toast.dismiss(\`wl-provisioning-${…}\`)`), and reset `migratedRef.current = false` so the one-shot legacy migration doesn't skip the new domain.
- Toast copy switches from "Domain saved — now click Verify" to "New domain saved — verification reset" when a rename happened.

### 2. `verify-whitelabel-domain` edge function — defensive guard
- Before polling Cloudflare, if the DB row's `white_label_domain` no longer matches the `hostname` on the stored `cloudflare_custom_hostname_id`, treat the stored id as stale: null it out and fall through to the existing `cfFindHostnameByName` / create path. This protects against races where the client updates the row but the delete call to CF failed.

### 3. No schema changes
All fields already exist on `property_billing_configs` and `property_portfolios` from the earlier Cloudflare-for-SaaS migration.

## Out of scope
- No changes to snippet generation, `useWhitelabel`, or the Cloudflare origin-routing helper — those already key off the current row and will pick up the reset automatically.
- No confirmation dialog on rename; the existing "Save" button click is treated as intent.
