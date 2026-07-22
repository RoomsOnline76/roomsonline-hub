
## Goal
Bring the entire `connect.roomsonline.co.za` surface — 13 marketing pages + legal docs + the TOBI Connect assistant — into alignment with the current API and PMS reality.

## Confirmed drift (from a pre-plan scan)

**PMS/adapter list is stale everywhere.** Recent rework kept only ROL'OS Native, Hostfully, Benson, Rentals United, Custom. Stale copy still names NightsBridge, Checkfront, HyperGuest, HotelBeds, ProfitRoom in:
- `ConnectHome.tsx` (`TRUST_LOGOS`), `ConnectFAQ.tsx` (Q on supported PMS), `ConnectGetStarted.tsx` (form placeholder), `ConnectPrivacyPolicy.tsx`, `ConnectTermsOfService.tsx`, and the TOBI system prompt in `supabase/functions/connect-assistant/index.ts`.

**Free-trial length inconsistent.** Site copy says **60 days** (Home hero, Home CTA, Pricing card CTAs & bullets, Features CTAs, GetStarted headline). TOBI + `ConnectFAQ` still say **30 days**. Needs one number (60 per marketing pages) applied everywhere.

**API surface is out of date.** Public docs and TOBI advertise "40+ actions" and never mention the new static-content endpoints that already ship in `roomsonline-pms-api` / `booking-portfolio-api`:
- `get_cancellation_policies` (with `linked_rate_plans`)
- `get_reservation_policies`
- `get_payment_methods` (with `logo_key`, `docs_url`, `edge_function_name`)
- `get_contact_details`
- Portfolio API `?include_static_content=true` returning `cancellation_policies`, `reservation_policies`, `policy_rate_plan_links`, `payment_methods`, `contacts` per property.

The public docs are driven by `src/data/rolos-api-actions.ts` (~fewer than the internal `ApiDocsViewer` list) so it must be updated for the new actions to appear in `/docs`.

**Integration methods count.** TOBI still claims "9 integration methods" — need to reconcile with what the Integrations page + WordPress guide actually show today.

## Scope of changes (files only)

### 1. TOBI Connect assistant — `supabase/functions/connect-assistant/index.ts`
Rewrite the system prompt so it reflects the shipped platform:
- **Supported PMS adapters:** ROL'OS Native, Hostfully, Benson, Rentals United, Custom (drop NightsBridge, Checkfront).
- **Free trial:** 60 days (aligns with marketing pages).
- **API overview:** add the Static Content group (`get_cancellation_policies`, `get_reservation_policies`, `get_payment_methods`, `get_contact_details`) and the Portfolio API `include_static_content=true` behaviour with the returned keys.
- Update action count from "40+" to the true current count.
- Refresh the "How do I embed" answer to the current integration set on the Integrations page.
- Keep persona, tone, pricing tiers, billing model, partner program copy as-is.

### 2. `src/data/rolos-api-actions.ts` (drives the public API Reference)
Add the four missing static-content actions, mirroring the schema entries already in `ApiDocsViewer.tsx`:
- `get_cancellation_policies` (returns `linked_rate_plans`)
- `get_reservation_policies` (deposit/guarantee)
- `get_payment_methods` (provider display name, `logo_key`, currencies)
- `get_contact_details`

Add a new "Static Content" category so the sidebar surfaces them. Include `curl`, JS, PHP and response examples in the same shape as existing entries.

### 3. `src/pages/connect/ConnectDocs.tsx`
- Replace the hard-coded "40+ actions for complete property management" subtitle with a value derived from `API_ACTIONS.length` (single source of truth).
- Add a small callout under the header noting the Portfolio API `include_static_content` bundle so devs discover it without hunting through actions.

### 4. `src/pages/connect/ConnectHome.tsx`
- `TRUST_LOGOS`: replace `NightsBridge` with `Benson`; add `Rentals United`. Result: `["Hostfully", "Benson", "Rentals United", "WordPress", "Elementor"]`.
- Comparison table row "REST API (40+ actions)" → derive count from the same source as Docs (or use "50+" once the new actions land) — keep language consistent with Docs.
- Verify all trial mentions remain 60-day (they already do).

### 5. `src/pages/connect/ConnectFeatures.tsx`
- REST API tile: same count fix as Home.
- No PMS name changes required (spot-checked).

### 6. `src/pages/connect/ConnectFAQ.tsx`
- "What PMS integrations are supported?" → rewrite to: ROL'OS Native + Hostfully (vacation rentals) + Benson (SA PMS) + Rentals United (60+ rental channels) + Custom via adapter pattern. Drop NightsBridge.
- "Is there a free trial?" → change "30-day" to "60-day" for consistency.
- Add a new Q&A: "What static content can I pull for a property?" listing name, media, rooms, rates, availability, cancellation policies, reservation policies, payment methods, contact details.

### 7. `src/pages/connect/ConnectGetStarted.tsx`
- PMS input placeholder: replace `NightsBridge` with `Benson`.

### 8. `src/pages/connect/ConnectPrivacyPolicy.tsx` & `ConnectTermsOfService.tsx`
- Both list synced PMS platforms as `Hostfully, NightsBridge, Benson`. Change to `Hostfully, Benson, Rentals United` (matches supported adapters).

### 9. `src/pages/connect/ConnectQuickstart.tsx`
- Update the closing "40+ actions" line to the new count and mention the Portfolio static-content bundle as a follow-up read.

### 10. Static file check — `public/docs/ROLOS-Developer-REST-API-v3.docx`
Do **not** edit the binary. Add a short "What's new" note in `ConnectDocs.tsx` and TOBI stating the linked `.docx` may lag behind the on-page reference; on-page reference is authoritative. (Regenerating the docx is out of scope unless the user asks.)

## Out of scope
- `ConnectAbout.tsx`, `ConnectPricing.tsx`, `ConnectJournal.tsx`, `ConnectWordPress.tsx` — no drift found in the scan; will only touch them if a new drift surfaces during implementation.
- Non-Connect pages (admin, ROLOS PMS ops).
- Backend adapter code, database, routes, layout, nav.
- Rewriting the `.docx` download.

## Verification after implementation
- Grep the Connect page tree for `NightsBridge`, `Checkfront`, `HyperGuest`, `HotelBeds`, `ProfitRoom`, `30-day` → expect zero hits.
- Confirm `/connect/docs` sidebar shows the new "Static Content" category with 4 actions.
- Run typecheck; smoke-load Home, Docs, FAQ, Get Started, Terms, Privacy locally.
