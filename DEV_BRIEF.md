# RoomsOnline Developer Brief

## Overview

RoomsOnline is a **curated booking platform** for vacation rentals, hotels, and B&Bs that integrates with multiple Property Management Systems (PMS). It serves as a central platform connecting property owners to various booking systems while providing a consistent booking experience for guests.

### Key Capabilities
- Multi-PMS integration (Benson, NightsBridge, Checkfront, SiteMinder, **RoomsOnline Native**)
- Real-time availability and rate synchronization
- Multi-room booking support
- Property management dashboard
- Role-based access control (Admin, User/Owner, Dev)

---

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework |
| **Vite** | Build tool & dev server |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | Component library |
| **TanStack React Query** | Data fetching & caching |
| **React Router DOM** | Client-side routing |
| **React Hook Form + Zod** | Form handling & validation |
| **Recharts** | Data visualization |
| **TipTap** | Rich text editor |

### Backend (Lovable Cloud / Supabase)
| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Primary database |
| **Supabase Auth** | Authentication |
| **Deno Edge Functions** | Serverless API endpoints |
| **Supabase Storage** | File storage (property images) |
| **Row Level Security (RLS)** | Data access control |

### External Integrations
- **Benson API** - PMS integration (full booking flow)
- **NightsBridge** - PMS integration (redirect to external booking)
- **Checkfront** - PMS integration (in development)
- **Google Maps** - Property location mapping
- **Resend** - Transactional emails

---

## Database Schema Overview

### Core Tables

| Table | Purpose |
|-------|---------|
| `properties` | Property listings with PMS codes, location, amenities |
| `bookings` | Internal booking records |
| `profiles` | User profile data linked to auth.users |
| `user_roles` | Role assignments (admin, user, dev) |

### PMS Integration Tables

| Table | Purpose |
|-------|---------|
| `pms_credentials` | API credentials per PMS system + capability flags |
| `pms_reservations` | Synced reservations from external PMS |
| `pms_room_types_cache` | Cached room type data from PMS |
| `pms_rate_types_cache` | Cached rate type data from PMS |
| `pms_availability_cache` | Cached availability & restrictions (with `source_timestamp`, `fetched_at`) |
| `pms_mappings` | Field ID mappings between PMS and internal system |

### PMS Capabilities

Each PMS integration tracks its supported capabilities in `pms_credentials.capabilities`:

| Capability | Description |
|------------|-------------|
| `supports_live_availability` | Can fetch real-time availability from PMS |
| `supports_rate_fetch` | Can pull rates/pricing from PMS |
| `supports_create_booking` | Can push new bookings to PMS |
| `supports_modify_booking` | Can modify/cancel existing bookings in PMS |
| `supports_webhooks` | PMS can push updates via webhooks |

**Current PMS Capability Matrix:**

| PMS | Live Avail | Rates | Create | Modify | Webhooks |
|-----|------------|-------|--------|--------|----------|
| **RoomsOnline** | ✅ | ✅ | ✅ | Limited | ❌ |
| Benson | ✅ | ✅ | ✅ | ❌ | ❌ |
| NightsBridge | ❌ | ❌ | ❌ | ❌ | ❌ |
| Checkfront | TBD | TBD | TBD | TBD | TBD |

*RoomsOnline Native PMS is our first-class internal adapter for properties without external PMS.*
*NightsBridge uses external redirect, so no direct API capabilities.*

**Principle**: Not all PMS systems support all features - that's OK. We always optimize for the available capabilities and gracefully degrade when features aren't supported.

### Supporting Tables

| Table | Purpose |
|-------|---------|
| `property_rates` | Rate data per date/room/rate type |
| `property_availability` | Availability data per date/room |
| `booking_sync_status` | Tracks sync state per booking |
| `sync_logs` | Audit trail for all sync operations |
| `api_keys` | Stored API keys (Google Maps, etc.) |
| `access_requests` | Public access request submissions |

