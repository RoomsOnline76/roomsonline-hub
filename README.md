# RoomsOnline - Unified Booking Engine

//resync push 20251208 1730

## Project Overview

RoomsOnline is a unified booking engine for vacation rentals, hotels, and B&Bs that integrates with multiple Property Management Systems (PMS). The platform provides centralized management of properties, rates, availability, and bookings across different external systems.

---

## Technology Stack

### Frontend

- **Framework**: React 18.3.1 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom design system (pink/magenta primary theme)
- **UI Components**: shadcn/ui (Radix UI primitives)
- **State Management**: TanStack React Query v5
- **Routing**: React Router DOM v6
- **Form Handling**: React Hook Form with Zod validation
- **Charts**: Recharts
- **Maps**: Google Maps API integration
- **Animations**: Framer Motion (via Tailwind CSS Animate)

### Backend (Lovable Cloud / Supabase)

- **Database**: PostgreSQL
- **Authentication**: Supabase Auth
- **Serverless Functions**: Deno Edge Functions
- **File Storage**: Supabase Storage (3 buckets: property-images, addon-images, package-images)
- **Real-time**: Supabase Realtime (available but not currently implemented)

### External Integrations

- **Property Management Systems**: NightsBridge, Checkfront, Semper, Benson, SiteMinder
- **Additional Services**: Google Maps, SendGrid (email)

---

## Database Schema

### Tables

#### 1. `profiles`

Stores user profile information linked to Supabase Auth.

| Column     | Type        | Nullable | Default | Description                        |
| ---------- | ----------- | -------- | ------- | ---------------------------------- |
| id         | uuid        | No       | -       | Primary key, references auth.users |
| email      | text        | No       | -       | User email address                 |
| full_name  | text        | Yes      | -       | Display name                       |
| phone      | text        | Yes      | -       | Contact phone                      |
| role       | text        | Yes      | 'user'  | Legacy role field                  |
| avatar_url | text        | Yes      | -       | Profile picture URL                |
| created_at | timestamptz | Yes      | now()   | -                                  |
| updated_at | timestamptz | Yes      | now()   | -                                  |

**RLS Policies**:

- Users can view/update/insert their own profile
- Admins can view all profiles and delete profiles

#### 2. `user_roles`

Role-based access control using enum `app_role` ('admin', 'user').

| Column  | Type     | Nullable | Default           | Description           |
| ------- | -------- | -------- | ----------------- | --------------------- |
| id      | uuid     | No       | gen_random_uuid() | Primary key           |
| user_id | uuid     | No       | -                 | References auth.users |
| role    | app_role | No       | -                 | 'admin' or 'user'     |

**RLS Policies**:

- Users can view their own roles
- Admins can manage all roles

#### 3. `properties`

Core property information for all managed properties.

| Column          | Type        | Nullable | Default           | Description                                         |
| --------------- | ----------- | -------- | ----------------- | --------------------------------------------------- |
| id              | uuid        | No       | gen_random_uuid() | Primary key                                         |
| name            | text        | No       | -                 | Property name                                       |
| description     | text        | Yes      | -                 | Property description                                |
| property_type   | text        | No       | -                 | Type classification                                 |
| address         | text        | No       | -                 | Street address                                      |
| city            | text        | No       | -                 | City                                                |
| country         | text        | No       | -                 | Country                                             |
| latitude        | numeric     | Yes      | -                 | GPS coordinate                                      |
| longitude       | numeric     | Yes      | -                 | GPS coordinate                                      |
| max_guests      | integer     | No       | 2                 | Maximum guest capacity                              |
| bedrooms        | integer     | Yes      | 1                 | Number of bedrooms                                  |
| bathrooms       | integer     | Yes      | 1                 | Number of bathrooms                                 |
| price_per_night | numeric     | No       | -                 | Base price                                          |
| images          | jsonb       | Yes      | '[]'              | Array of image URLs                                 |
| amenities       | jsonb       | Yes      | '[]'              | Nested object containing all property configuration |
| is_active       | boolean     | Yes      | true              | Active/deleted status                               |
| owner_name      | text        | Yes      | -                 | Property owner name                                 |
| owner_email     | text        | Yes      | -                 | Links to profiles.email for ownership               |
| external_id     | text        | Yes      | -                 | ID in external PMS                                  |
| external_system | text        | Yes      | -                 | PMS system name                                     |
| property_url    | text        | Yes      | -                 | External booking URL                                |
| created_at      | timestamptz | Yes      | now()             | -                                                   |
| updated_at      | timestamptz | Yes      | now()             | -                                                   |

