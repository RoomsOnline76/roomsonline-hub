# CRM: Bookers, Companies, Agents & Source Segmentation

Today a booking only stores loose text: `guest_name`, `guest_company` (free text) and `booking_channel`. There is no way to create a **Booker** who differs from the guest, no reusable **Company / Travel Agent / Tour Operator** record, and nothing links through to invoices or reporting. Guest profiles (`rolos_guest_profiles`) are per-property only and hold no company, VAT, address-detail or segmentation fields.

This plan adds a proper CRM account layer, shared across the portfolio, and wires it into the booking record, invoices and reports.

## 1. Portfolio-shared CRM accounts

A single new record type — a **CRM account** — covers all the non-guest parties, distinguished by a type:

- Company (invoice-to / corporate)
- Travel Agent
- Tour Operator
- Source (OTA, wholesaler, referral partner)

Each account is owned by a portfolio (falling back to the property when a property has no portfolio), so creating "XL Fairmount" once makes it available to every sibling property.

Fields chosen from the reference screens, keeping the highest-value ones:

- Identity: type, display name, contact first name / surname, title
- Contact: email, phone (multiple numbers allowed in one field), website
- Billing: VAT number, registration number, address line 1 / 2 / city / postal code / country
- Commercial: default commission %, payment terms (days), credit account yes/no, currency
- Ops: internal notes, tags, active flag
- Auto-derived stats: bookings count, room nights, total revenue, last booking date

## 2. Booker vs Guest on the booking

The booking gains four links plus the segmentation fields visible in the reference reservation screen:

- **Booker** — the person who made the booking (own name, email, phone). Defaults to the guest with a "same as guest" toggle; unticking reveals booker fields and a profile picker.
- **Company** — invoice-to account.
- **Travel Agent / Tour Operator** — the trade account earning commission.
- **Source** — where the booking came from, backed by the existing channel list plus any Source-type accounts.
- **Market segment** (Leisure, Corporate, Group, Government, Long stay, Other) and **communication channel** (Online, Telephone, Email, Walk-in, Channel manager).

The Booker and each account can be created inline from the booking without leaving the dialog.

## 3. Where it appears

- **Add Booking dialog** — new "Booker & Segmentation" block in the left panel: same-as-guest toggle, booker fields, company / agent / source pickers, market segment.
- **Open booking record (Booking Details)** — the middle "Booking Notes" column gains a Segmentation section showing and editing Booker, Company, Agent, Source, Market segment; the linked account name is clickable to open its profile.
- **CRM page (`/rolos/guests`)** — becomes two tabs: **Guests** (existing) and **Companies & Agents**, with search, type filter, an editor dialog modelled on the reference "Edit Client" layout (Type / name / company / phone / email header, then tabs: VAT & Address, Extra Info, Accounts, Transactions/History), and per-account booking + revenue history.
- **Reports** — new breakdowns by market segment, by travel agent / tour operator (revenue and commission owed), and by company, alongside the existing channel chart.

## 4. Invoicing

When a booking has a linked Company, invoice generation auto-fills Invoice To with the company name, VAT number and address, and shows the agent reference where one exists. A manual override on the Account Summary panel still wins if set. This applies to both the pro forma and the final tax invoice.

## Technical notes

- New table `public.crm_accounts` (portfolio_id, property_id fallback, account_type enum, name, contact fields, VAT/registration, address columns, commission/terms, tags, is_active, timestamps) with GRANTs for `authenticated`/`service_role`, RLS via the existing portfolio-access helper (`can_access_property` / portfolio membership), and an updated_at trigger.
- New table `public.crm_bookers` for booker contact records (portfolio-scoped, name/email/phone/notes), or reuse `rolos_guest_profiles` when the booker is also a past guest — the booking stores `booker_profile_id` plus denormalised `booker_name/email/phone` so historic records stay readable.
- `bookings` gains: `booker_profile_id`, `booker_name`, `booker_email`, `booker_phone`, `booker_is_guest` (bool), `company_account_id`, `agent_account_id`, `source_account_id`, `market_segment`, `comm_channel`. Existing free-text `guest_company` stays and is backfilled/synced from the linked company for compatibility with emails and channel pushes.
- Aggregate stats exposed via a view `crm_account_stats` (booking count, nights, revenue, last booking) rather than trigger-maintained counters.
- `pms-financial` invoice generation reads the linked company for Invoice To / VAT / address; `AccountSummaryPanel` shows the resolved value and allows override.
- Front-end: new `src/components/pms/crm/CrmAccountDialog.tsx`, `CrmAccountPicker.tsx`, `CrmAccountsTab.tsx`, plus a `useCrmAccounts` hook; edits to `ManualBookingDialog.tsx`, `BookingDetailsGrid.tsx`, `PMSGuests.tsx`, `PMSReports.tsx`.
- Channel-pushed and RU reservations map their channel to a Source account where one matches, otherwise keep `booking_channel` only.
