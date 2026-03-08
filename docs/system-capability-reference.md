# RoomsOnline (ROL) — System Capability Reference

> **Version:** 2026-03-08  
> **Purpose:** Comprehensive technical reference for developers to scope the system and plan new integrations/developments.  
> **Audience:** New developers, integration engineers, technical architects.

---

## Table of Contents

1. [System Identity & Purpose](#1-system-identity--purpose)
2. [Architecture Overview](#2-architecture-overview)
3. [Architectural Invariants (Hard Rules)](#3-architectural-invariants-hard-rules)
4. [Frontend Stack & Structure](#4-frontend-stack--structure)
5. [Backend Infrastructure](#5-backend-infrastructure)
6. [Database Schema Reference](#6-database-schema-reference)
7. [Edge Functions Registry](#7-edge-functions-registry)
8. [PMS Integration System](#8-pms-integration-system)
9. [Booking Flow](#9-booking-flow)
10. [Payment System](#10-payment-system)
11. [Authentication & Authorization](#11-authentication--authorization)
12. [AI & Content Generation](#12-ai--content-generation)
13. [System Health & Monitoring](#13-system-health--monitoring)
14. [Configuration Management](#14-configuration-management)
15. [Email & Notifications](#15-email--notifications)
16. [Storage & File Management](#16-storage--file-management)
17. [Audit & Compliance](#17-audit--compliance)
18. [Testing Infrastructure](#18-testing-infrastructure)
19. [Naming Conventions](#19-naming-conventions)
20. [Adding a New PMS Integration](#20-adding-a-new-pms-integration)
21. [Key File Locations](#21-key-file-locations)

---

## 1. System Identity & Purpose

**RoomsOnline (ROL)** is a **PMS-agnostic booking orchestration platform** that unifies multiple Property Management Systems under one interface.

### What ROL IS
- Multi-PMS booking engine orchestrating reservations across diverse PMS backends
- A caching and display layer for PMS data (availability, rates, room types)
- An editorial content management system for property listings
- A guest-facing booking portal and property showcase
- An admin console for property management and system configuration

### What ROL IS NOT
- ❌ A Property Management System (PMS) — PMS is always authoritative
- ❌ A channel manager
- ❌ A payment processor (delegated to PayFast/AddPay/PayGate)
- ❌ A review platform
- ❌ The source of truth for availability or rates (except for ROL-native properties)

### Domains
| Zone | Domain Pattern |
|------|---------------|
| Admin Console | `sleepinafrica.roomsonline.co.za` |
| Public Booking | `book.sleepinafrica.roomsonline.co.za` |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│  React 18 + Vite + TypeScript + Tailwind + shadcn/ui           │
│  State: TanStack Query (server) + React Context (client)       │
│  Forms: React Hook Form + Zod                                   │
│  Routing: React Router DOM v6                                   │
├─────────────────────────────────────────────────────────────────┤
│                     SUPABASE (Lovable Cloud)                    │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ Auth     │  │ PostgreSQL   │  │ Edge Functions (Deno)     │ │
│  │ (Email)  │  │ + RLS        │  │ PMS Adapters, Booking,    │ │
│  │          │  │ + Triggers   │  │ Payments, Email, AI       │ │
│  └──────────┘  └──────────────┘  └───────────────────────────┘ │
│  ┌──────────┐  ┌──────────────┐                                │
│  │ Storage  │  │ Realtime     │                                │
│  │ (Images) │  │ (Postgres    │                                │
│  │          │  │  Changes)    │                                │
│  └──────────┘  └──────────────┘                                │
├─────────────────────────────────────────────────────────────────┤
│                    EXTERNAL SYSTEMS                             │
│  Benson │ NightsBridge │ Checkfront │ Cloudbeds │ HotelBeds    │
│  Hostfully │ Little Hotelier │ ProfitRoom │ Mews │ SiteMinder  │
│  PayFast │ AddPay │ PayGate │ Google Maps │ TripAdvisor        │
│  Resend (Email) │ Google reCAPTCHA                              │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Pattern
1. **Pull Sync** (PMS → ROL): Edge functions fetch availability/rates/room types from PMS and cache locally
2. **Push Sync** (ROL → PMS): `push-booking` creates reservations in external PMS after live verification
3. **Cache Layer**: `pms_*_cache` tables store display-optimized copies; NEVER used for booking decisions

---

## 3. Architectural Invariants (Hard Rules)

These rules are **CRITICAL** and must **NEVER** be violated:

| Rule ID | Severity | Description |
|---------|----------|-------------|
| `NO_BOOKING_FROM_CACHE` | 🔴 CRITICAL | Bookings MUST verify live PMS availability before creation. Cache is display-only. |
| `CACHE_NEVER_AUTHORITATIVE` | 🔴 CRITICAL | Cache tables are read-optimization only. PMS is always source of truth. |
| `ADAPTER_CONTRACT_MANDATORY` | 🔴 CRITICAL | All PMS adapters must return responses conforming to `adapter-contract.ts`. |
| `RLS_MANDATORY` | 🔴 CRITICAL | All database tables must have Row Level Security enabled. |
| `NO_DIRECT_AUTH_TABLE_ACCESS` | 🔴 CRITICAL | Never query `auth.users` directly. Use `profiles` table. |
| `SNAKE_CASE_ONLY` | 🟡 HIGH | All adapter response fields must use `snake_case`. |
| `MULTI_ROOM_ORCHESTRATION` | 🟡 HIGH | Multi-room bookings must be atomic with proper rollback. |

---

## 4. Frontend Stack & Structure

### Technology
- **Framework:** React 18.3.1 + TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS + CSS custom properties (semantic tokens in `index.css`)
- **Components:** shadcn/ui (Radix primitives)
- **State:** TanStack Query v5 (server), React Context (client)
- **Forms:** React Hook Form + Zod validation
- **Routing:** React Router DOM v6
- **Animation:** Framer Motion
- **Rich Text:** TipTap editor

### Key Contexts
| Context | Purpose |
|---------|---------|
| `CurrencyContext` | Global currency selection and formatting |
| `SearchContext` | Property search state persistence |
| `AISearchContext` | AI-powered property search state |

### UI Zones & Route Protection

| Zone | Route Pattern | Protection | Roles |
|------|--------------|------------|-------|
| **Public Booking** | `/`, `/property/:id`, `/booking/:id` | None | Public |
| **Owner Portal** | `/dashboard`, `/calendar`, `/bookings` | `ProtectedRoute` | user, admin, dev |
| **Admin Console** | `/admin/*`, `/admin-users` | Admin check | admin, dev |
| **Dev Tools** | `/admin-keys`, `/insights`, `/dev/*` | `requireDev=true` | dev only |

### Full Route Registry (67 routes)

<details>
<summary>Click to expand route list</summary>

**Public Routes:**
- `/` — Home (property showcase, search)
- `/auth` — Login/signup
- `/property/:id` — Property showcase page
- `/property/:propertySlug/room/:roomSlug` — Room detail page
- `/booking/:id` — Booking confirmation
- `/about-us`, `/contact-us`, `/privacy-policy`, `/terms-of-service`
- `/journals`, `/journals/:slug` — Public journal articles
- `/itinerary` — Itinerary builder
- `/journey/*` — Multi-property booking journey

**Owner Portal (authenticated):**
- `/dashboard` — Owner dashboard with booking overview
- `/dashboard/reports` — ROL Pulse analytics
- `/calendar` — Booking calendar
- `/calendar-accommodation` — Accommodation-specific calendar
- `/calendar-conference`, `/calendar-event-wedding` — Event calendars
- `/bookings` — Reservation management
- `/room-availability` — Room availability grid

**Admin Console (admin+):**
- `/admin/properties` — Property overview/management
- `/admin/properties/new` — Create property (with onboarding wizard)
- `/admin/properties/:id` — Property detail/edit
- `/admin/journals`, `/admin/journals/:id` — Journal CMS
- `/admin-access-requests` — Access request queue
- `/admin-users` — User management + PMS credentials
- `/admin/contracts` — Contract template management
- `/admin/payments` — Commission & payment tracking
- `/admin/help-articles` — Help article CMS
- `/admin/audit` — Audit log viewer
- `/admin/pre-flight` — Property activation checklist
- `/admin/review-queue` — Editorial review queue
- `/admin/onboarding` — Onboarding wizard builder

**Dev Tools (dev only):**
- `/admin-keys` — PMS API key management + integration tracker
- `/dev/overview` — Developer overview
- `/dev/pms` — PMS control dashboard (12 systems)
- `/dev/testing` — Test runner
- `/dev/logs` — System logs viewer
- `/dev/features` — Feature flags
- `/dev/danger` — Danger zone utilities
- `/insights` — Business intelligence
- `/benson-config` — Benson PMS configuration
- `/admin/system-health` — System health monitoring

</details>

---

## 5. Backend Infrastructure

### Database
- **Type:** PostgreSQL 15.x (via Supabase)
- **Security:** Row Level Security (RLS) on all tables
- **Encryption:** PGP symmetric encryption for guest PII (`pgcrypto` extension)
- **Views:** `bookings_decrypted`, `public_properties`, `public_nightsbridge_config`
- **Triggers:** Audit logging, slug generation, encryption, booking validation, health aggregation

### Edge Functions (Deno Runtime)
- **65 edge functions** deployed automatically via Lovable
- Auto-deployed on code push — no manual deployment needed
- Shared utilities in `supabase/functions/_shared/`
- All support both `camelCase` and `snake_case` input parameters

### Storage Buckets

| Bucket | Public | Purpose |
|--------|--------|---------|
| `property-images` | ✅ | Property and room photos |
| `addon-images` | ✅ | Add-on/extra images |
| `package-images` | ✅ | Package deal images |
| `template-images` | ✅ | Template assets |
| `hero-videos` | ✅ | Hero section videos |
| `documents` | ✅ | General documents |
| `contracts` | ❌ | Signed contract PDFs |
| `signatures` | ❌ | Signature images |
| `property-documents` | ❌ | Private property docs |

---

## 6. Database Schema Reference

### Core Tables (50+ tables)

#### Property Management
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `properties` | Central property record | `id`, `name`, `external_system`, `owner_email`, `is_active`, `show_on_website`, `slug` |
| `property_availability` | Manual/synced availability blocks | `property_id`, `room_type`, `date`, `available_units`, `is_stop_sell` |
| `property_rates` | Rate definitions | `property_id`, `room_type_id`, `rate_type_id`, `amount` |
| `property_charges` | Additional charges (levies, fees) | `property_id`, `charge_name`, `amount`, `calculation_method` |
| `property_addons` | Extra services/add-ons | `property_id`, `name`, `price` |
| `property_activation_logs` | Activation audit trail | `property_id`, `quality_gate_results` |
| `property_owners` | Property-owner link table | `property_id`, `user_id` |
| `local_experiences` | Nearby experiences/attractions | `property_id`, `title`, `category` |

#### PMS Cache & Sync
| Table | Purpose | Staleness |
|-------|---------|-----------|
| `pms_availability_cache` | Cached PMS availability | 60 min (configurable) |
| `pms_room_types_cache` | Cached room type definitions | 24 hours |
| `pms_rate_types_cache` | Cached rate type definitions | 24 hours |
| `pms_reservations` | Synced PMS reservations | On-demand sync |
| `pms_credentials` | PMS connection credentials | — |
| `pms_tracker_status` | Integration milestone tracking (11 flags) | — |
| `pms_mappings` | External ↔ internal ID mappings | — |
| `pms_dev_notes_log` | Developer notes per PMS | — |
| `sync_logs` | All sync operation audit trail | — |

#### Booking System
| Table | Purpose |
|-------|---------|
| `bookings` | Central booking record with encrypted guest PII |
| `booking_sync_status` | PMS sync state per booking |
| `payment_transactions` | Payment records (PayFast, AddPay, PayGate) |
| `itineraries` | Multi-property trip itineraries |
| `itinerary_bookings` | Links bookings to itinerary stays |

#### User & Auth
| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (auto-created on signup) |
| `user_roles` | Role assignments (`app_role` enum) |
| `access_requests` | Self-service access request queue |
| `owner_pms_credentials` | Owner-level PMS account credentials |

#### Content & Editorial
| Table | Purpose |
|-------|---------|
| `journals` | Blog/journal articles with slugs |
| `help_articles` | In-app help documentation |
| `help_search_logs` | Help search analytics |
| `book_page_images` | Homepage booking page imagery |

#### Contracts & Legal
| Table | Purpose |
|-------|---------|
| `owner_contracts` | Owner-level contracts with e-signature |
| `contract_templates` | Template definitions |
| `contract_template_versions` | Immutable template versions |

#### System & Operations
| Table | Purpose |
|-------|---------|
| `audit_logs` | Comprehensive change audit trail |
| `system_health_components` | Health check component registry |
| `system_health_checks` | Individual health check results |
| `system_health_aggregates` | Hourly health statistics |
| `system_alerts` | Active system alerts |
| `supporting_systems` | External tool/service registry |
| `financial_metrics` | Cash position and runway tracking |
| `invoices` | Vendor invoice tracking |

#### Configuration
| Table | Purpose |
|-------|---------|
| `api_keys` | System API key storage |
| `field_registry` | Property form field definitions |
| `onboarding_wizards` | Wizard definitions |
| `onboarding_steps` | Wizard step definitions |
| `onboarding_fields` | Wizard field definitions |
| `charge_presets` | Predefined charge templates |
| `navigation_tag_categories` | Property tag taxonomy |
| `brochure_templates` | PDF brochure templates |

### Key Database Enums
```sql
app_role:              admin | user | dev | fearless_leader
audit_action_type:     create | update | delete | permission_change | sync | export | login | other
audit_request_origin:  admin_ui | edge_function | api | cron | db_trigger
audit_user_role:       admin | dev | owner | system
component_type:        pms | internal | external | infrastructure
health_status:         healthy | degraded | failed | unknown
pms_integration_status: coming_soon | in_development | parked | in_testing | deployed
```

### Key Database Functions
| Function | Purpose | Security |
|----------|---------|----------|
| `has_role(user_id, role)` | Check user role (used in RLS) | SECURITY DEFINER |
| `is_property_owner(property_id, user_id)` | Check property ownership | SECURITY DEFINER |
| `is_linked_owner(property_id, user_id)` | Check linked ownership | SECURITY DEFINER |
| `encrypt_sensitive_text(text)` | PGP encrypt guest PII | SECURITY DEFINER |
| `decrypt_sensitive_text(bytea)` | Decrypt (admin/dev only) | SECURITY DEFINER |
| `log_audit_change()` | Trigger: comprehensive audit logging | SECURITY DEFINER |
| `log_booking_modification()` | Trigger: booking change history | SECURITY DEFINER |
| `can_confirm_booking()` | Trigger: validates booking confirmation | SECURITY DEFINER |
| `enforce_contract_before_activation()` | Trigger: requires signed contract | SECURITY DEFINER |
| `generate_property_slug(name, id)` | Auto-generate URL slugs | — |
| `update_health_aggregates()` | Trigger: aggregate health stats | SECURITY DEFINER |

### Key Views
| View | Purpose |
|------|---------|
| `bookings_decrypted` | Bookings with decrypted guest PII (admin/dev only) |
| `public_properties` | Filtered properties for public display |
| `public_nightsbridge_config` | Public NightsBridge agent codes |

---

## 7. Edge Functions Registry

### PMS Adapters (9)
| Function | PMS | Status | Key Actions |
|----------|-----|--------|-------------|
| `benson-api` | Benson | Deployed | health, availability, rooms, rates, reservations, create_booking |
| `checkfront-api` | Checkfront | Ready | health, availability, rooms, rates |
| `cloudbeds-api` | Cloudbeds | In Dev | health, availability, rooms, rates |
| `hostfully-api` | Hostfully | Deployed | health, availability, rooms, rates, editorial |
| `hotelbeds-api` | HotelBeds | Ready | health, availability, rooms, create_booking, cancel |
| `little-hotelier-api` | Little Hotelier | Hidden | health, availability, rooms, rates |
| `nightsbridge-reservations-sync` | NightsBridge | Deployed | reservation sync only (widget booking) |
| `rentalsunited-api` | Rentals United | Hidden | — |
| `roomsonline-pms-api` | ROL'OS (Internal) | In Dev | full CRUD: availability, rates, rooms, bookings, modify, cancel |

### Booking & Payment (7)
| Function | Purpose |
|----------|---------|
| `push-booking` | **CRITICAL**: Booking creation orchestrator with live PMS verification |
| `multi-push-booking` | Multi-property itinerary booking |
| `modify-booking` | Booking modification with availability re-check |
| `cancel-booking` | Booking cancellation with PMS sync |
| `payfast-api` | PayFast payment gateway |
| `paygate-api` | PayGate payment gateway |
| `validate-itinerary-availability` | Pre-booking availability validation |

### Sync & Data (5)
| Function | Purpose |
|----------|---------|
| `sync-rates-availability` | Pull rates/availability from PMS to cache |
| `sync-editorial` | Pull editorial/property data from PMS |
| `calculate-commission` | Commission calculation engine |
| `revenue-pulse-api` | Revenue analytics API |
| `revenue-pulse-insights` | AI-powered revenue insights |

### AI & Content (7)
| Function | Purpose |
|----------|---------|
| `ai-booking-concierge` | AI conversational booking assistant |
| `ai-property-search` | Natural language property search |
| `ai-website-sync` | AI website content sync |
| `editorial-ai-assist` | AI property description generation |
| `bulk-editorial-generate` | Batch AI content generation |
| `parse-special-requests` | AI parsing of guest special requests |
| `smart-room-parser` | AI room type parsing/mapping |

### Email & Notifications (10)
| Function | Purpose |
|----------|---------|
| `send-booking-email` | Booking confirmation to guest |
| `send-contact-email` | Contact form submissions |
| `send-contract` / `send-owner-contract` | Contract delivery |
| `send-onboarding-email` | Owner onboarding emails |
| `send-access-request` | Access request notifications |
| `send-activation-notification` | Property activation alerts |
| `send-pms-status-report` | PMS status email reports |
| `send-itinerary-email` | Itinerary confirmations |
| `send-survey-report` | Survey results |
| `email-contract-copy` | Contract copy delivery |

### Auth & User (4)
| Function | Purpose |
|----------|---------|
| `create-user` | Admin user creation with role |
| `forgot-password` | Password reset trigger |
| `reset-user-password` | Admin password reset |
| `add-pms-credential` | Add owner PMS credentials |

### System & Monitoring (8)
| Function | Purpose |
|----------|---------|
| `system-health-check` | Automated health checks (cron) |
| `daily-health-report` | Daily status email report |
| `dashboard-insights` | Analytics aggregation |
| `monitor-anomalies` | Anomaly detection |
| `check-activation-readiness` | Property activation gate |
| `post-launch-validator` | Post-activation validation |
| `log-audit-event` | Programmatic audit entry |
| `fetch-audit-logs` | Audit log retrieval |

### Utility (8)
| Function | Purpose |
|----------|---------|
| `geocode-property` | Address → coordinates |
| `get-contract-by-token` | Public contract access |
| `process-signature` | E-signature processing |
| `generate-itinerary-pdf` | PDF brochure generation |
| `generate-checklist` | Property checklist generator |
| `get-feature-flags` | Feature flag retrieval |
| `tripadvisor-api` | TripAdvisor review fetch |
| `bank-export-api` | Bank export file generation |

### Testing (3)
| Function | Purpose |
|----------|---------|
| `execute-test-run` | Run test scenarios |
| `generate-test-scenarios` | AI test scenario generation |
| `review-property` | AI property review analysis |
| `validate-images-against-data` | Image-data consistency check |
| `enrich-property-experiences` | AI local experience enrichment |

---

## 8. PMS Integration System

### Supported Systems (13 visible)

| System | Key | Status | Type | Modify | Cancel | Notes |
|--------|-----|--------|------|--------|--------|-------|
| **Benson** | `benson` | Deployed | Full API | ❌ | ❌ | Primary PMS. API lacks modify/cancel. |
| **NightsBridge** | `nightsbridge` | Deployed | Widget | ❌ | ❌ | Widget-only, no API access |
| **Hostfully** | `hostfully` | Deployed | Full API | ❌ | ❌ | Read-only integration |
| **Checkfront** | `checkfront` | Ready | OAuth API | ❌ | ❌ | Token refresh required |
| **HotelBeds** | `hotelbeds` | Ready | REST API | ❌ | ✅ | Distribution platform, sandbox read-only |
| **Cloudbeds** | `cloudbeds` | In Dev | REST API | ❌ | ❌ | Good API coverage |
| **ProfitRoom** | `profitroom` | In Dev | REST API | — | — | Hotel CRS platform |
| **ROL'OS** | `roomsonline` | In Dev | Internal | ✅ | ✅ | Native PMS for ROL-managed properties |
| **Mews** | `mews` | Planned | — | — | — | — |
| **RoomKey** | `roomkey` | Planned | — | — | — | — |
| **RoomRaccoon** | `roomracoon` | Planned | — | — | — | — |
| **Semper** | `semper` | Planned | — | — | — | — |
| **SiteMinder** | `siteminder` | Planned | — | — | — | — |

**Hidden (deprecated):** Guesty, Little Hotelier, Rentals United

### Integration Milestone Tracking (11 flags per system)

| # | Shorthand | Flag Column | Description |
|---|-----------|-------------|-------------|
| 1 | Ac | `has_account` | Account created |
| 2 | Do | `has_docs` | Documentation reviewed |
| 3 | Ax | `has_access` | API access granted |
| 4 | He | `has_health` | Health check implemented |
| 5 | Gt | `has_get` | GET availability working |
| 6 | Ef | `has_edge` | Edge function deployed |
| 7 | Ps | `has_post` | POST booking working |
| 8 | Mo | `has_modify` | Modify booking working |
| 9 | Ca | `has_cancel` | Cancel booking working |
| 10 | Te | `has_soft_test` | Soft testing complete |
| 11 | Ce | `is_certified` | Certified for production |

**Additional columns:** `is_production`, `active_environment`, `integration_status`, `notes`

### Adapter Contract

All PMS adapters MUST return this response shape:
```typescript
interface AdapterResponse<T> {
  success: boolean;
  data: T | null;
  error: AdapterError | null;
  source: PmsSource;       // e.g. "benson", "hostfully"
  fetched_at: string;      // ISO8601 timestamp
  action: string;          // e.g. "fetch_availability"
}

interface AdapterError {
  code: string;            // From ERROR_CODES enum
  message: string;
  details?: unknown;
}
```

### Standard Error Codes
| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_REQUEST` | 400 | Request validation failed |
| `AUTH_FAILED` | 401 | PMS authentication failed |
| `ACCESS_DENIED` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found in PMS |
| `AVAILABILITY_CHANGED` | 409 | Availability changed during booking |
| `BOOKING_REJECTED` | 422 | PMS rejected booking |
| `MODIFICATION_NOT_SUPPORTED` | 501 | PMS doesn't support modify |
| `CANCELLATION_NOT_SUPPORTED` | 501 | PMS doesn't support cancel |
| `INTERNAL_ADAPTER_ERROR` | 500 | Unexpected adapter error |
| `PMS_UNAVAILABLE` | 503 | PMS API unreachable |

### PMS Data Authority Model
```
PMS Controls (authoritative):     ROL Controls (authoritative):
├── availability                  ├── property_display_data
├── rates                         ├── editorial_content
├── booking_confirmation          ├── user_interface
├── inventory_counts              ├── booking_collection_form
├── room_type_definitions         ├── cache_management
├── rate_type_definitions         ├── user_accounts
└── reservation_status            ├── navigation_tags
                                  └── property_images
```

### Per-PMS Field Authority
Defined in `src/config/pms-implementation-master.json`. Fields can be:
- `authoritative` — PMS value overrides admin edits
- `seed_only` — PMS value used as initial seed, admin can override
- `partial` — Some sub-fields from PMS, rest from admin
- `not_available` — PMS doesn't provide this data

### Environment Management
- Each PMS tracker has `active_environment` (test/staging/production)
- `pms_credentials` stores per-environment connection details
- Toggling environment triggers credential sync from `owner_pms_credentials`
- HotelBeds sandbox is read-only (booking mocked in test mode)

---

## 9. Booking Flow

### Flow: Guest → Booking → PMS

```
1. Guest selects dates/rooms on PropertyShowcase
2. System checks cached availability (display only)
3. Guest fills booking form → creates itinerary
4. Payment initiated (PayFast/AddPay)
5. Payment success triggers push-booking edge function
6. push-booking performs:
   a. LIVE availability verification with PMS (RULE #1)
   b. If available: creates reservation in PMS
   c. If unavailable: returns AVAILABILITY_CHANGED error
   d. Updates bookings table + booking_sync_status
   e. Blocks dates in property_availability (stop-sell)
   f. Sends confirmation email
7. Guest receives booking confirmation
```

### Payment-First Logic
- PayFast payment success is the prerequisite for PMS stop-sell
- Payment → PMS verification → PMS booking → local confirmation

### Multi-Room Bookings
- Rooms grouped by date range
- Processed as atomic operations
- Partial failure tracked per-room in `booking_sync_status`

### Modification & Cancellation
- `modify-booking` edge function: validates PMS capability, re-verifies availability for date changes
- `cancel-booking` edge function: syncs cancellation to PMS
- `log_booking_modification` trigger maintains immutable history in `modification_notes` JSONB
- Benson: modify hidden, cancel is local-only with warning

### Manual PMS Mode (ROL-native)
- Properties with `external_system: 'none'` use ROL'OS
- Booking confirmation auto-blocks dates via `property_availability` upsert
- Uses 4-column unique index: `(property_id, room_type, date, external_system)`

---

## 10. Payment System

### Payment Providers
| Provider | Status | Type | Edge Function |
|----------|--------|------|---------------|
| PayFast | Active | South African gateway | `payfast-api` |
| AddPay | Configured | Alternative gateway | (via supporting_systems) |
| PayGate | Configured | Alternative gateway | `paygate-api` |

### PayFast Integration Details
- Signature verification using official PHP SDK spec
- URL encoding: uppercase hex, spaces → `+`
- Fixed field ordering for outbound requests (`PAYFAST_FIELD_ORDER`)
- ITN verification uses exact POST key order
- Passphrase sanitized to strip non-printable characters

### Payment Tables
- `payment_transactions`: All payment records with gateway response
- `bookings.payment_status`: pending | paid | failed | refunded
- `bookings.payment_reference`: External payment reference

---

## 11. Authentication & Authorization

### Auth System
- **Provider:** Supabase Auth (email/password)
- **Auto-confirm:** Enabled
- **Profile creation:** Automatic via `handle_new_user()` trigger

### Role System
- Roles stored in separate `user_roles` table (not on profiles)
- Checked via `has_role(user_id, role)` SECURITY DEFINER function
- Dev roles protected: only devs can remove dev assignments

### Role Hierarchy
```
fearless_leader (special role)
  └── dev (full system access)
       └── admin (property + user management)
            └── user (owner portal access)
```

### Route Protection
- `ProtectedRoute` component checks authentication
- `requireDev=true` prop for dev-only routes
- Owner routes filter by `is_property_owner()` or `is_linked_owner()`

---

## 12. AI & Content Generation

### AI Models Available (via Lovable AI — no API key needed)
- Google Gemini 2.5 Pro/Flash/Flash-Lite
- Google Gemini 3.x Preview models
- OpenAI GPT-5/5-mini/5-nano/5.2

### AI Features
| Feature | Edge Function | Model Used |
|---------|--------------|------------|
| Booking Concierge | `ai-booking-concierge` | Conversational booking assistant |
| Property Search | `ai-property-search` | Natural language → property matches |
| Editorial Generation | `editorial-ai-assist` | Property descriptions, "why this place matters" |
| Bulk Editorial | `bulk-editorial-generate` | Batch content for multiple properties |
| Special Request Parsing | `parse-special-requests` | Structured extraction from free text |
| Room Parsing | `smart-room-parser` | Room type mapping from PMS data |
| Revenue Insights | `revenue-pulse-insights` | Analytics interpretation |
| Test Generation | `generate-test-scenarios` | AI-generated test cases |
| Experience Enrichment | `enrich-property-experiences` | Local experience content |

### Feature Flags
- `AI_CONCIERGE_ENABLED`
- `VOICE_INPUT_ENABLED`
- `ENHANCED_PDF_ENABLED`
- `PROACTIVE_SUGGESTIONS_ENABLED`

---

## 13. System Health & Monitoring

### Components
- `system_health_components`: Registry of monitored components (PMS, internal, external)
- `system_health_checks`: Individual check results with latency
- `system_health_aggregates`: Hourly rollups (auto-populated by trigger)
- `system_alerts`: Active alerts with severity

### Health Check Flow
1. Cron triggers `trigger_system_health_check()` database function
2. Calls `system-health-check` edge function
3. Each PMS adapter's `health_check` action is invoked
4. Results stored in `system_health_checks`
5. `update_health_aggregates()` trigger rolls up stats

### Sync Status Categories
- **Synced:** last_sync_at < 24 hours ago
- **Stale:** last_sync_at 24-72 hours ago
- **Outdated:** last_sync_at > 72 hours ago
- **NightsBridge:** "Online" based on `nightsbridge_booking_sessions` activity

### Daily Health Report
- Automated email via `daily-health-report` edge function
- Sent via `trigger_daily_health_report()` database function

---

## 14. Configuration Management

### Version-Controlled Contract System
- Immutable template versions in `contract_template_versions`
- Rich text editor (TipTap) with dynamic variables: `{{property_name}}`, `{{owner_name}}`, etc.
- Variable schema validation
- E-signature flow with token-based access

### Schema-Driven Onboarding Wizard
- `onboarding_wizards` → `onboarding_steps` → `onboarding_fields`
- Drag-and-drop step/field ordering
- Field keys mapped to `field_registry` for data integrity
- Full audit trail in `wizard_audit_log`

### PMS Field Control
- `pms-implementation-master.json` defines per-PMS field authority
- `pms_managed_fields` on properties tracks which fields are PMS-controlled
- UI locks fields when PMS is authoritative

### Centralized PMS Config
- `src/lib/pmsSystemsConfig.ts`: Single source of truth for PMS system metadata
- Controls visibility, deployment status, UI card rendering
- Used by AdminKeys, PropertyForm, DevPMS pages

---

## 15. Email & Notifications

### Provider: Resend
- API key: `RESEND_API_KEY` (secret)
- 10 email edge functions for different notification types

### Email Types
| Type | Function | Trigger |
|------|----------|---------|
| Booking Confirmation | `send-booking-email` | Successful booking |
| Contract Delivery | `send-contract` | Admin action |
| Owner Onboarding | `send-onboarding-email` | Property created |
| Access Request | `send-access-request` | Self-service signup |
| Activation Alert | `send-activation-notification` | Property activated |
| PMS Status Report | `send-pms-status-report` | Manual/scheduled |
| Itinerary | `send-itinerary-email` | Itinerary confirmed |
| Contact Form | `send-contact-email` | Public form submission |
| Survey Report | `send-survey-report` | Survey completion |

---

## 16. Storage & File Management

### Image Management
- Property images stored in `property-images` bucket (public)
- Image URLs stored in `properties.images` JSONB array
- Room images in `hostfully_room_types.images` JSONB

### Document Management
- Signed contracts in `contracts` bucket (private)
- E-signatures in `signatures` bucket (private)
- Property documents in `property-documents` bucket (private)

### PDF Generation
- Itinerary brochures via `generate-itinerary-pdf`
- Contract PDFs with signature overlay via `process-signature`

---

## 17. Audit & Compliance

### Comprehensive Audit System
- `audit_logs` table with tamper-detection hash (`immutable_hash`)
- `log_audit_change()` trigger on key tables
- Captures: old/new values, changed fields, user, role, IP, session
- Sensitive fields auto-redacted: `password`, `api_key`, `key_value`, `access_token`, `refresh_token`
- Request origins tracked: `admin_ui`, `edge_function`, `api`, `cron`, `db_trigger`

### Booking Audit
- `modification_notes` JSONB array appended by trigger
- `cancellation_reason` text field
- `booking_sync_status` tracks all PMS sync attempts

### Wizard Audit
- `wizard_audit_log` tracks all configuration changes
- Entity types: wizard, step, field, template, template_version

### Contract Compliance
- `enforce_contract_before_activation()` trigger prevents website listing without signed contract
- Owner contracts support admin override with reason tracking

---

## 18. Testing Infrastructure

### Test Runner
- `test_runs` table: test run definitions and results
- `test_logs` table: individual scenario results with assertions
- `execute-test-run` edge function: runs test scenarios
- `generate-test-scenarios` edge function: AI-generated test cases

### Testing UI
- `/dev/testing` page for running and monitoring tests
- Test categories: PMS health, booking flow, sync, API

---

## 19. Naming Conventions

| Context | Convention | Example |
|---------|------------|---------|
| Database columns | `snake_case` | `check_in_date` |
| TypeScript variables | `camelCase` | `checkInDate` |
| React components | `PascalCase` | `BookingWidget` |
| Edge functions (folders) | `kebab-case` | `benson-api` |
| API endpoints/actions | `snake_case` | `fetch_availability` |
| CSS classes | `kebab-case` | `booking-card` |
| Design tokens | `--kebab-case` | `--primary-foreground` |

### Interoperability Rule
All edge functions support BOTH `camelCase` and `snake_case` input parameters to prevent cross-system failures.

---

## 20. Adding a New PMS Integration

### Step-by-Step Checklist

1. **Create Edge Function**
   - Create `supabase/functions/{pms-name}-api/index.ts`
   - Import from `../_shared/adapter-contract.ts`

2. **Implement Required Actions**
   - `health_check` (mandatory)
   - `fetch_availability` (mandatory)
   - `get_room_types` (mandatory)
   - `get_rate_types` (recommended)
   - `create_reservation` (for booking support)

3. **Add to System Config**
   - Add entry to `src/lib/pmsSystemsConfig.ts`
   - Set `deploymentStatus`, `hasCustomCard`, etc.

4. **Add Field Authority Rules**
   - Add PMS entry to `src/config/pms-implementation-master.json`
   - Define which fields are authoritative/seed_only/not_available

5. **Add Credential Support**
   - Add required secrets via `secrets--add_secret`
   - Define credential schema in `pms_credentials` table

6. **Add to Booking Flow**
   - Add handler branch in `push-booking/index.ts`
   - Implement pre-booking verification (RULE #1)

7. **Add Tracker Entry**
   - Insert row in `pms_tracker_status`
   - Set initial milestone flags

8. **Add Admin UI Card** (optional)
   - Create card component in AdminKeys page
   - Set `hasCustomCard: true` in config

9. **Test Progressive**
   - Health check → Room types → Availability → Booking
   - Add to `system_health_components` for monitoring

---

## 21. Key File Locations

### Configuration Files
| File | Purpose |
|------|---------|
| `src/lib/pmsSystemsConfig.ts` | Centralized PMS system definitions |
| `src/config/pms-implementation-master.json` | Per-PMS field authority rules |
| `public/llm-context.json` | AI/LLM system context |
| `public/llm-actions.md` | AI/LLM action guide |
| `docs/property-form-field-map.json` | Property form field definitions |

### System Export Documents
| File | Purpose |
|------|---------|
| `docs/system-export/rol-system-manifest.json` | Complete system manifest |
| `docs/system-export/pms-adapter-registry.json` | PMS adapter contracts and capabilities |
| `docs/system-export/booking-flow-state-machine.json` | Booking flow logic |
| `docs/system-export/data-authority-model.json` | Data ownership model |

### Developer Guides
| File | Purpose |
|------|---------|
| `docs/booking-flow-complete.md` | Definitive booking flow reference (v2.0) |
| `docs/ai-concierge-developer-guide.md` | AI concierge implementation |
| `docs/reservations-page-developer-guide.md` | Reservations UI guide |
| `docs/modify-cancel-booking-implementation-brief.md` | Modify/cancel system spec |
| `docs/property-listing-process.md` | Property activation workflow |

### Shared Edge Function Utilities
| File | Purpose |
|------|---------|
| `supabase/functions/_shared/adapter-contract.ts` | PMS adapter response types |
| `supabase/functions/_shared/cors.ts` | CORS headers |

### Auto-Generated (DO NOT EDIT)
| File | Purpose |
|------|---------|
| `src/integrations/supabase/types.ts` | Database type definitions |
| `src/integrations/supabase/client.ts` | Supabase client instance |
| `supabase/config.toml` | Supabase project config |
| `.env` | Environment variables |

---

## Appendix: Secrets Registry

| Secret | Purpose | Used By |
|--------|---------|---------|
| `HOTELBEDS_API_KEY` / `_SECRET` | HotelBeds API auth | `hotelbeds-api` |
| `HOSTFULLY_API_KEY` / `CLIENT_ID` / `CLIENT_SECRET` | Hostfully auth | `hostfully-api` |
| `NIGHTSBRIDGE_API_KEY` | NightsBridge auth | `nightsbridge-reservations-sync` |
| `PAYFAST_MERCHANT_ID` / `_KEY` / `_PASSPHRASE` | PayFast payments | `payfast-api` |
| `ADDPAY_*` (6 secrets) | AddPay payments | Payment system |
| `PAYGATE_ID` / `_ENCRYPTION_KEY` | PayGate payments | `paygate-api` |
| `RESEND_API_KEY` | Email delivery | All `send-*` functions |
| `GOOGLE_MAPS_API_KEY` | Geocoding + maps | `geocode-property`, frontend |
| `GOOGLE_RECAPTCHA_SECRET_KEY` | Bot protection | Form validation |
| `TRIPADVISOR_API_KEY` | Review fetching | `tripadvisor-api` |
| `FIRECRAWL_API_KEY` | Web scraping | `ai-website-sync` |
| `LOVABLE_API_KEY` | Lovable AI models | AI edge functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB operations | Edge functions |

---

*Generated: 2026-03-08 | RoomsOnline System v2026.01.08*
