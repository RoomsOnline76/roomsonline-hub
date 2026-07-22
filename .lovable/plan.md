## Goal
Move white-label domains from "customer terminates their own TLS" to a **set-CNAME-and-forget** flow powered by Cloudflare for SaaS Custom Hostnames. When the customer points a CNAME at `fallback.roomsonline.co.za` and clicks Verify, we call the Cloudflare API, provision a real HTTPS cert automatically, poll until it's live, and only then flip the domain to `active`. Until then, every integration snippet keeps rendering the canonical host, so guests can always book.

## 1. Data model (single migration)

Add columns to **both** `property_billing_configs` and `property_portfolios` (portfolios inherit the same lifecycle — everything today is already dual-scoped through `verify-whitelabel-domain`):

- `cloudflare_custom_hostname_id text` — Cloudflare Custom Hostname UUID
- `custom_domain_error text` — last provisioning error surfaced by Cloudflare
- extend the existing `white_label_domain_status` value set to include `pending_ssl` (in addition to today's `pending`, `dns_ok_tls_pending`, `active`, `failed`, `unconfigured`). We keep the existing column name to avoid a breaking rename; `dns_ok_tls_pending` stays around for legacy rows and is treated as a synonym of `failed` at read time.

No changes to properties table — white-label already lives on `property_billing_configs` / `property_portfolios`.

## 2. Secrets

Request three runtime secrets via `add_secret`:
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_API_TOKEN` (Zone.SSL & Certificates:Edit, Zone.Custom Hostnames:Edit, Zone.Zone:Read)
- `CLOUDFLARE_FALLBACK_ORIGIN` (default `fallback.roomsonline.co.za`)

Never expose these to the frontend — only edge functions read them.

## 3. Edge functions

### 3a. Rewrite `verify-whitelabel-domain`
Full lifecycle in one endpoint (property_id **or** portfolio_id + domain):

1. DoH lookup for CNAME/A on the branded host.
2. Accept both the new fallback (`fallback.roomsonline.co.za`) **and** the legacy targets (`sleepinafrica.roomsonline.co.za`, A `185.158.133.1`) so already-configured customers don't break.
3. If DNS is missing → `pending`, save error, stop.
4. If DNS is present but not pointing at us → `failed`, save error, stop.
5. If DNS is good and no `cloudflare_custom_hostname_id` yet:
   - `POST /zones/{zone_id}/custom_hostnames` with `{hostname, ssl:{method:"http", type:"dv", settings:{min_tls_version:"1.2"}}}`.
   - Store `cloudflare_custom_hostname_id`, set status = `pending_ssl`.
6. If a hostname id already exists:
   - `GET /zones/{zone_id}/custom_hostnames/{id}` and read `status` + `ssl.status`.
   - `active` + `ssl.status === "active"` → status `active`, set `white_label_domain_verified_at = now()`, clear error.
   - Anything else → status `pending_ssl`, store the Cloudflare error/message in `custom_domain_error` (and `white_label_domain_last_error` for backwards compat).
7. Return `{status, last_error, cloudflare: {hostname_status, ssl_status}}`.

Called by both the Save/Verify button and the polling hook (idempotent).

### 3b. New `delete-whitelabel-domain`
- Body: `{property_id?|portfolio_id?}`.
- If a `cloudflare_custom_hostname_id` exists → `DELETE /zones/{zone_id}/custom_hostnames/{id}` (ignore 404).
- Clear domain fields back to `unconfigured`.

### 3c. Optional cron sweep (`whitelabel-poll`)
Runs every 5 min, picks all rows with status `pending_ssl` and re-invokes the verify handler so a domain flips to `active` even if the user never returns to the settings page. Small, resilient (per-row try/catch, exponential-ish backoff via `updated_at` age).

## 4. Frontend

### `useWhitelabel.ts`
- Add `pending_ssl` to `domainStatus` union.
- Only treat `active` as verified for host selection — every other status keeps `host = PUBLIC_DOMAIN` (fallback stays intact).

### `WhiteLabelDomainPanel.tsx`
- Replace CNAME target constant with `fallback.roomsonline.co.za` (still copyable, still shows just the host label like `book`).
- New status meta for `pending_ssl` → amber, spinner icon, "Issuing certificate…".
- After Verify:
  - `pending` → "No DNS records yet — add the CNAME and try again."
  - `pending_ssl` → "DNS verified. Cloudflare is issuing your certificate — usually 1-2 minutes. This page will refresh automatically." Auto-poll the verify endpoint every 15 s (max ~10 min) while the panel is open.
  - `active` → green tick, collapse instructions, show **Open booking page** button linking to `https://{domain}/`.
  - `failed` → error surface with the CF or DNS reason.
- **Remove** the "Option A · Cloudflare proxy / Option B · your own CDN" block and the "terminate TLS on your side" copy. Replace with a single short note: "We provision HTTPS for you via Cloudflare — no proxy or certificate setup on your side."
- Add a small **Remove domain** action (calls the new delete function) that only shows once a domain is saved.

### `PMSIntegrations.tsx` / `AdminIntegrations.tsx`
No structural changes — the panel is already embedded in both. They automatically pick up the new status/behavior.

## 5. Fallback guarantees (invariants)

- `useWhitelabel` returns `host = PUBLIC_DOMAIN` unless `status === "active"`.
- All snippet generators (Smart Button, Portfolio Widget, embeds) already consume `useWhitelabel`, so they continue to render canonical URLs during `pending_ssl`.
- The preview iframe in `PortfolioWidgetTab` stays on the canonical host (already fixed earlier).

## 6. Resilience

- All Cloudflare calls wrapped with: 10 s fetch timeout, one retry on 5xx / network error, structured error surfaced to `custom_domain_error`.
- Every write to DB is best-effort with logging; failure to update DB does not throw to the client without a clear message.
- Token never leaves the edge function; frontend only sees `{status, last_error, cloudflare_status}`.

## Technical notes

- Cloudflare Custom Hostname payload example:
  ```json
  {"hostname":"book.synful.co.za","ssl":{"method":"http","type":"dv","settings":{"min_tls_version":"1.2"}}}
  ```
- Poll status via `GET /zones/{zone}/custom_hostnames/{id}`; look at both `status` (`pending`|`active`|`blocked`|…) and `ssl.status` (`pending_validation`|`pending_issuance`|`active`|…).
- Migration is additive (new columns + expanded status values), no data backfill needed — existing `active` and `dns_ok_tls_pending` rows keep working; a manual re-verify from the panel will register them into Cloudflare Custom Hostnames on next click.
- Legacy CNAME targets remain valid for DNS check so we don't break already-live customers before they re-point to the new fallback.