### Key Views
- `public_properties` - Safe public view excluding sensitive fields (owner_email)
- `public_nightsbridge_config` - Exposes agent codes for public booking redirects

---

## Edge Functions

Located in `supabase/functions/`:

| Function | Purpose |
|----------|---------|
| `booking-orchestrator-api` | **PMS-agnostic booking orchestrator** — routes availability/room-type requests to the correct PMS adapter; single entry point for all booking flows |
| `data-access-api` | **Centralized data access layer** — serves user profile, roles, and permissions; eliminates direct DB queries from frontend hooks |
| `roomsonline-pms-api` | **Native PMS adapter** - manages availability, rates, bookings for properties without external PMS |
| `benson-api` | Benson PMS integration - fetch availability, rates, room types, reservations; push bookings |
| `hostfully-api` | Hostfully PMS integration - full adapter contract compliance |
| `ai-booking-concierge` | AI-powered booking assistant — uses `booking-orchestrator-api` for PMS-agnostic availability |
| `checkfront-api` | Checkfront PMS integration |
| `push-booking` | Push bookings to connected PMS systems |
| `sync-rates-availability` | Pull rates/availability from PMS into local cache |
| `create-user` | Admin-only user creation with role assignment |
| `reset-user-password` | Password reset email via Resend |
| `send-access-request` | Email notification for access requests |
| `send-booking-email` | Booking confirmation emails |
| `dashboard-insights` | Analytics data aggregation |
| `tripadvisor-api` | TripAdvisor reviews integration |

### Edge Function Patterns
- All functions use **Zod validation** for request payloads
- CORS headers enabled for web app access
- Service role client for elevated database access
- Comprehensive logging for debugging

---

## Adapter Response Contract

### RULE #3: Standardized Adapter Outputs - NO EXCEPTIONS

Every PMS adapter edge function MUST return responses conforming to the strict contract defined in `supabase/functions/_shared/adapter-contract.ts`.

**Base Response Shape (ALL responses):**
```typescript
{
  success: boolean;           // Operation succeeded?
  data: T | null;            // Response data (null if error)
  error: {                   // Error details (null if success)
    code: string;
    message: string;
    details?: unknown;
  } | null;
  source: "roomsonline" | "benson" | "nightsbridge" | "checkfront" | ...;
  fetched_at: string;        // ISO8601 timestamp
  action: string;            // Action performed
}
```

**The Rules:**
1. **Benson is the BASE** - Reference implementation for all field names and structures
2. **New adapters MUST conform** - May ADD fields but NEVER remove or rename base fields
3. **No "almost the same" data** - Exact field names, exact types, exact structure
4. **Transformers required** - Each adapter transforms raw PMS data to contract shape

### RULE #4: Field Naming Convention - snake_case ONLY

**ALL adapter response fields MUST use `snake_case`** - no exceptions. This applies to:
- Top-level response keys (`room_types`, `rate_types`, `availability`)
- Nested object fields (`room_type_id`, `min_guests`, `max_guests`)
- Guest rules (`allow_teens`, `teen_min_age`, `teen_max_age`)
- Rate fields (`rate_type_id`, `price_type`, `min_stay_days`)

**Why this matters:**
- Eliminates UI fallback code (`rt.maxGuests || rt.max_guests`)
- Ensures consistent data access patterns across all components
- New PMS integrations work immediately without UI changes
- Single source of truth from adapter contract

**Standard Data Shapes:**
- `AvailabilityResponse` - Room availability with restrictions and rates
- `RoomTypesResponse` - Room type definitions with guest rules
- `RateTypesResponse` - Rate type definitions with stay restrictions
- `ReservationsResponse` - Reservation data with contact and room details
- `CreateReservationResponse` - Booking creation confirmation

**When adding new PMS:**
1. Import contract types from `_shared/adapter-contract.ts`
2. Transform raw PMS response to contract shape with `snake_case` fields
3. Use `createSuccessResponse()` / `createErrorResponse()` helpers
4. NEVER return raw PMS data directly