**RLS Policies**:

- Admins: Full CRUD access
- Owners: Can view/update properties where owner_email matches their profile email
- Public: Can view active properties (unauthenticated)

**amenities JSONB Structure**:

```json
{
  "offerings": {
    "accommodation": boolean,
    "venue": boolean,
    "eventWedding": boolean,
    "conference": boolean
  },
  "pms_system": "nightsbridge" | "checkfront" | "semper" | "benson" | "siteminder" | null,
  "nightsbridge_bbid": string,
  "semper_property_id": string,
  "semper_supplier_id": string,
  "semper_channel_id": string,
  "checkfront_property_id": string,
  "benson_property_id": string,
  "siteminder_property_id": string,
  "meal_types": string[],
  "house_rules": {...},
  "house_style": {...},
  "rooms": [...],
  "rate_breakdown": {...},
  "addons": [...],
  "packages": [...],
  "announcements": [...],
  "templates": {...},
  "banking_details": {...}
}
```

#### 4. `property_rates`

Stores rate information synchronized from external PMS.

| Column           | Type        | Nullable | Default           | Description           |
| ---------------- | ----------- | -------- | ----------------- | --------------------- |
| id               | uuid        | No       | gen_random_uuid() | Primary key           |
| property_id      | uuid        | No       | -                 | FK to properties      |
| date             | date        | No       | -                 | Rate date             |
| room_type        | text        | No       | -                 | Room type identifier  |
| rate_type        | text        | No       | -                 | Rate category         |
| meal_type        | text        | Yes      | -                 | Meal plan type        |
| amount           | numeric     | No       | -                 | Rate amount           |
| currency         | text        | Yes      | 'ZAR'             | Currency code         |
| external_system  | text        | No       | -                 | Source PMS            |
| external_rate_id | text        | Yes      | -                 | ID in external system |
| created_at       | timestamptz | Yes      | now()             | -                     |
| updated_at       | timestamptz | Yes      | now()             | -                     |

**RLS Policies**:

- Anyone can view rates for active properties
- Admins can manage all rates

#### 5. `property_availability`

Stores availability and restrictions synchronized from external PMS.

| Column            | Type        | Nullable | Default           | Description          |
| ----------------- | ----------- | -------- | ----------------- | -------------------- |
| id                | uuid        | No       | gen_random_uuid() | Primary key          |
| property_id       | uuid        | No       | -                 | FK to properties     |
| date              | date        | No       | -                 | Availability date    |
| room_type         | text        | No       | -                 | Room type identifier |
| available_units   | integer     | No       | 0                 | Units available      |
| is_stop_sell      | boolean     | Yes      | false             | Stop sell flag       |
| minimum_stay      | integer     | Yes      | -                 | Min nights required  |
| maximum_stay      | integer     | Yes      | -                 | Max nights allowed   |
| lead_days_advance | integer     | Yes      | -                 | Advance booking days |
| lead_days_post    | integer     | Yes      | -                 | Post booking days    |
| external_system   | text        | No       | -                 | Source PMS           |
| created_at        | timestamptz | Yes      | now()             | -                    |
| updated_at        | timestamptz | Yes      | now()             | -                    |

**RLS Policies**:

- Anyone can view availability for active properties
- Admins can manage all availability

#### 6. `bookings`

Stores reservation information.

