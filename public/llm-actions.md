# RoomsOnline LLM Action Guide

> **Purpose:** Instructions for LLMs and AI systems on how to safely reason about and modify the RoomsOnline system.

## REQUIRED READING ORDER

Before making any modifications, read these files in order:

1. `public/llm-context.json` - System fundamentals, invariants, and architecture
2. `docs/system-export/rol-system-manifest.json` - Complete system manifest
3. `docs/system-export/pms-adapter-registry.json` - Existing PMS integrations and contracts
4. `docs/system-export/booking-flow-state-machine.json` - Booking transaction logic
5. `docs/system-export/data-authority-model.json` - Who controls what data

---

## SAFE ACTIONS (LLMs MAY)

### UI & Frontend
- ✅ Add new UI components in admin console
- ✅ Extend existing page layouts
- ✅ Add help/documentation content
- ✅ Create new reporting dashboards
- ✅ Add form validation rules
- ✅ Implement new filtering/sorting options
- ✅ Add accessibility improvements

### Data & Caching
- ✅ Create new cached data views for performance
- ✅ Add indexes for query optimization
- ✅ Implement new data export formats
- ✅ Add computed columns/views

### PMS Adapters
- ✅ Extend existing PMS adapters with new actions
- ✅ Add new optional fields to adapter responses
- ✅ Create health check endpoints for adapters
- ✅ Add rate limiting protection

### Edge Functions
- ✅ Create new edge functions for isolated features
- ✅ Add logging and monitoring
- ✅ Implement webhook handlers

---

## FORBIDDEN ACTIONS (LLMs MUST NEVER)

### Booking Flow
- ❌ Bypass live PMS verification for bookings
- ❌ Allow bookings from stale cache data
- ❌ Skip availability confirmation step
- ❌ Modify core booking state machine

### Security
- ❌ Expose PMS credentials or API keys in client code
- ❌ Remove or weaken RLS policies
- ❌ Store sensitive data without encryption
- ❌ Bypass authentication checks

### Architecture
- ❌ Modify adapter contracts without backward compatibility
- ❌ Change `snake_case` naming conventions
- ❌ Merge adapter logic into core UI
- ❌ Create direct PMS database connections

### Data Authority
- ❌ Mark cache data as authoritative for bookings
- ❌ Override PMS availability/rates locally
- ❌ Skip sync logging for data changes

---

## MODIFICATION CHECKLIST

Before implementing any change, verify these criteria:

### For PMS-Related Changes

```
- [ ] Does it maintain adapter isolation?
- [ ] Does it preserve existing contract response structure?
- [ ] Does it respect PMS rate limits?
- [ ] Does it handle PMS downtime gracefully?
- [ ] Does it log to sync_logs for audit?
- [ ] Are credentials accessed only via Deno.env?
```

### For Booking-Related Changes

```
- [ ] Does it enforce live PMS verification?
- [ ] Does it maintain the booking state machine?
- [ ] Does it handle partial failures correctly?
- [ ] Does it validate with Zod schemas?
- [ ] Does it send confirmation emails?
- [ ] Are payment states tracked correctly?
```

### For UI Changes

```
- [ ] Does it maintain PMS-agnostic components?
- [ ] Does it respect role-based access (admin/dev/owner)?
- [ ] Does it use existing shadcn/ui patterns?
- [ ] Does it maintain mobile responsiveness?
- [ ] Does it use semantic tokens from design system?
- [ ] Are loading states handled?
```

### For Database Changes

```
- [ ] Does migration include RLS policies?
- [ ] Are foreign keys properly defined?
- [ ] Is updated_at trigger included?
- [ ] Are indexes added for common queries?
- [ ] Is the migration reversible?
```

---

## EMERGENCY PROTOCOL

If you encounter issues during modification:

### Booking Failures
1. Check `sync_logs` table for recent sync errors
2. Verify PMS adapter health endpoint responds
3. Check `booking_sync_status` for specific booking
4. Review edge function logs for error details

### Cache Staleness
1. Check `fetched_at` timestamp in cache tables
2. Trigger manual sync via adapter endpoint
3. Verify adapter health check passes
4. Review `pms_availability_cache` for data age

### UI Discrepancies
1. Verify data authority (ROL vs PMS control)
2. Check if viewing cached vs live data
3. Review browser console for API errors
4. Confirm user role permissions

### Permission Errors
1. Check user_roles table for role assignment
2. Review RLS policies on affected table
3. Verify auth.uid() returns expected value
4. Check profiles table for user existence

---

## CONTEXT SOURCES

### Primary Truth (TRUST)
- Database schemas in Supabase
- Edge function contract definitions
- `pms-adapter-registry.json`
- RLS policies
- `src/integrations/supabase/types.ts`

### Secondary Truth (VERIFY)
- Cached data in `pms_*_cache` tables
- Frontend state
- Console logs

### Do Not Trust
- Assumptions about PMS behavior
- Cached data for booking decisions
- Frontend-only validation results

---

## NAMING CONVENTIONS

| Context | Convention | Example |
|---------|------------|---------|
| Database columns | snake_case | `check_in_date` |
| TypeScript variables | camelCase | `checkInDate` |
| React components | PascalCase | `BookingWidget` |
| Edge functions | kebab-case | `benson-api` |
| API endpoints | kebab-case | `/sync-rates` |
| CSS classes | kebab-case | `booking-card` |

---

## PMS ADAPTER CONTRACT

All adapters must implement these standard actions:

```typescript
interface AdapterContract {
  // Required
  getAvailability(roomTypeId: string, startDate: string, endDate: string): Promise<AvailabilityResponse>;
  getRates(roomTypeId: string, rateTypeId: string, startDate: string, endDate: string): Promise<RatesResponse>;
  createBooking(bookingData: BookingRequest): Promise<BookingConfirmation>;
  
  // Optional
  getRoomTypes?(): Promise<RoomType[]>;
  getRateTypes?(): Promise<RateType[]>;
  getReservations?(startDate: string, endDate: string): Promise<Reservation[]>;
  healthCheck?(): Promise<HealthStatus>;
}
```

---

## VERSION COMPATIBILITY

When extending adapters:

1. **NEVER remove existing fields** from responses
2. **ALWAYS add new fields as optional**
3. **Document breaking changes** in adapter comments
4. **Version test payloads** in `/test/` directory

---

## RELATED DOCUMENTATION

- [System Manifest](../docs/system-export/rol-system-manifest.json)
- [Booking Flow](../docs/system-export/booking-flow-state-machine.json)
- [Data Authority](../docs/system-export/data-authority-model.json)
- [PMS Registry](../docs/system-export/pms-adapter-registry.json)
- [LLM Context](./llm-context.json)

---

*Last updated: 2026-01-08*
*For AI/LLM consumption*