### Adapter Compliance Status

| Adapter | Contract | snake_case | Error Codes | Actions | Notes |
|---------|----------|------------|-------------|---------|-------|
| `roomsonline-pms-api` | ✅ | ✅ | ✅ | ✅ | Reference native adapter |
| `benson-api` | ✅ | ✅ | ✅ | ✅ | Reference external adapter (Dec 2025 audit) |
| `hostfully-api` | ✅ | ✅ | ✅ | ✅ | Full compliance |
| `checkfront-api` | ⚠️ Pending | ⚠️ Pending | ⚠️ Pending | ⚠️ Pending | Awaiting API docs finalization |

### Standardized Error Codes

All adapters MUST use these codes (defined in `adapter-contract.ts`):

| Code | When to Use |
|------|-------------|
| `INVALID_REQUEST` | Invalid parameters, validation failure, unknown action |
| `AUTH_FAILED` | Authentication/credential failure |
| `ACCESS_DENIED` | User lacks permission |
| `NOT_FOUND` | Resource not found |
| `AVAILABILITY_CHANGED` | Availability changed since last check |
| `BOOKING_REJECTED` | PMS rejected booking (stop sell, restrictions) |
| `MODIFICATION_NOT_SUPPORTED` | PMS doesn't support modification |
| `CANCELLATION_NOT_SUPPORTED` | PMS doesn't support cancellation |
| `INTERNAL_ADAPTER_ERROR` | Catch-all for unexpected failures |
| `PMS_UNAVAILABLE` | PMS system unreachable |

### Standardized Action Names

| Action | Description | Native | Benson | Hostfully | Checkfront |
|--------|-------------|--------|--------|-----------|------------|
| `get_capabilities` | Returns capability flags | ✅ | ✅ | ✅ | ⚠️ |
| `health_check` | Tests connection/credentials | ❌ | ✅ | ✅ | ⚠️ |
| `fetch_availability` | Get availability + rates | ✅ | ✅ | ✅ | ⚠️ |
| `get_room_types` | Get room type definitions | ✅ | ✅ | ✅ | ⚠️ |
| `get_rate_types` | Get rate type definitions | ✅ | ✅ | ✅ | ⚠️ |
| `get_reservations` | List reservations | ✅ | ✅ | ✅ | ⚠️ |
| `create_reservation` | Create booking | ✅ | ✅ | ✅ | ⚠️ |
| `modify_reservation` | Modify booking | ⚠️ Limited | ⚠️ Stub | ⚠️ Stub | ⚠️ |
| `cancel_reservation` | Cancel booking | ✅ | ⚠️ Stub | ⚠️ Stub | ⚠️ |
| `set_availability` | Write availability (native only) | ✅ | ❌ | ❌ | ❌ |
| `set_rates` | Write rates (native only) | ✅ | ❌ | ❌ | ❌ |

---

## RoomsOnline Native PMS

### Overview

The **RoomsOnline Native PMS** (`roomsonline-pms-api`) is our first-class internal adapter for properties that don't use an external PMS system. It provides full booking engine capabilities while maintaining compatibility with the adapter-based architecture.

### Capabilities

| Capability | Status |
|------------|--------|
| `supports_live_availability` | ✅ true |
| `supports_rate_fetch` | ✅ true |
| `supports_create_booking` | ✅ true |
| `supports_modify_booking` | ⚠️ "limited" (date changes only with full availability) |
| `supports_webhooks` | ❌ false |

### Supported Actions

| Action | Description |
|--------|-------------|
| `get_capabilities` | Returns capability flags |
| `fetch_availability` | Read availability from cache tables |
| `get_room_types` | Get room type definitions |
| `get_rate_types` | Get rate type definitions |
| `get_reservations` | List reservations for property |
| `create_reservation` | Create booking with live availability validation |
| `modify_reservation` | Modify dates (limited - requires full availability) |
| `cancel_reservation` | Cancel booking and restore availability |
| `set_availability` | Write availability to cache |
| `set_rates` | Write rates to cache |

