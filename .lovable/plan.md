

## Generate RU Integration Testing Regime Document

I have thoroughly reviewed all RU integration components:

- **`rentalsunited-api/index.ts`** (1043 lines) — 18 actions: health_check, list_properties, get_property, get_availability, get_prices, list_reservations, get_leads, push_property, push_availability, push_prices, subscribe_notifications, push_long_stay_discounts, push_last_minute_discounts, set_property_status, get_location_by_coordinates, push_building, list_buildings, create_user, list_users, fill_company_details
- **`push-property-to-ru/index.ts`** (1106 lines) — Full push orchestrator with multi-unit building support, ARI, discounts, sub-account auto-provisioning
- **`ru-reservation-handler/index.ts`** (217 lines) — RLNM push handler for confirmed/cancelled reservations and leads
- **`cron-pull-ru-reservations/index.ts`** (331 lines) — 30-minute polling for reservations and leads
- **`cron-push-all-properties-to-ru/index.ts`** — Weekly full sync with RLNM refresh
- **`PushToRentalsUnited.tsx`** — UI component showing RU sub-account details

RU certification requirements from their docs confirm a PMS integration needs: property creation, calendar management, pricing, RLNM, reservation polling, and status management.

### Plan

**Single deliverable**: Write a comprehensive `.md` testing regime to `/mnt/documents/ru-integration-testing-regime.md` covering:

1. Pre-flight checks (credentials, health check)
2. Sub-account management (create_user, list_users, fill_company_details)
3. Building creation (single + multi-unit)
4. Property push (new property with ID=0, then update)
5. ARI push (availability, pricing, min stay, changeover)
6. Discount push (long stay + last minute)
7. RLNM subscription and handler verification
8. Reservation polling (Pull_ListReservations_RQ)
9. Lead polling (Pull_GetLeads_RQ)
10. Full orchestration (push-property-to-ru end-to-end)
11. Cron job validation
12. UI verification (sub-account details display)
13. Error handling and edge cases

Each step will include: objective, edge function call with exact payload, expected response, pass/fail criteria, and milestone.

