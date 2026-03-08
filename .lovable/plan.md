

# ROL'OS PMS Module Completion — Phased Implementation Plan

## Current State Summary

After reviewing the codebase, here is what exists and what's missing:

**Exists & Working:**
- 12 PMS pages (Dashboard, Rooms, Guests, Housekeeping, Rate Plans, Channels, Groups, Events, Reports, Staff, Branding, Integrations)
- Night audit cron (housekeeping roll, metrics, folio close)
- Channel Manager UI with stubbed sync
- Financial hooks (payments, refunds, invoices, tax rules, waitlist, pricing rules)
- Staff management with CRUD via edge function
- Groups & Events basic CRUD
- 40+ database tables with RLS

**Missing / Stubbed:**
- Channel Manager: OTA API calls are stubs — no real integrations
- Financial Engine: No payment gateway integration, no invoice PDF, no auto-charge posting
- Night Audit: No per-property timezone, no auto room charge posting
- Messaging Engine: Entirely absent — no tables, no templates, no dispatcher
- Group Bookings: No room block/allotment logic, no release dates
- Events: No space availability checking, no reservation linkage
- Staff: No shift scheduling UI, no activity log UI
- Security: `verify_jwt = false` on pms-channel-sync, pms-financial, pms-night-audit
- Multi-property: No portfolio dashboard
- Revenue Management: Hooks exist but no UI for pricing rules
- Data Warehouse: No aggregated analytics tables
- TypeScript: Pervasive `as any` casts

---

## Phase 1 — Night Audit Enhancement & Financial Auto-Posting
**Goal:** Make the nightly cycle production-ready.

### Database
- Add `timezone` column to `properties` table (default `'Africa/Johannesburg'`)
- Create `rolos_night_audit_log` table (property_id, audit_date, tasks_json, status, started_at, completed_at)

### Edge Function: `pms-night-audit`
- Enhance to read property timezone; only audit properties where local time has passed midnight
- **Auto-post room charges:** For each checked-in reservation, calculate nightly rate from `rolos_rate_plans` / `rolos_rate_prices`, insert charge into `rolos_folio_transactions`
- **Auto-post tax:** Apply active `rolos_tax_rules` to room charges
- Write results to `rolos_night_audit_log`
- Change cron to hourly (`0 * * * *`) to catch all timezones

### UI: `/pms/night-audit` (new page)
- Read-only log viewer showing audit history per property
- Manual trigger button (admin/owner only)
- Add to sidebar under Management group, add `"night-audit"` to permission matrix

---

## Phase 2 — Financial Engine: Invoice PDF & Payment Gateway Hooks
**Goal:** Complete the financial pipeline.

### Invoice PDF Generation
- Enhance `pms-financial` edge function `generate_invoice` action to build PDF using property branding (logo, colors from `rolos_pms_branding`)
- Upload PDF to storage bucket `invoices`
- Store URL in `rolos_invoices.pdf_url`

### Payment Gateway Integration
- Extend `pms-financial` with `process_gateway_payment` action
- Adapter pattern: reuse existing `payfast-api` and `paygate-api` edge functions
- Add webhook handler action `payment_webhook` to update `rolos_payments` status from gateway callbacks
- Create `rolos_deposit_schedules` table (rate_plan_id, deposit_percentage, due_days_before)

### UI Enhancements
- Add Folios tab to guest detail or dashboard showing transactions, payments, invoices
- Invoice download button linking to stored PDF

---

## Phase 3 — Messaging Engine
**Goal:** Automated guest communication.

### Database (3 new tables)
- `rolos_message_templates` — property_id, name, trigger_event (booking_confirmed, pre_arrival, check_in, check_out, payment_request), subject, body (with `{{placeholders}}`), channel (email/sms), is_active
- `rolos_message_queue` — reservation_id, template_id, scheduled_at, sent_at, status
- `rolos_message_log` — reservation_id, channel, status, error, sent_at

### Edge Function: `pms-message-dispatcher`
- Triggered by cron (every 5 min) to process queue
- Resolves template placeholders from reservation + guest data
- Sends via existing `send-booking-email` for email channel
- Logs to `rolos_message_log`

### UI: `/pms/messaging` (new page)
- Template editor with placeholder insertion
- Preview and test send
- Message history log
- Add to sidebar, permission matrix (owner/GM full, front_desk RO)

---

## Phase 4 — Group Bookings & Events Completion
**Goal:** Room blocks, allotments, event-reservation linkage.