| Column            | Type        | Nullable | Default           | Description             |
| ----------------- | ----------- | -------- | ----------------- | ----------------------- |
| id                | uuid        | No       | gen_random_uuid() | Primary key             |
| property_id       | uuid        | No       | -                 | FK to properties        |
| user_id           | uuid        | No       | -                 | FK to profiles (booker) |
| check_in_date     | date        | No       | -                 | Arrival date            |
| check_out_date    | date        | No       | -                 | Departure date          |
| guest_name        | text        | No       | -                 | Guest name              |
| guest_email       | text        | No       | -                 | Guest email             |
| guest_phone       | text        | Yes      | -                 | Guest phone             |
| adults            | integer     | No       | 1                 | Adult count             |
| children          | integer     | Yes      | 0                 | Child count             |
| infants           | integer     | Yes      | 0                 | Infant count            |
| total_price       | numeric     | No       | -                 | Total booking price     |
| status            | text        | No       | 'pending'         | Booking status          |
| special_requests  | text        | Yes      | -                 | Guest notes             |
| payment_intent_id | text        | Yes      | -                 | Payment reference       |
| created_at        | timestamptz | Yes      | now()             | -                       |
| updated_at        | timestamptz | Yes      | now()             | -                       |

**RLS Policies**:

- Users can view/create/update their own bookings
- No delete policy (bookings are status-changed, not deleted)

#### 7. `booking_sync_status`

Tracks synchronization status of bookings to external PMS.

| Column              | Type        | Nullable | Default           | Description            |
| ------------------- | ----------- | -------- | ----------------- | ---------------------- |
| id                  | uuid        | No       | gen_random_uuid() | Primary key            |
| booking_id          | uuid        | No       | -                 | FK to bookings         |
| external_system     | text        | No       | -                 | Target PMS             |
| sync_status         | text        | No       | 'pending'         | pending/success/failed |
| external_booking_id | text        | Yes      | -                 | ID in external system  |
| sync_attempts       | integer     | Yes      | 0                 | Retry count            |
| last_sync_at        | timestamptz | Yes      | -                 | Last attempt timestamp |
| error_message       | text        | Yes      | -                 | Error details          |
| created_at          | timestamptz | Yes      | now()             | -                      |
| updated_at          | timestamptz | Yes      | now()             | -                      |

**RLS Policies**:

- Admins can view all sync status
- Users can view sync status for their own bookings
- System can insert/update (for edge functions)

#### 8. `sync_logs`

Audit log for all synchronization operations.

| Column          | Type        | Nullable | Default           | Description                |
| --------------- | ----------- | -------- | ----------------- | -------------------------- |
| id              | uuid        | No       | gen_random_uuid() | Primary key                |
| property_id     | uuid        | Yes      | -                 | FK to properties           |
| booking_id      | uuid        | Yes      | -                 | FK to bookings             |
| sync_type       | text        | No       | -                 | rates/availability/booking |
| external_system | text        | No       | -                 | PMS system                 |
| status          | text        | No       | -                 | success/error              |
| message         | text        | Yes      | -                 | Status message             |
| request_data    | jsonb       | Yes      | -                 | Outgoing payload           |
| response_data   | jsonb       | Yes      | -                 | Incoming response          |
| created_at      | timestamptz | Yes      | now()             | -                          |

**RLS Policies**:

- Admins can view all logs
- System can insert logs

#### 9. `api_keys`

Stores API key configuration for external integrations.

| Column      | Type        | Nullable | Default           | Description               |
| ----------- | ----------- | -------- | ----------------- | ------------------------- |
| id          | uuid        | No       | gen_random_uuid() | Primary key               |
| key_name    | text        | No       | -                 | Environment variable name |
| name        | text        | No       | -                 | Display name              |
| key_value   | text        | Yes      | -                 | Actual API key value      |
| system_type | text        | Yes      | -                 | PMS/service identifier    |
| is_required | boolean     | Yes      | false             | Required flag             |
| description | text        | Yes      | -                 | Help text                 |
| created_at  | timestamptz | Yes      | now()             | -                         |
| updated_at  | timestamptz | Yes      | now()             | -                         |

**Current API Keys**:
| key_name | system_type | Category |
|----------|-------------|----------|
| NIGHTSBRIDGE_API_KEY | nightsbridge | PMS |
| CHECKFRONT_API_KEY | checkfront | PMS |
| SEMPER_API_KEY | semper | PMS |
| BENSON_API_KEY | benson | PMS |
| SITEMINDER_API_KEY | siteminder | PMS |
| GOOGLE_MAPS_API_KEY | google | Additional Service |
| SENDGRID_API_KEY | sendgrid | Additional Service |

