

# Plan: Address ROL'OS PMS v4.0 Gaps — Prioritized Implementation

This is a large scope covering 7 major gap areas. Here is a corrected assessment of what actually exists vs what is genuinely missing, followed by a phased implementation plan.

---

## Corrected Gap Assessment (Spec vs Reality)

| Area | What EXISTS | What is GENUINELY MISSING |
|------|-----------|--------------------------|
| **Financial Engine** | Full edge function with record_payment, process_refund, generate_invoice (HTML+storage), gateway_payment, webhook handler, folio CRUD, deposit schedules, tax calculation | Live gateway wiring (call PayFast/PayGate from folio context), automatic folio creation on booking, reconciliation dashboard UI |
| **Channel Manager** | Tables, UI (connections, mappings, sync log), edge function with push_inventory/pull_reservations structure | Actual OTA API calls are **STUB** — payload built but not sent. No live connectivity |
| **Night Audit** | Full edge function with 4 automated tasks (charge posting, tax, housekeeping roll, metrics, folio close), timezone-aware, manual trigger, cron schedule, complete UI | Already quite complete. Missing: reconciliation step, audit confirmation email |
| **Messaging** | Full edge function with Resend delivery, template CRUD, queue processing, placeholder resolution, complete UI | No automated triggers (booking events don't auto-queue messages), no SMS/WhatsApp |
| **Revenue** | 661-line page with forecast, historical performance, channel breakdown, rate suggestions, active plans tab | No yield rules engine, no competitor rate parsing, no dynamic pricing automation |
| **Portfolio** | 300-line page with aggregated KPIs (revenue, occupancy, ADR, arrivals/departures), comparative chart, per-property cards | No portfolio-level restriction editor, no RevPAR aggregation, limited depth |
| **TOBI AI** | Full system prompt with 17-module navigation, common tasks, property context injection | No action capabilities (can't trigger audits, generate reports, or modify data) |

---

## Phase 1 — Critical (implement first)

### 1. Wire Messaging Automated Triggers
- Create a database trigger on `bookings` table that auto-queues messages from `rolos_message_templates` when booking status changes (confirmed → booking_confirmed template, etc.)
- Add a trigger for pre-arrival: night audit checks for bookings arriving tomorrow and queues pre_arrival template
- Wire check_out template into night audit folio-close step
- **Files**: New migration + update `pms-night-audit/index.ts`

### 2. Wire Financial Engine ↔ Booking Flow
- Auto-create folio when a ROL'OS booking is confirmed (DB trigger on bookings table)
- In `pms-financial`, add `initiate_gateway_payment` action that calls existing `payfast-api` or `paygate-api` edge functions based on `useActivePaymentGateway` logic
- Add `reconcile` action that cross-checks folio balances against payment records
- **Files**: New migration, update `pms-financial/index.ts`

### 3. Night Audit — Add Reconciliation + Notification
- Add reconciliation step in night audit: compare folio balances vs payment totals, flag discrepancies
- Send audit summary email via Resend after completion (to property owner/GM)
- **Files**: Update `pms-night-audit/index.ts`

## Phase 2 — High Priority

### 4. Channel Manager — Stub-to-Live Architecture
- Refactor `pms-channel-sync` to use a channel adapter pattern: each OTA gets a handler module
- Implement Booking.com and Airbnb stubs with proper payload structures matching their XML/JSON APIs
- Add conflict detection: when pull_reservations finds a date overlap with existing booking, flag it
- Add rate sync action (push rates to channels)
- **Files**: Rewrite `pms-channel-sync/index.ts`

### 5. Revenue Management — Yield Rules Engine
- Create `rolos_yield_rules` table (property_id, rule_type [occupancy_threshold, day_of_week, lead_time, season], condition JSON, adjustment_percent, priority)
- Add yield calculation function that applies rules to base rates
- Wire into rate push for channel manager
- Add UI tab in PMSRevenue for rule management
- **Files**: New migration, new component, update `PMSRevenue.tsx`

### 6. Portfolio View — Enhanced Depth
- Add RevPAR to aggregated KPIs
- Add comparative sparkline charts per property (7-day trend)
- Add portfolio-level restriction quick-view (stop-sells across properties)
- **Files**: Update `PMSPortfolio.tsx`, add query for restrictions

## Phase 3 — Medium Priority

### 7. TOBI AI — Action Capabilities
- Extend `help-assistant` to accept `action_request` type messages
- Support actions: trigger night audit, generate occupancy summary, list today's arrivals
- These call existing edge functions server-side and return structured results
- **Files**: Update `help-assistant/index.ts`, update `PMSTobiAssistant.tsx`

### 8. TypeScript Debt — Remove `as any` Casts
- After all table changes settle, regenerate types and replace `as any` casts with proper types from `supabase/types.ts`
- Focus on `useChannelManager.ts`, `PMSRevenue.tsx`, `PMSPortfolio.tsx`

---

## Implementation Order

```text
Phase 1 (Critical):
  [1] Messaging auto-triggers (DB trigger + night audit wire)
  [2] Financial ↔ Booking auto-folio + gateway bridge
  [3] Night audit reconciliation + email

Phase 2 (High):
  [4] Channel manager adapter pattern + conflict detection
  [5] Yield rules engine + UI
  [6] Portfolio enhanced KPIs

Phase 3 (Medium):
  [7] TOBI action capabilities
  [8] TypeScript cleanup
```

## Technical Notes
- All new DB changes via migration tool
- Messaging triggers use existing `rolos_message_queue` + `pms-message-dispatcher` — no new edge functions needed
- Financial gateway bridge reuses existing `payfast-api`/`paygate-api` functions via internal fetch
- Channel adapter pattern allows incremental OTA onboarding without rewriting core sync logic
- Security note on `verify_jwt = false`: addressed by internal auth validation in each function (getClaims/getUser pattern already in place)

