## Diagnosis

`book.synful.co.za` now has a valid Cloudflare cert, but hitting it returns 404 from Vercel. Two independent things are wrong:

1. **Vercel doesn't recognise the incoming Host.** Cloudflare for SaaS terminates TLS and forwards the request to origin `fallback.roomsonline.co.za` while preserving `Host: book.synful.co.za`. Vercel only serves a request when the incoming Host is a domain attached to the project — otherwise it returns its generic 404. So both the fallback origin *and* every branded host need to be accepted by Vercel, OR we accept them via a single wildcard/catch-all mechanism.
2. **Our DB still says `dns_ok_tls_pending`.** The row for portfolio `22a7d374…` was written by the old verifier (pre-Cloudflare-for-SaaS flow) and never re-verified through the new lifecycle, so `useWhitelabel` keeps forcing the canonical host in snippets/previews. Even once Vercel serves the host, the UI won't switch to it until the row is `active`.

## What to do

### 1. Add the fallback origin to Vercel (one-time, manual)
Add `fallback.roomsonline.co.za` as a domain on the Vercel project that serves the app. No DNS change is needed on our side — Cloudflare already points there. This is what tells Vercel "accept requests whose Host is either the canonical domain or the fallback".

For branded hosts (`book.synful.co.za`, etc.) we do **not** add them individually to Vercel. Instead we rely on tenant resolution (step 3) plus Vercel's default behaviour of serving `index.html` for any Host that reaches the project via the fallback origin.

The blocker today is that Vercel is rejecting the request at the edge because neither the fallback nor `book.synful.co.za` is registered. Once the fallback is added, Cloudflare-proxied branded requests will land on the SPA.

### 2. Re-verify the portfolio row so status flips to `active`
- Open Integrations → Domains for the Jongensfontein portfolio and click **Verify** on `book.synful.co.za`. The rewritten `verify-whitelabel-domain` will:
  - Confirm DNS still points at Cloudflare/fallback.
  - Register the hostname in Cloudflare Custom Hostnames if not already (idempotent — if the cert is already live, the response comes back with `status: active`, `ssl.status: active` on the very first poll).
  - Update the DB: `white_label_domain_status = 'active'`, clear `white_label_domain_last_error`, store `cloudflare_custom_hostname_id`.
- Once the row is `active`, `useWhitelabel` returns the branded host, and every snippet + the preview iframe in `PortfolioWidgetTab` immediately start using `https://book.synful.co.za/...`.

### 3. Confirm the SPA handles Host-based tenant resolution
Today the app resolves tenants from URL path/query (`/embed/portfolio/:slug`, `ref_portfolio=…`), so a branded URL like `https://book.synful.co.za/embed/portfolio/jongensfontein` renders correctly the moment step 1 is done. Bare-root URLs like `https://book.synful.co.za/` still won't know which tenant to render — but that isn't what the user is testing, and the current 404 is the Vercel-level 404, not a React-router 404. We'll re-check after step 1: if bare-root support is wanted, we add a Host-header → portfolio resolver later.

### 4. UI safety net (small code change)
In `WhiteLabelDomainPanel.tsx`, when a portfolio/property row is in the legacy `dns_ok_tls_pending` state and the user opens the panel, auto-trigger a single re-verification so the row migrates itself to the new lifecycle without the user having to click. Show a subtle "Re-checking with Cloudflare…" chip during that call.

## Technical notes
- No migrations needed — the Cloudflare-for-SaaS columns already exist.
- No new edge functions — `verify-whitelabel-domain` already handles the "cert already active" branch.
- The only human step is adding `fallback.roomsonline.co.za` as a domain in Vercel; that cannot be done from inside this app.

## What I need from you before building
The only code change in this plan is step 4 (auto re-verify legacy rows). Steps 1–3 are configuration/click actions on Vercel and the panel. Do you want me to (a) proceed with just the small step-4 code change, or (b) also add a Host-header tenant resolver for bare-root branded URLs while I'm in there?
