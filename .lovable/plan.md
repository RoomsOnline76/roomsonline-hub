
# ROL'OS PMS Module Completion — Implementation Progress

## Phase 1 — Night Audit Enhancement & Financial Auto-Posting ✅ COMPLETED

### Delivered
- `timezone` column on `properties` table + `rolos_night_audit_log` table with RLS
- `pms-night-audit` v2.0: timezone-aware, auto room charge + tax posting, housekeeping roll, metrics, folio closure, audit logging
- `/pms/night-audit` page with summary cards, expandable history table, manual trigger
- Sidebar item under Management, permission matrix updated

---

## Phase 2 — Financial Engine: Invoice PDF & Payment Gateway Hooks ✅ COMPLETED

### Database
- ✅ `rolos_deposit_schedules` table with RLS (rate_plan_id, deposit_type, deposit_value, due_days_before)
- ✅ `property_id` and `guest_name` columns added to `rolos_folios`
- ✅ `invoices` storage bucket created with RLS policies

### Edge Function: `pms-financial` v2.0
- ✅ `generate_invoice` — builds branded HTML invoice from folio transactions + property branding, uploads to storage, stores `pdf_url`
- ✅ `process_gateway_payment` — creates pending payment record for gateway flow (PayFast/PayGate adapter-ready)
- ✅ `payment_webhook` — updates payment status from gateway callback, posts folio transaction, recalculates balance
- ✅ `get_folios` — lists folios with booking info for property
- ✅ `get_folio_detail` — returns folio + transactions + payments + invoices in one call
- ✅ `get_deposit_schedules` — lists deposit schedules with rate plan names
- ✅ `record_payment` — now updates folio balance automatically
- ✅ Fixed `transaction_type` column name (was incorrectly `type`) in night audit

### UI: Folios Manager
- ✅ New `PMSFoliosManager` component with folio list table
- ✅ Folio detail sheet: transactions, payments, invoices with PDF download
- ✅ Record Payment dialog (amount, method, reference)
- ✅ Generate Invoice button (branded HTML with property logo/colors/VAT)
- ✅ Integrated as "Folios" tab in `/pms/reports` (Reports & Financials)

---

## Phase 3 — Messaging Engine ✅ COMPLETED

### Database
- ✅ `rolos_message_templates` table (property_id, name, trigger_event, subject, body, channel, is_active, send_offset_hours) with RLS
- ✅ `rolos_message_queue` table (reservation_id, template_id, recipient, subject, body, channel, scheduled_at, status) with RLS
- ✅ `rolos_message_log` table (reservation_id, channel, status, error, sent_at) with RLS

### Edge Function: `pms-message-dispatcher` v1.0
- ✅ Template CRUD (list, upsert, delete)
- ✅ Queue management (queue_message, process_queue, get_queue)
- ✅ Direct send (send_message) via Resend
- ✅ Placeholder resolution from reservation + guest data
- ✅ Message logging on every send attempt

### UI: `/pms/messaging` (new page)
- ✅ Template editor with placeholder insertion buttons
- ✅ Template cards with trigger event, channel, active status
- ✅ Message log table with status icons
- ✅ Queue viewer with processing trigger
- ✅ Manual send dialog

---

## Phase 4 — Group Bookings & Events Completion ✅ COMPLETED

### Database
- ✅ Added `setup_minutes`, `teardown_minutes`, `linked_group_id` to `rolos_events`
- ✅ Added `release_date`, `status` to `rolos_group_room_blocks`
- ✅ Added `attrition_rate`, `release_date` to `rolos_groups`

### UI: Groups (`/pms/groups`)
- ✅ Group detail sheet with tabs: Room Blocks | Reservations
- ✅ Room block allocation (room type, count, rate override, dates, release date)
- ✅ Release blocks back to inventory
- ✅ Link individual guest reservations to group

### UI: Events (`/pms/events`)
- ✅ Space Calendar tab — 14-day visual timeline per space
- ✅ Conflict detection with setup/teardown window checking
- ✅ Link events to group bookings

## Phase 5 — Staff Shifts & Activity Log UI ✅ COMPLETED