**RLS Policies**:

- Admins only: Full CRUD access

#### 10. `meal_type_suggestions`

Global suggestions for meal types across all properties.

| Column     | Type        | Nullable | Default           | Description    |
| ---------- | ----------- | -------- | ----------------- | -------------- |
| id         | uuid        | No       | gen_random_uuid() | Primary key    |
| name       | text        | No       | -                 | Meal type name |
| created_at | timestamptz | No       | now()             | -              |

**RLS Policies**:

- Anyone can view suggestions
- Authenticated users can insert new suggestions

---

## Database Functions

### `has_role(_user_id uuid, _role app_role)`

Checks if a user has a specific role. Used in RLS policies.

### `get_user_profile(user_id uuid)`

Returns profile information for a user.

### `handle_new_user()`

Trigger function that creates a profile when a new auth user is created.

### `update_updated_at_column()`

Trigger function to auto-update `updated_at` timestamps.

---

## Edge Functions

### 1. `sync-rates-availability`

**Purpose**: Pull rates and availability from external PMS into local database.

**Endpoint**: `POST /functions/v1/sync-rates-availability`

**Request Body**:

```json
{
  "property_id": "uuid",
  "external_system": "nightsbridge" | "checkfront",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD"
}
```

**Process**:

1. Validates input using Zod schema
2. Fetches property details from database
3. Retrieves API key from environment variables
4. Calls external PMS API based on `external_system`
5. Transforms response to internal format
6. Upserts rates to `property_rates` table
7. Upserts availability to `property_availability` table
8. Logs operation to `sync_logs` table

**External API Endpoints** (placeholder - needs actual implementation):

- NightsBridge: `https://api.nightsbridge.com/v1/rates`
- Checkfront: `https://api.checkfront.com/v3/booking/rates`

**Environment Variables Required**:

- `NIGHTSBRIDGE_API_KEY`
- `CHECKFRONT_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 2. `push-booking`

**Purpose**: Push new bookings to external PMS.

**Endpoint**: `POST /functions/v1/push-booking`

**Request Body**:

```json
{
  "booking_id": "uuid"
}
```

**Process**:

1. Validates booking_id
2. Fetches booking with property details
3. Iterates through configured external systems
4. Transforms booking to PMS-specific format
5. POSTs to external PMS API
6. Updates `booking_sync_status` table
7. Logs operation to `sync_logs` table

**External API Endpoints** (placeholder - needs actual implementation):

- NightsBridge: `https://api.nightsbridge.com/v1/bookings`
- Checkfront: `https://api.checkfront.com/v3/booking`

### 3. `create-user`

**Purpose**: Admin function to create new users with roles.

**Endpoint**: `POST /functions/v1/create-user`

**Request Body**:

```json
{
  "email": "string",
  "full_name": "string",
  "role": "admin" | "user"
}
```

**Process**:

1. Authenticates requesting user
2. Verifies admin role
3. Creates or retrieves user in Supabase Auth
4. Upserts profile in `profiles` table
5. Upserts role in `user_roles` table

### 4. `reset-user-password`

**Purpose**: Send password reset email to user.

**Endpoint**: `POST /functions/v1/reset-user-password`

**Request Body**:

```json
{
  "email": "string"
}
```

---

## Storage Buckets

| Bucket Name     | Public | Purpose                 |
| --------------- | ------ | ----------------------- |
| property-images | Yes    | Property gallery images |
| addon-images    | Yes    | Addon product images    |
| package-images  | Yes    | Package product images  |

---

## UI Pages & Components

### Public Pages

#### Home (`/`)

- Hero section with search form
- Search fields: Location, Check-in/Check-out dates, Guests, Property type
- Featured properties display
- Navigation to results

#### Results (`/results`)

- Property search results grid
- Filters: Price range, Amenities, Property type
- Property cards with images, pricing, ratings
- Map view integration

#### Auth (`/auth`)

- Login/Register forms
- Password recovery
- Social auth (if configured)