### Data Flow

```
Property (external_system = 'roomsonline')
    ↓
roomsonline-pms-api edge function
    ↓
Direct read/write to cache tables:
  - pms_availability_cache
  - pms_room_types_cache
  - pms_rate_types_cache
  - pms_reservations
```

### Key Differences from External PMS Adapters

| Aspect | External PMS (Benson) | RoomsOnline Native |
|--------|----------------------|-------------------|
| Data source | External API | Local database |
| Sync required | Yes (pull from API) | No (direct access) |
| Rate management | PMS controls | Admin controls via set_rates |
| Availability | PMS controls | Admin controls via set_availability |
| Booking validation | Live API check | Live cache check + immediate update |

### Architecture Principles

1. **Same adapter contract** - Uses identical response shapes as external PMS adapters
2. **Real-time validation** - Bookings always validate current availability before creation
3. **Immediate cache updates** - Availability decremented on booking, restored on cancellation
4. **PMS migration safe** - Can be disabled per property when switching to external PMS

---

## Authentication & Authorization

### Roles
| Role | Access Level |
|------|--------------|
| **admin** | Full system access |
| **user** | Property owner - sees only owned properties |
| **dev** | Admin access + exclusive dev tools (API Keys, Data Explorer) |

### RLS Policies
- All tables have Row Level Security enabled
- `has_role()` function checks user roles
- Owner access determined by `owner_email` matching `profiles.email`
- Anonymous users can create bookings (public booking page)

---

## Data Authority Rules

### ⚠️ RULE #1: NO BOOKING IS EVER CREATED FROM CACHE DATA ALONE

This is an **UNBREAKABLE architectural rule**:

```
For ALL booking actions → Hit PMS LIVE first, then write result.
```

**The Rule:**
1. Cache is read-optimized display data ONLY
2. Before creating ANY booking, the system MUST fetch live availability from PMS
3. If live check fails or shows insufficient availability → booking is REJECTED
4. Only after PMS confirms availability → proceed with reservation creation

**Why this is unbreakable:**
- Other guests may book between cache refresh and our attempt
- PMS may have manual blocks, maintenance, overbooking rules
- Cache can never know about real-time PMS state changes
- Prevents double-bookings and inventory conflicts
- PMS is the single source of truth for availability

### RULE #2: Cache is NEVER Authoritative. PMS Always Is.

**Cache entries carry provenance timestamps:**
- `source_timestamp` - When the PMS system reported this data was valid
- `fetched_at` - When RoomsOnline pulled this data (last_synced_at)

**Implementation in `push-booking`:**
```typescript
// BEFORE any reservation creation:
// 1. Fetch LIVE availability from PMS API
// 2. Validate ALL requested rooms against live data
// 3. ONLY proceed if PMS confirms availability
// 4. FAIL with clear error if PMS shows insufficient availability
```

This code block is marked with ASCII art banner and MUST NOT be removed or bypassed.

---

## Key Architectural Decisions

1. **PMS-Agnostic Data Model** - Standardized internal schema with mapping layer for external IDs
2. **Cache Never Authoritative** - All booking creation verifies live with PMS
3. **Benson-Only Internal Booking** - Full booking flow only for Benson; NightsBridge redirects externally
4. **Multi-Domain Deployment** - Same codebase serves admin console and public booking page based on hostname
5. **Soft Delete Pattern** - Properties use `permanently_deleted_at` to preserve historical data
6. **Session Storage Persistence** - Multi-room booking state persists across navigation

---

## Environment Variables

### Frontend (Vite)
```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
```

