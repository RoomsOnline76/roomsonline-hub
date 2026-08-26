# Generated distribution logins move to roomsonline.co.za

Auto-generated channel sub-account logins currently use `<slug>@channels.roomsonline.co.za`. They should use the plain company domain instead: `<slug>@roomsonline.co.za`, with a number appended only when a login is refused (`<slug>2@…`, `<slug>3@…`).

## Behaviour

- First attempt: `tidal-pools-self-catering@roomsonline.co.za`
- Retry / recycle attempts: `tidal-pools-self-catering2@roomsonline.co.za`, `…3@…`
- The channel's 50-character email limit still applies; the shorter domain frees ~9 characters, so fewer slugs get truncated. Truncation logic stays, only the budget changes.
- Accounts already created on `channels.roomsonline.co.za` are left exactly as they are — they stay bound, stay verified, and Step A keeps using them.

## Technical detail

In `supabase/functions/ru-cert-portal/index.ts`:

- `RU_GENERATED_LOGIN_DOMAIN` becomes `roomsonline.co.za`.
- `generateDistributionLogin` drops the hyphen before the attempt number (`-2` → `2`) so the shape is `slug2@…`; attempt 1 stays unsuffixed. Length trimming continues to reserve room for the domain and the suffix.
- Comments and the doc block that quote the old address are updated to the new one.
- No change to candidate ordering: the resolved owner email is still tried first, and the generated login remains the automatic fallback and the recycle base.

The function is redeployed after the change; existing bindings and stored key pairs are untouched.
