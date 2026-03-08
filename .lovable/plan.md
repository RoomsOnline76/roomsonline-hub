
# ROL'OS PMS Module Completion — Implementation Progress

## Phase 1 — Night Audit Enhancement & Financial Auto-Posting ✅ COMPLETED

### Database
- ✅ Added `timezone` column to `properties` table (default `'Africa/Johannesburg'`)
- ✅ Created `rolos_night_audit_log` table with RLS policies (property access + service role)

### Edge Function: `pms-night-audit` v2.0
- ✅ Timezone-aware scheduling — only audits properties when local midnight has passed
- ✅ Auto-posts room charges to `rolos_folio_transactions` (nightly rate from booking)
- ✅ Auto-posts tax charges using active `rolos_tax_rules`
- ✅ Rolls housekeeping states (occupied → dirty) with auto-task creation
- ✅ Calculates daily metrics (ADR, RevPAR, Occupancy) → `rolos_daily_metrics`
- ✅ Closes balanced folios for checked-out bookings
- ✅ Writes full results to `rolos_night_audit_log`
- ✅ Supports manual trigger with `property_id` + `force` params
- ✅ Idempotent — skips already-audited dates unless forced

### UI: `/pms/night-audit`
- ✅ New page with summary cards (Last Revenue, Charges, Rooms Rolled, Folios Closed)
- ✅ Expandable audit history table with task-level detail
- ✅ Manual trigger button for owners/admins
- ✅ Added to PMS sidebar under Management group
- ✅ Permission matrix updated — owner/GM full, accountant/auditor RO, others no access

### Files Created/Modified
- `supabase/functions/pms-night-audit/index.ts` — Enhanced v2.0
- `src/hooks/useNightAuditLog.ts` — New hooks
- `src/pages/pms/PMSNightAudit.tsx` — New page
- `src/pages/pms/index.ts` — Export added
- `src/App.tsx` — Route registered
- `src/components/layout/PMSSidebar.tsx` — Night Audit sidebar item
- `src/lib/pmsPermissions.ts` — `night-audit` module added to matrix

---

## Phase 2 — Financial Engine: Invoice PDF & Payment Gateway Hooks
**Status:** Next up

### Invoice PDF Generation
- Enhance `pms-financial` edge function `generate_invoice` action with PDF
- Upload PDF to storage bucket, store URL in `rolos_invoices.pdf_url`

### Payment Gateway Integration
- Extend with `process_gateway_payment` action + adapter pattern
- Webhook handler for gateway callbacks
- Create `rolos_deposit_schedules` table

---

## Phase 3 — Messaging Engine
**Status:** Planned

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