### Protected Pages (Requires Authentication)

#### Admin Home (`/admin`)

- Dashboard overview
- Quick action cards (removed - now in navbar)
- Property statistics

#### Property Overview (`/admin/property-overview`)

- **Active Properties Tab**: List of active properties with:
  - Property name, type, location
  - Owner information
  - External system connection status
  - Edit/Delete actions
- **Deleted Properties Tab**: Soft-deleted properties with restore option
- **Add New Property** button

#### Property Form (`/admin/property/new`, `/admin/property/:id`)

Multi-tab form with unsaved changes protection:

1. **General Tab**:
   - Property name, type, description
   - Owner selection (dropdown from profiles)
   - Address, city, country
   - GPS coordinates with Google Maps picker

2. **Offerings Tab**:
   - Accommodation, Venue, Event/Wedding, Conference toggles
   - Business logic: Venue auto-enables with Event/Wedding or Conference
   - PMS System dropdown (single selection)
   - PMS-specific fields:
     - NightsBridge: BBID
     - Semper: Property ID, Supplier ID, Channel ID
     - Checkfront: Property ID
     - Benson: Property ID
     - SiteMinder: Property ID

3. **House Style Tab**:
   - Visual theming options
   - Color schemes
   - Branding elements

4. **Property Info & Facilities Tab**:
   - Detailed amenities
   - Facilities checklist
   - Room counts, capacity

5. **House Rules Tab**:
   - Check-in/Check-out times
   - Pet policy
   - Smoking policy
   - Cancellation policy

6. **Property Images Tab**:
   - Image upload to Supabase Storage
   - Gallery management
   - Image reordering

7. **Room Information Tab**:
   - Room type definitions
   - Room URLs linking
   - Capacity per room type
   - Room amenities

8. **Rate Breakdown Tab**:
   - Rate types configuration
   - Meal type associations (from TagInput)
   - Seasonal pricing rules
   - Links to rooms from Room Information

9. **Addons Tab**:
   - Additional purchasable items
   - Image upload
   - Pricing

10. **Packages Tab**:
    - Bundled offerings
    - Package pricing
    - Included items

11. **Announcements Tab**:
    - Property announcements
    - Modal dialog management

12. **Templates & Notifications Tab**:
    - Email templates
    - Notification settings

13. **Banking Details Tab**:
    - VAT number (with toggle)
    - Banking information for invoicing

#### Calendar Pages

Three calendar views for different offering types:

- `/admin/calendar/accommodation`
- `/admin/calendar/event-wedding`
- `/admin/calendar/conference`

**Features**:

- Property selector (filtered by role)
- Date range picker (week/month view)
- Room type filter
- Display options checkboxes:
  - Stop Sell rows
  - Rates rows
  - Lead Days Advance/Post rows
  - Min/Max Stay rows

**Grid Structure**:

- Columns: Dates (with South African public holiday highlighting)
- Rows per room type:
  - Stop Sell status
  - Lead Days Advance
  - Lead Days Post
  - Minimum Stay
  - Maximum Stay
  - Rate types × Meal types (from property configuration)

**Bulk Update Dialogs**:

- Bulk Rate Rule Dialog
- Bulk Availability Dialog
- Bulk Stop Sell Dialog
- Bulk Minimum Stay Dialog
- Bulk Maximum Stay Dialog
- Bulk Lead Days Advance Dialog
- Bulk Lead Days Post Dialog

#### Promotion Pages

- `/admin/promotion/accommodation`
- `/admin/promotion/event-wedding`
- `/admin/promotion/conference`

**Features**:

- Property filter
- Date range selection
- Promotion management
- Add Promotions functionality

#### Bookings Pages

- `/admin/bookings/accommodation`
- `/admin/bookings/event-wedding`
- `/admin/bookings/conference`

**Features**:

- Property filter
- Booking overview grid
- Status management
- Sync status display

#### Dashboard/Reports (`/dashboard`)

- `/dashboard/reports/accommodation`
- `/dashboard/reports/venue`

**Features**:

- Revenue reports
- Occupancy statistics
- Booking analytics
- Charts and visualizations

#### User Management (`/admin/users`)