### Database
- `rolos_group_room_blocks` — group_id, room_type_id, blocked_rooms, rate_agreed, release_date
- `rolos_group_reservations` — group_id, reservation_id (link individual reservations)
- Add `setup_minutes`, `teardown_minutes` to `rolos_events`

### Edge Functions
- `pms-release-group-blocks` — daily cron releases rooms past release_date back to inventory
- Event availability checker in `roomsonline-pms-api` (check space + setup/teardown window)

### UI Enhancements
- Groups: Room block allocation tab with room type selector, quantity, rate, release date
- Groups: Convert confirmed group to individual linked reservations
- Events: Space availability calendar (visual timeline)
- Events: Link event to accommodation booking

---

## Phase 5 — Staff Shifts & Activity Log UI
**Goal:** Complete operational staff management.

### UI: Enhance `/pms/staff`
- Add Tabs: Roster | Shifts | Activity
- **Shifts tab:** Week calendar view, create/edit shifts per staff member
- **Activity tab:** Filterable log from `rolos_staff_activity_log`
- Housekeeping board: Add assignee dropdown per task (writes to `assigned_to`)
- When task assigned, log to activity

### Hooks
- Already have `useStaffShifts`, `useCreateShift`, `useStaffActivityLog` in `usePmsFinancial.ts` — wire to UI

---

## Phase 6 — Security Hardening
**Goal:** Eliminate security gaps.

### JWT Validation
- `pms-channel-sync`: Already validates JWT via `getUser()` — keep `verify_jwt = false` (signing-keys pattern)
- `pms-financial`: Same pattern — already validates
- `pms-night-audit`: Cron-triggered, uses service role key — no user JWT needed, acceptable as-is
- Audit all other functions for consistency

### Rate Limiting
- Add in-memory rate limiter middleware to high-traffic edge functions (channel-sync, financial)
- Pattern: Map of IP → { count, resetAt }; reject if > 100 req/min

### RLS Audit
- Verify all `rolos_*` tables have proper RLS policies using `can_access_property()`

---

## Phase 7 — Revenue Management UI & Multi-Property Dashboard
**Goal:** Dynamic pricing and portfolio view.

### Revenue Management
- New UI section in `/pms/rate-plans`: Pricing Rules tab
- Create/edit rules (occupancy-based multipliers, day-of-week, lead time)
- Rate simulator: Input dates + occupancy → preview calculated rate
- Edge function: `pms-revenue-optimizer` — nightly run applies rules to update `rolos_inventory_calendar` rates

### Multi-Property Dashboard
- New page `/pms/portfolio` for owners with multiple properties
- Aggregate cards: total revenue, avg occupancy, ADR across properties
- Property comparison table
- Uses existing `rolos_daily_metrics`

---

## Phase 8 — TypeScript Cleanup & Data Warehouse
**Goal:** Maintainability and performance.

### TypeScript
- Remove `as any` casts from all PMS hooks and pages
- Use generated types from `src/integrations/supabase/types.ts`
- Create typed interfaces for JSON columns (ChannelCredentials, PricingRuleConditions, etc.)

### Data Warehouse
- Create `rolos_analytics_monthly` table (pre-aggregated from daily_metrics)
- Edge function `pms-aggregate-analytics` — runs monthly, computes rollups
- Update `/pms/reports` to query aggregated tables for large date ranges

---

## Implementation Order & Dependencies

```text
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4
  (Night Audit)  (Financial)  (Messaging)  (Groups/Events)
                                              │
Phase 5 ──► Phase 6 ──────────────────────────┘
  (Staff UI)   (Security)
                  │
              Phase 7 ──► Phase 8
           (Revenue/Portfolio) (TS/Warehouse)
```

Phases 1-2 are sequential (financial depends on night audit charges). Phases 3-5 can partially overlap. Phase 6 should run before any production deployment. Phases 7-8 are polish.

### Estimated Scope per Phase
| Phase | New Tables | New/Modified Edge Functions | New UI Pages | Est. Effort |
|-------|-----------|---------------------------|-------------|-------------|
| 1 | 1 | 1 modified | 1 new | Medium |
| 2 | 1 | 1 modified | UI enhancements | Medium |
| 3 | 3 | 1 new | 1 new | High |
| 4 | 2 | 2 new | UI enhancements | High |
| 5 | 0 | 0 | UI enhancements | Medium |
| 6 | 0 | Multiple modified | 0 | Medium |
| 7 | 0-1 | 1 new | 1-2 new | High |
| 8 | 1 | 1 new | Refactors | Medium |

