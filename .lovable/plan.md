## Problem

`https://book.synful.co.za/embed/...` fails with "site can't be reached". Confirmed live:

- DNS: `book.synful.co.za` CNAMEs to `sleepinafrica.roomsonline.co.za` → Vercel edge (correct).
- HTTPS: the Vercel edge has no certificate for `book.synful.co.za`, so the TLS handshake never completes. `https://sleepinafrica.roomsonline.co.za/embed/portfolio/jongensfontein` returns 200 fine.

Our current verifier only checks that DNS resolves to the canonical host, so it marked the domain **active** even though nothing terminates TLS for it. Any branded URL we generate (portfolio embed, smart button, property embed) is therefore broken end-to-end.

Since we've decided **not** to register customer domains on our hosting, the customer must terminate TLS themselves (Cloudflare orange-cloud proxy or their own CDN/reverse proxy) and forward to the canonical host. The product needs to reflect that reality instead of hiding it.

## Plan

### 1. Verifier probes HTTPS, not just DNS
Update `supabase/functions/verify-whitelabel-domain/index.ts` so a domain only becomes `active` when BOTH conditions hold:
- CNAME resolves to `sleepinafrica.roomsonline.co.za` (existing check), AND
- `https://<domain>/healthz` (or `/`) responds with a valid TLS handshake and 2xx/3xx within a short timeout.

New intermediate status `dns_ok_tls_pending` when DNS is right but HTTPS fails (certificate error, connection refused, timeout). Persist that status on both `property_billing_configs` and `property_portfolios`.

### 2. Panel reflects the real state
`src/components/integrations/WhiteLabelDomainPanel.tsx`:
- Green tick + collapsed instructions only when status is `active` (TLS confirmed).
- Amber "DNS OK — HTTPS not reachable" state that keeps instructions expanded and explains that the customer must terminate TLS via Cloudflare proxy or their own CDN.
- Show the exact failure reason from the verifier (no cert / timeout / non-2xx).

### 3. Concrete TLS-termination guidance
In the DNS instructions block add a short "TLS termination" section with two supported options:
- **Cloudflare (recommended):** create the CNAME with the orange cloud on, set SSL/TLS mode to "Full", done. Cloudflare issues the edge cert and forwards to our canonical host.
- **Own CDN / reverse proxy:** point origin at `sleepinafrica.roomsonline.co.za`, forward `Host` header of `sleepinafrica.roomsonline.co.za`, manage cert yourself.

Remove any wording that implies verification is complete once DNS resolves.

### 4. Stop advertising broken branded URLs
Everywhere we build branded URLs (`PortfolioWidgetTab`, `SmartBookButtonGenerator`, `PMSIntegrations` portfolio/property domain cards):
- If effective white-label status is not `active` (TLS-confirmed), copy snippets and the "Open" button use the canonical host, with a small note "Branded host will be used once HTTPS is reachable."
- Preview iframe stays on canonical host (already the case).

### 5. Fix the Jongensfontein data
Re-run the new verifier against `book.synful.co.za` on the portfolio row. Expected result: status flips from `active` to `dns_ok_tls_pending` until Cloudflare proxy is enabled on Synful's side. No destructive migration — just a status correction via the edge function.

### Technical notes
- The HTTPS probe runs from the edge function using `fetch(https://<domain>/healthz, { redirect: 'manual' })` inside a 5s `AbortController`. Any TLS error, DNS mismatch, or non-2xx/3xx becomes `dns_ok_tls_pending` with a reason string stored in a new `white_label_domain_last_error` column (nullable text) on both tables.
- `useWhitelabel` inheritance logic keeps working; it just now treats `dns_ok_tls_pending` as "not usable" and falls back to canonical.
- Verifier is idempotent and safe to call from both admin and ROLOS panels; existing UI trigger points don't change.

### Out of scope
- Automatic Cloudflare API integration.
- Registering white-label domains on our own hosting.