Admin-only page for user administration.

**Features**:

- User list with roles
- Admin/Owner count display
- Add Admin button (modal)
- Add Property Owner button (modal)
- Role change with confirmation
- Reset Password functionality
- Delete user

#### API Keys (`/admin/keys`)

Admin-only page for API configuration.

**Sections**:

1. **Property Management Systems**:
   - NightsBridge
   - Semper
   - Checkfront
   - Benson
   - SiteMinder
     (Sorted alphabetically)

2. **Additional Services**:
   - Google Maps
   - SendGrid

**Features**:

- Key status indicators (configured/not configured)
- Edit key values
- Required key tracking

---

## Authentication & Authorization

### Roles

- **Admin**: Full access to all features
- **User/Owner**: Limited access based on property ownership

### Role-Based Access Control

| Feature           | Admin          | Owner                 |
| ----------------- | -------------- | --------------------- |
| Property Overview | All properties | Own properties only   |
| Property Edit     | All properties | Own properties only   |
| Calendar          | All properties | Own properties only   |
| Bookings          | All bookings   | Own property bookings |
| Promotions        | All            | Own properties only   |
| Reports           | All            | Own properties only   |
| User Management   | ✓              | ✗                     |
| API Keys          | ✓              | ✗                     |
| Business Settings | ✓              | ✗                     |

### Property Ownership

Properties are linked to owners via `owner_email` matching `profiles.email`. This enables:

- Dropdown filtering in property selectors
- RLS policy enforcement
- Owner-specific views

---

## External PMS Integration Status

### Current Implementation Status

| Feature           | NightsBridge | Checkfront  | Semper    | Benson | SiteMinder |
| ----------------- | ------------ | ----------- | --------- | ------ | ---------- |
| API Key Storage   | ✓            | ✓           | ✓         | ✓      | ✓          |
| Property Linking  | ✓ (BBID)     | ✓           | ✓ (3 IDs) | ✓      | ✓          |
| Pull Rates        | Placeholder  | Placeholder | ✗         | ✗      | ✗          |
| Pull Availability | Placeholder  | Placeholder | ✗         | ✗      | ✗          |
| Push Bookings     | Placeholder  | Placeholder | ✗         | ✗      | ✗          |
| Webhook Receiver  | ✗            | ✗           | ✗         | ✗      | ✗          |

### Integration Gap Analysis

#### Required for Full Integration:

1. **API Documentation Required**:
   - NightsBridge API endpoints, authentication, and data formats
   - Checkfront API v3 specifications
   - Semper API documentation
   - Benson API documentation
   - SiteMinder API documentation

2. **Rate Sync Implementation**:
   - Map external rate structures to `property_rates` schema
   - Handle different rate type naming conventions
   - Currency conversion if needed
   - Rate update frequency/scheduling

3. **Availability Sync Implementation**:
   - Map external availability to `property_availability` schema
   - Handle overbooking rules
   - Sync frequency configuration

4. **Booking Push Implementation**:
   - Transform `bookings` to PMS-specific formats
   - Handle booking modifications
   - Handle cancellations
   - Guest data mapping

5. **Webhook Receivers**:
   - Real-time updates from PMS
   - Booking confirmations
   - Rate/availability changes
   - Cancellation notifications

6. **Error Handling**:
   - Retry logic for failed syncs
   - Alert system for persistent failures
   - Manual override capabilities

7. **Testing Requirements**:
   - Sandbox/test environments for each PMS
   - Test API keys
   - Sample data for validation

---

## Environment Variables

### Frontend (.env)

```
VITE_SUPABASE_URL=https://qmprswbgkpzcvexmmcbf.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_SUPABASE_PROJECT_ID=qmprswbgkpzcvexmmcbf
```

