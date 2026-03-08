
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

### Files Created/Modified
- `supabase/functions/pms-financial/index.ts` — v2.0 rewrite
- `supabase/functions/pms-night-audit/index.ts` — fixed transaction_type column
- `src/hooks/usePmsFinancial.ts` — added useFolios, useFolioDetail, useDepositSchedules
- `src/components/pms/PMSFoliosManager.tsx` — new component
- `src/pages/pms/PMSReports.tsx` — added Tabs (Analytics | Folios)

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
- ✅ Placeholder resolution from reservation + guest data ({{guest_name}}, {{property_name}}, {{check_in}}, etc.)
- ✅ Message logging on every send attempt

### UI: `/pms/messaging` (new page)
- ✅ Template editor with placeholder insertion buttons
- ✅ Template cards with trigger event, channel, active status
- ✅ Message log table with status icons
- ✅ Queue viewer with processing trigger
- ✅ Manual send dialog

### Integration
- ✅ `messaging` added to PmsModule type and permission matrix (owner/GM full, front_desk RO, auditor RO)
- ✅ Sidebar item under Management group with MessageSquare icon
- ✅ Route `/pms/messaging` added to App.tsx
- ✅ Hooks: usePmsMessaging.ts (useMessageTemplates, useUpsertTemplate, useDeleteTemplate, useSendMessage, useMessageLog, useMessageQueue, useProcessQueue)

### Files Created/Modified
- `supabase/functions/pms-message-dispatcher/index.ts` — new
- `src/hooks/usePmsMessaging.ts` — new
- `src/pages/pms/PMSMessaging.tsx` — new
- `src/lib/pmsPermissions.ts` — added messaging module
- `src/components/layout/PMSSidebar.tsx` — added Messaging nav item
- `src/App.tsx` — added route
- `src/pages/pms/index.ts` — added export

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
- ✅ Attrition rate and release date in create form

### UI: Events (`/pms/events`)
- ✅ Space Calendar tab — 14-day visual timeline per space
- ✅ Conflict detection with setup/teardown window checking
- ✅ Link events to group bookings
- ✅ Setup/teardown time display in event table

### Files Modified
- `src/pages/pms/PMSGroups.tsx` — full rewrite with room blocks + reservations
- `src/pages/pms/PMSEvents.tsx` — full rewrite with calendar + conflict detection

## Phase 5 — Staff Shifts & Activity Log UI ✅ COMPLETED

### UI: `/pms/staff` Enhanced
- ✅ Tabs: Roster | Shifts | Activity
- ✅ **Roster tab:** Existing staff CRUD (unchanged functionality, now tabbed)
- ✅ **Shifts tab:** Week calendar view with prev/next navigation, per-staff-member rows, color-coded shift badges (Morning/Afternoon/Night/Full Day/Custom)
- ✅ **Activity tab:** Filterable log from `rolos_staff_activity_log` with staff name, action, details, timestamp
- ✅ Create Shift dialog (staff selector, shift type, start/end datetime, notes)
- ✅ Wired existing hooks: `useStaffShifts`, `useCreateShift`, `useStaffActivityLog`

### Files Modified
- `src/pages/pms/PMSStaff.tsx` — full rewrite with 3-tab layout

## Phase 6 — Security Hardening
**Status:** Planned

## Phase 7 — Revenue Management UI & Multi-Property Dashboard
**Status:** Planned

## Phase 8 — TypeScript Cleanup & Data Warehouse
**Status:** Planned
