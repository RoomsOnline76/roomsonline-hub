
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

## Phase 3 — Messaging Engine
**Status:** Next up

## Phase 4 — Group Bookings & Events Completion
**Status:** Planned

## Phase 5 — Staff Shifts & Activity Log UI
**Status:** Planned

## Phase 6 — Security Hardening
**Status:** Planned

## Phase 7 — Revenue Management UI & Multi-Property Dashboard
**Status:** Planned

## Phase 8 — TypeScript Cleanup & Data Warehouse
**Status:** Planned
