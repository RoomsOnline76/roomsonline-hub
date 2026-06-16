
# Portfolio Cross-Property Revenue Share

Owners in the same portfolio agree on a referral split. When a booking for Property B originates from Property A's site (or from the portfolio landing page), Property B owes Property A its agreed share. Splits are configurable per portfolio, per pair, and aggregated into a monthly invoice.

## 1. Data model (new tables)

**`portfolio_revenue_share_config`** (one row per portfolio)
- `portfolio_id` (FK), `share_basis` enum: `gross_total | net_accommodation | net_after_rl_fees`
- `include_portfolio_origin` bool (default true) — bookings from `/portfolio/<slug>` count
- `include_cross_property_origin` bool (default true) — bookings from another property's site count
- `notes`, `updated_by`

**`portfolio_revenue_share_pairs`** (symmetric matrix; one row per ordered pair `from → to`)
- `portfolio_id`, `from_property_id` (referrer/origin), `to_property_id` (booked), `share_percent` numeric(5,2)
- `set_by_user_id`, `set_by_role` (`owner_from | owner_to | admin`), `updated_at`
- Unique on (portfolio_id, from_property_id, to_property_id)
- Both owners + admin can edit; every change written to `audit_logs`

**`booking_revenue_attributions`** (one row per qualifying booking)
- `booking_id`, `portfolio_id`, `from_property_id`, `to_property_id`
- `origin_type` enum: `portfolio_link | cross_property_site`
- `origin_url`, `basis_amount`, `share_percent`, `share_amount`, `currency`
- `status` enum: `pending | invoiced | paid | waived | disputed`
- `invoice_id` nullable (FK to next table), `created_at`

**`portfolio_share_invoices`** (monthly batch, one per from→to pair per period)
- `portfolio_id`, `from_property_id` (issuer/payee), `to_property_id` (payer), `period_start`, `period_end`
- `subtotal`, `tax`, `total`, `currency`, `status` (`draft | sent | paid | overdue | cancelled`)
- `invoice_number` (uses issuer property stationary numbering), `pdf_url`, `sent_at`, `paid_at`

All tables get standard GRANTs + RLS: admins/fearless_leader full; property owners + linked owners can read/write rows where they own `from_property_id` or `to_property_id`.

## 2. Origin attribution

- Extend booking flow to capture `origin_property_id` and `origin_type` already partially supported via referrer / embed parent. Persist on `bookings` table (new columns `origin_property_id uuid`, `origin_portfolio_id uuid`, `origin_type text`).
- Embed/iframe widget passes parent property slug via existing `rol-embed.js` postMessage; portfolio landing page injects `?ref_portfolio=<id>` which checkout reads.
- On `booking.status = confirmed`, a trigger calls `attribute_portfolio_share(booking_id)` which:
  1. Resolves portfolio(s) containing both origin and booked property
  2. Looks up the pair % and basis
  3. Computes `basis_amount` per portfolio config
  4. Inserts `booking_revenue_attributions` row(s)
  5. Fires notification (owner email + in-app) to the earning property's owner

## 3. Admin UI — `/admin/portfolios/:id`

New tab **Revenue Share**:
- Basis selector + origin toggles (portfolio config)
- N×N matrix grid: rows = booked property, cols = origin property, cells = editable % (skip diagonal)
- Each cell shows who last edited (owner/admin) and timestamp
- "Copy symmetric" helper, validation 0–100
- Audit log drawer

## 4. Owner UI — PMS dashboard

- New section **Portfolio Share** under property settings: lists each portfolio the property belongs to, shows agreed % for each direction, owner can edit own property's outgoing share (i.e. what they pay to referrers) — admin/owner edits both. Inline confirmation that the counterparty owner is notified by email.
- **Pipeline/Leads dashboard** card "Cross-Property Bookings": configurable period (week/month/quarter/YTD), shows count + total `share_amount` earned and owed, drilldown table per booking with status.

## 5. Monthly invoice generation

- Scheduled edge function `generate-portfolio-share-invoices` runs 1st of month via pg_cron:
  - Aggregates all `pending` attributions per `from→to` pair for previous month
  - Creates `portfolio_share_invoices` row (status `draft`)
  - Renders PDF using the **issuing (from) property's branded stationary template** (reuses existing invoice/email white-label system per memory `branded-email-white-labeling-v2`)
  - Sets attributions `status = invoiced`, links `invoice_id`
- Owner can review draft, then click **Send** → emails the payer property owner with PDF attached; status → `sent`
- Mark-paid action (admin or issuing owner) → status `paid`, attributions `paid`
- Manual "Generate now" button for current period (admin only)

## 6. Notifications

- Per booking: instant email to earning owner using existing unified email system, subject "New cross-property booking — R{amount} share earned"
- Monthly: invoice email to paying owner from earning owner's branded address

## 7. Files to add/modify

**Migrations**
- `xxxx_portfolio_revenue_share.sql` — 4 tables + GRANTs + RLS + indexes + trigger function + cron schedule

**Edge functions**
- `supabase/functions/attribute-portfolio-share/index.ts` — called by trigger or booking webhook
- `supabase/functions/generate-portfolio-share-invoices/index.ts` — monthly batch + PDF render
- `supabase/functions/send-portfolio-share-invoice/index.ts` — sends a single invoice

**Frontend**
- `src/pages/AdminPortfolios.tsx` (extend) — add Revenue Share tab/section
- `src/components/portfolio/RevenueShareConfig.tsx` — basis + toggles
- `src/components/portfolio/RevenueShareMatrix.tsx` — N×N grid editor
- `src/components/portfolio/PortfolioShareInvoiceList.tsx` — drafts/sent/paid
- `src/components/pms/PortfolioShareWidget.tsx` — owner dashboard widget
- `src/components/pms/CrossPropertyPipelineCard.tsx` — leads/pipeline metric
- `src/hooks/usePortfolioRevenueShare.ts`
- `src/hooks/usePortfolioShareInvoices.ts`
- Booking checkout: capture origin (small edit to checkout submit + `rol-embed.js` referrer plumbing)

## 8. Out of scope (this iteration)

- Auto-deduction from RL payouts (invoices are settled property-to-property; can layer later)
- Multi-currency conversion (use booked-property currency; flag mismatched currencies)
- Three-way splits (only pairwise; portfolio-origin is treated as a "virtual" referrer where the agreed % defaults to a portfolio-wide rate set in config)

Ready to build on approval.
