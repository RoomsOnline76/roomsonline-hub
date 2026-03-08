
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

## Phase 6 — Security Hardening ✅ COMPLETED

### XSS Prevention
- ✅ Added DOMPurify sanitization to `PublicJournals.tsx` (public-facing journal content)
- ✅ Added DOMPurify sanitization to `ContractSign.tsx` (2 instances of contract HTML rendering)
- ✅ Added DOMPurify sanitization to `ContractPreviewPane.tsx` (admin contract preview)

### Edge Function Auth Hardening
- ✅ `pms-message-dispatcher`: Added `getClaims()` JWT validation (was previously unauthenticated with service role key)
- ✅ `pms-channel-sync`: Migrated from `getUser()` to `getClaims()` for consistent auth pattern
- ✅ Both functions now use separate service client for data ops and anon client for auth validation

### Database Hardening
- ✅ Fixed `update_bank_export_updated_at()` — added `SET search_path TO 'public'` + `SECURITY DEFINER`
- ✅ Fixed `generate_batch_reference()` — added `SET search_path TO 'public'`
- ✅ Reduced linter warnings from 146 to 144

### Files Modified
- `src/pages/PublicJournals.tsx` — DOMPurify import + sanitization
- `src/pages/ContractSign.tsx` — DOMPurify import + 2x sanitization
- `src/components/contract-editor/ContractPreviewPane.tsx` — DOMPurify import + sanitization
- `supabase/functions/pms-message-dispatcher/index.ts` — getClaims() auth + service client separation
- `supabase/functions/pms-channel-sync/index.ts` — getClaims() migration

## Phase 7 — Revenue Management UI & Multi-Property Dashboard ✅ COMPLETED

### Multi-Property Portfolio (`/pms/portfolio`)
- ✅ Portfolio overview page showing KPIs across all ROL properties (last 30 days)
- ✅ Total revenue, avg occupancy, avg ADR, today's arrivals/departures
- ✅ Revenue & Occupancy comparison chart (horizontal bar per property)
- ✅ Property cards with click-through to individual PMS dashboard
- ✅ Responsive grid layout (2-col md, 3-col xl)

### Revenue Management (`/pms/revenue`)
- ✅ 14-day demand forecast with occupancy-based rate suggestions
- ✅ Three tabs: Demand Forecast (chart + daily breakdown), Rate Suggestions (actionable cards), Active Plans
- ✅ KPIs: forecast occupancy, forecast revenue, revenue opportunity, demand alerts
- ✅ Signal system: increase (high demand >80%), decrease (low demand <30%), hold
- ✅ Suggested ADR adjustments with percentage badges
- ✅ Rate plan comparison against 30-day baseline ADR

### Integration
- ✅ `portfolio` and `revenue` added to PmsModule type and permission matrix
- ✅ Portfolio: owner/GM/accountant(RO)/auditor(RO) access
- ✅ Revenue: owner/GM/accountant(RO)/auditor(RO) access
- ✅ Sidebar: "Revenue Mgmt" under Revenue group, "Portfolio" under Management group
- ✅ Routes added to App.tsx

### Files Created/Modified
- `src/pages/pms/PMSPortfolio.tsx` — new
- `src/pages/pms/PMSRevenue.tsx` — new
- `src/pages/pms/index.ts` — added exports
- `src/lib/pmsPermissions.ts` — added portfolio/revenue modules
- `src/components/layout/PMSSidebar.tsx` — added nav items
- `src/App.tsx` — added routes

## Phase 8 — TypeScript Cleanup & Data Warehouse
**Status:** Planned