### Edge Functions (Supabase Secrets)

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
SUPABASE_PUBLISHABLE_KEY
GOOGLE_MAPS_API_KEY
ROOMSONLINE_DB_KEY
starshipcaptain (legacy)
```

### Required for PMS Integration (to be added):

```
NIGHTSBRIDGE_API_KEY
CHECKFRONT_API_KEY
SEMPER_API_KEY
BENSON_API_KEY
SITEMINDER_API_KEY
SENDGRID_API_KEY
```

---

## Hooks & Utilities

### Custom Hooks

#### `useAuth`

Authentication state management including:

- Current user
- User role
- Login/logout functions
- Profile data

#### `useExternalSync`

External system synchronization utilities:

- `syncRatesAndAvailability(propertyId, externalSystem, startDate, endDate)`
- `pushBooking(bookingId)`
- `getSyncStatus(bookingId)`
- `getSyncLogs(propertyId?, bookingId?, limit?)`

### Utility Functions

#### `src/lib/utils.ts`

- `cn()`: Tailwind class merging utility

---

## File Structure

```
├── src/
│   ├── assets/                 # Static assets
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── AddUserModal.tsx
│   │   ├── Bulk*Dialog.tsx     # Calendar bulk update dialogs
│   │   ├── ChangePasswordModal.tsx
│   │   ├── Navbar.tsx
│   │   ├── ProfileModal.tsx
│   │   ├── PropertyMap.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── SearchForm.tsx
│   │   ├── StarRating.tsx
│   │   └── TagInput.tsx
│   ├── config/
│   │   └── ui_schema.json      # Form configuration
│   ├── hooks/
│   │   ├── useAuth.tsx
│   │   ├── useExternalSync.tsx
│   │   └── use-mobile.tsx
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts       # Auto-generated
│   │       └── types.ts        # Auto-generated
│   ├── pages/
│   │   ├── Admin.tsx
│   │   ├── AdminKeys.tsx
│   │   ├── AdminUsers.tsx
│   │   ├── Auth.tsx
│   │   ├── Bookings.tsx
│   │   ├── Calendar.tsx
│   │   ├── Calendar*.tsx       # Sub-type calendars
│   │   ├── Dashboard.tsx
│   │   ├── Home.tsx
│   │   ├── NotFound.tsx
│   │   ├── Promotion.tsx
│   │   ├── PropertyForm.tsx
│   │   ├── PropertyOverview.tsx
│   │   └── Results.tsx
│   ├── App.tsx
│   ├── App.css
│   ├── index.css               # Design system tokens
│   └── main.tsx
├── supabase/
│   ├── config.toml             # Supabase configuration
│   └── functions/
│       ├── create-user/
│       ├── push-booking/
│       ├── reset-user-password/
│       └── sync-rates-availability/
├── public/
├── tailwind.config.ts
├── vite.config.ts
└── package.json
```

---

## Development

### Prerequisites

- Node.js & npm (recommend using nvm)

### Setup

```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm install
npm run dev
```

### Building

```sh
npm run build
```

### Deployment

Deploy via Lovable: Share → Publish

---

## API Access

### Supabase Client (Internal)

```typescript
import { supabase } from "@/integrations/supabase/client";
```

### REST API (External)

Base URL: `https://qmprswbgkpzcvexmmcbf.supabase.co/rest/v1/`

Headers required:

```
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
```

### Edge Functions (External)

Base URL: `https://qmprswbgkpzcvexmmcbf.supabase.co/functions/v1/`

---

## Security Considerations

1. **Row Level Security (RLS)**: All tables have RLS enabled with appropriate policies
2. **API Keys**: Stored in database with admin-only access; actual secrets in Supabase environment
3. **Authentication**: Supabase Auth with email confirmation
4. **Role-based Access**: Enforced at both RLS and application level
5. **Storage**: Public buckets for images (consider signed URLs for sensitive content)

---

## Known Limitations

1. Edge function PMS integrations use placeholder API endpoints
2. No real-time sync - requires manual trigger or scheduled jobs
3. No webhook receivers for PMS callbacks
4. Single PMS per property (by design)
5. No payment processing integration yet
6. Email templates not connected to SendGrid

---

## Roadmap for PMS Integration

1. Obtain API documentation and test credentials for each PMS
2. Implement actual API calls in edge functions
3. Create webhook receivers for real-time updates
4. Add scheduled sync jobs
5. Implement comprehensive error handling and alerting
6. Add sync status dashboard for monitoring
7. Implement booking modification and cancellation flows