### Edge Functions (Secrets)
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
GOOGLE_MAPS_API_KEY
TRIPADVISOR_API_KEY
```

---

## File Structure Highlights

```
src/
├── components/
│   └── property/
│       ├── GeneralTab.tsx          # Property general info tab
│       ├── HouseStyleTab.tsx       # Branding & style tab
│       ├── InfoFacilitiesTab.tsx    # Amenities & facilities tab
│       ├── HouseRulesTab.tsx       # Rules & policies tab
│       ├── RoomManagerTab.tsx      # Room type management
│       ├── RateManagerTab.tsx      # Rate management
│       └── PropertyFormIntegrationsTab.tsx  # PMS connections
├── pages/            # Route components (lazy-loaded except Home, Auth, NotFound)
├── hooks/            # Custom React hooks (useAuth routes via data-access-api)
├── integrations/     # Supabase client & types (auto-generated — never edit)
├── lib/
│   ├── schemas/
│   │   └── pms.ts    # Zod schemas for all PMS adapter responses (snake_case enforcement)
│   └── pmsUtils.ts   # Adapter response unwrapping utilities
└── config/           # UI schema, field mappings

supabase/
├── functions/
│   ├── booking-orchestrator-api/   # PMS-agnostic booking orchestrator
│   ├── data-access-api/            # Centralized data access layer
│   ├── _shared/
│   │   ├── adapter-contract.ts     # Adapter response contract types
│   │   └── validate.ts             # Soft validation with safeParseResponse
│   └── ...                         # Other edge functions
└── config.toml       # Supabase configuration
```

---

## Performance Optimizations

| Optimization | Implementation |
|-------------|----------------|
| **Code-splitting** | `vite.config.ts` `manualChunks`: vendor-react, vendor-query, vendor-motion, vendor-ui |
| **Route lazy loading** | ~20 pages use `React.lazy()`. Only `Home`, `Auth`, `NotFound` are eager |
| **QueryClient defaults** | `staleTime: 5min`, `gcTime: 10min`, `refetchOnWindowFocus: false` globally |
| **Component memoization** | `PropertyCard` wrapped in `React.memo` with custom comparator |
| **Image optimization** | `loading="lazy"` + `decoding="async"` on all property images |

---

## Development Notes

- **Never edit** `src/integrations/supabase/client.ts` or `types.ts` - auto-generated
- Use `supabase.functions.invoke()` to call edge functions, not raw fetch
- PMS credentials stored in `pms_credentials`, not `api_keys`
- Benson uses HTTP Basic Auth (username:password base64 encoded)
- NightsBridge properties redirect to external booking URL
- **useAuth** fetches profile/roles via `data-access-api` edge function (no direct DB queries)
- **Booking flow** routes through `booking-orchestrator-api` (PMS-agnostic)
- **AI concierge** uses orchestrator for availability — no direct PMS adapter calls
- **Zod schemas** at `src/lib/schemas/pms.ts` enforce snake_case at API boundaries

### UI Component Guidelines for PMS Data

When consuming adapter responses in UI components:

1. **Always unwrap adapter response**: `const responseData = data?.data || data;`
2. **Use `snake_case` field names**: `responseData.room_types`, not `responseData.roomTypes`
3. **Access nested fields with `snake_case`**: `rt.max_guests`, `rt.allow_children`, `rt.teen_min_age`
4. **Import utility**: `import { unwrapAdapterResponse } from "@/lib/pmsUtils";`

**Example:**
```typescript
const { data } = await supabase.functions.invoke('booking-orchestrator-api', {
  body: { action: 'get_room_types', property_id: propertyId }
});

const responseData = unwrapAdapterResponse(data);
const roomTypes = responseData?.room_types || [];
const rateTypes = responseData?.rate_types || [];

// Access nested fields
roomTypes.forEach(rt => {
  console.log(rt.name, rt.max_guests, rt.allow_children);
});
```

---

## Domains

| Domain | Purpose |
|--------|---------|
| `book.sleepinafrica.roomsonline.co.za` | Public booking interface |
| `sleepinafrica.roomsonline.co.za` | Admin console |
| `notify.roomsonline.co.za` | Email sending domain (Resend) |