### UI: `/pms/staff` Enhanced
- ✅ Tabs: Roster | Shifts | Activity
- ✅ Shifts tab: Week calendar view with shift badges
- ✅ Activity tab: Filterable log from `rolos_staff_activity_log`

## Phase 6 — Security Hardening ✅ COMPLETED

### XSS Prevention + Edge Function Auth + Database Hardening
- ✅ DOMPurify sanitization on public-facing HTML rendering
- ✅ `getClaims()` JWT validation on all edge functions
- ✅ `SET search_path` + `SECURITY DEFINER` on vulnerable functions

## Phase 7 — Revenue Management UI & Multi-Property Dashboard ✅ COMPLETED

### Multi-Property Portfolio (`/pms/portfolio`) + Revenue Management (`/pms/revenue`)
- ✅ Portfolio overview with cross-property KPIs
- ✅ Revenue management with 14-day demand forecast and rate suggestions

## Phase 8 — TypeScript Cleanup & Data Warehouse ✅ COMPLETED

### TypeScript Strict Fixes + Data Warehouse Views (6 views)
- ✅ 20+ interfaces replacing `any` across PMS hooks/pages
- ✅ `dw_daily_revenue`, `dw_monthly_occupancy`, `dw_booking_pipeline`, `dw_channel_performance`, `dw_guest_ltv`, `dw_portfolio_kpis`

---

## Phase 9 — Automated Triggers, Gateway Bridge & Night Audit v3.0 ✅ COMPLETED

### Database Triggers (Migration)
- ✅ `auto_queue_booking_message()` — DB trigger on `bookings` table fires on status change (confirmed → booking_confirmed, cancelled → cancellation, checked_in → check_in, checked_out → check_out), auto-queues matching `rolos_message_templates` into `rolos_message_queue` with offset scheduling
- ✅ `auto_create_booking_folio()` — DB trigger on `bookings` table fires when status changes to 'confirmed' for ROL properties, auto-creates `rolos_folios` record and links via `rolos_folio_id`
- ✅ `auto_create_booking_folio_on_insert()` — Handles INSERT with status=confirmed (direct booking creation)
- ✅ All triggers scoped to ROL properties only (`is_rol_property = true`)

### Edge Function: `pms-night-audit` v3.0
- ✅ **TASK 5: Pre-Arrival Message Queuing** — checks for bookings arriving tomorrow, queues `pre_arrival` template into `rolos_message_queue` (deduplication check)
- ✅ **TASK 6: Folio Reconciliation** — iterates all open folios, recalculates balance from transactions, auto-corrects discrepancies
- ✅ **TASK 7: Audit Summary Email** — sends branded HTML email via Resend to property owner with KPI cards (revenue, occupancy, ADR), task breakdown table, and quick stats
- ✅ Now fetches `owner_email` from properties for email delivery

### Edge Function: `pms-financial` v3.0
- ✅ **`initiate_gateway_payment`** — creates pending payment, calls existing `payfast-api` or `paygate-api` edge function internally via fetch, returns gateway response for frontend to complete flow
- ✅ **`reconcile`** — cross-checks all open folio balances vs transaction sums, auto-fixes discrepancies, detects orphan payments (completed payments without matching folio transaction) and creates missing transactions
- ✅ Replaced `any` type on `updateData` in payment_webhook with `Record<string, unknown>`

### Files Created/Modified
- Migration: `auto_queue_booking_message`, `auto_create_booking_folio`, `auto_create_booking_folio_on_insert` (3 triggers + 3 functions)
- `supabase/functions/pms-night-audit/index.ts` — v3.0 rewrite (pre-arrival, reconciliation, email)
- `supabase/functions/pms-financial/index.ts` — v3.0 (initiate_gateway_payment, reconcile)

---

## 🏁 ROL'OS PMS Module — Phase 1-9 COMPLETE

### Remaining (Phase 2-3 of gap plan):
- [ ] Channel Manager: Adapter pattern for live OTA connectivity
- [ ] Revenue: Yield rules engine + competitor rate parsing
- [ ] Portfolio: Enhanced KPIs + comparative sparklines
- [ ] TOBI AI: Action capabilities (trigger audits, generate reports)
- [ ] TypeScript: Remaining `as any` cleanup
