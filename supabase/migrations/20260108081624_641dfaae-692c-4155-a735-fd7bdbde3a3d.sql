-- Create impact level enum
CREATE TYPE public.help_impact_level AS ENUM ('critical', 'warning', 'info');

-- Create help_articles table
CREATE TABLE public.help_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  section text NOT NULL,
  content_markdown text NOT NULL,
  role_target text[] NOT NULL DEFAULT ARRAY['all'],
  sort_order integer DEFAULT 0,
  related_table text,
  related_field text,
  impact_level public.help_impact_level DEFAULT 'info',
  is_published boolean DEFAULT true,
  view_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_help_articles_section ON public.help_articles(section);
CREATE INDEX idx_help_articles_role_target ON public.help_articles USING gin(role_target);
CREATE INDEX idx_help_articles_related ON public.help_articles(related_table, related_field);
CREATE INDEX idx_help_articles_published ON public.help_articles(is_published) WHERE is_published = true;

-- Create user help views table for tracking
CREATE TABLE public.user_help_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  article_id uuid REFERENCES public.help_articles(id) ON DELETE CASCADE,
  viewed_at timestamptz DEFAULT now(),
  was_helpful boolean,
  UNIQUE(user_id, article_id)
);

-- Enable RLS
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_help_views ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's role for help access
CREATE OR REPLACE FUNCTION public.get_user_help_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'dev') THEN 'dev'
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'admin') THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'user') THEN 'user'
    ELSE NULL
  END;
$$;

-- Users can read articles matching their role or 'all'
CREATE POLICY "Users can read matching help articles"
  ON public.help_articles FOR SELECT
  TO authenticated
  USING (
    is_published = true AND (
      'all' = ANY(role_target) OR
      get_user_help_role(auth.uid()) = ANY(role_target) OR
      -- Dev users can see admin content too
      (get_user_help_role(auth.uid()) = 'dev' AND 'admin' = ANY(role_target))
    )
  );

-- Only admins/devs can manage articles
CREATE POLICY "Admins can insert help articles"
  ON public.help_articles FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Admins can update help articles"
  ON public.help_articles FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Admins can delete help articles"
  ON public.help_articles FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

-- User help views - users can manage their own
CREATE POLICY "Users can view own help views"
  ON public.user_help_views FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own help views"
  ON public.user_help_views FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own help views"
  ON public.user_help_views FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_help_articles_updated_at
  BEFORE UPDATE ON public.help_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- SEED DATA: Owner Articles (role_target: ['user'])

-- Getting Started Section
INSERT INTO public.help_articles (title, slug, section, content_markdown, role_target, sort_order, impact_level) VALUES
('How Your Property Appears to Guests', 'property-appearance', 'getting_started', 
'## What This Setting Controls

Your property listing is the first impression guests have of your accommodation. It includes your property name, images, description, and key details like location and amenities.

## What Guests Will See

When potential guests browse RoomsOnline, they see:
- Your property photos in a beautiful gallery
- Your property name and location
- A brief description highlighting what makes your place special
- Starting prices and availability indicators

## Important Things to Know

✅ **Good photos matter** - Properties with high-quality images get significantly more bookings.

✅ **Keep descriptions accurate** - Set realistic expectations to avoid negative reviews.

⚠️ **Changes appear immediately** - Any updates you make will be visible to guests right away.

## Who Controls This? (ROL vs Your PMS)

If you use a Property Management System (PMS), some information like room names and base pricing may sync from there. Editorial content like descriptions and photos are managed directly in RoomsOnline.',
ARRAY['user'], 1, 'info'),

('Understanding Property Showcase vs Booking Page', 'showcase-vs-booking', 'getting_started',
'## What This Setting Controls

Your property has two main pages guests can visit:
1. **Property Showcase** - A beautiful presentation of your property
2. **Booking Page** - Where guests select dates and complete reservations

## What Guests Will See

**On the Showcase Page:**
- Full photo galleries
- Detailed descriptions
- Amenity lists
- Location maps
- Guest reviews

**On the Booking Page:**
- Available room types
- Real-time pricing
- Date selection calendar
- Guest count options
- Payment forms

## Important Things to Know

The Showcase page is designed to inspire and inform. The Booking page is designed for action.

:::info
Tip: Make sure your showcase content tells your story, while your booking page makes it easy to complete a reservation.
:::

## Who Controls This? (ROL vs Your PMS)

- **Showcase content**: You control this in RoomsOnline
- **Booking availability**: Synced from your PMS (if connected) or managed in ROL',
ARRAY['user'], 2, 'info');

-- Booking Categories Section
INSERT INTO public.help_articles (title, slug, section, content_markdown, role_target, sort_order, related_table, related_field, impact_level) VALUES
('What Are Booking Categories?', 'booking-categories-explained', 'booking_categories',
'## What This Setting Controls

Booking categories determine what type of bookings your property accepts:

- **Accommodation** - Standard room/property bookings with check-in/check-out dates
- **Conference** - Meeting rooms and event spaces booked by time slots
- **Event/Wedding** - Large venue bookings for special occasions

## What Guests Will See

Each category provides a different booking experience:

| Category | Date Selection | Guest Count | Typical Use |
|----------|---------------|-------------|-------------|
| Accommodation | Check-in/out dates | Per room | Hotels, B&Bs, vacation rentals |
| Conference | Date + time slots | Attendees | Business meetings, workshops |
| Event/Wedding | Event date | Total guests | Weddings, parties, celebrations |

## Important Things to Know

:::critical
⚠️ **Critical Warning**: Your booking category affects which booking widget appears on your page. Changing this incorrectly can make your property unbookable.
:::

Most properties should use **Accommodation**. Only change this if you specifically offer conference or event spaces.

## Who Controls This? (ROL vs Your PMS)

This setting is managed in RoomsOnline and affects how your property integrates with booking systems.',
ARRAY['user'], 1, 'properties', 'property_type', 'critical'),

('Changing Categories Can Break Bookings', 'category-change-warning', 'booking_categories',
'## What This Setting Controls

When you change your property''s booking category, you change the entire booking flow for guests.

## What Guests Will See

If you change from Accommodation to Conference:
- The room/night booking calendar disappears
- Time-slot booking appears instead
- Existing availability data may not display correctly

## Important Things to Know

:::critical
⚠️ **Do Not Change Categories Unless You Are Certain**

Changing your booking category:
1. May hide your current availability from guests
2. Could cause booking errors
3. Requires reconfiguration of your availability calendar
4. May break PMS synchronization
:::

**Before changing categories, contact ROL support** to ensure your property is properly configured for the new booking type.

## Who Controls This? (ROL vs Your PMS)

This is a ROL-level setting that affects how your PMS data is interpreted and displayed.',
ARRAY['user'], 2, 'properties', 'property_type', 'critical');

-- Availability & Pricing Section
INSERT INTO public.help_articles (title, slug, section, content_markdown, role_target, sort_order, impact_level) VALUES
('Who Controls Your Availability?', 'availability-control', 'availability_pricing',
'## What This Setting Controls

Availability determines which dates and room types are bookable by guests.

## What Guests Will See

Guests see a calendar showing:
- ✅ Available dates (bookable)
- ❌ Unavailable dates (blocked or sold out)
- 💰 Prices for each available date

## Important Things to Know

**If you have a PMS connected:**
Your PMS is the "source of truth" for availability. ROL syncs this data regularly but does not control it.

:::warning
You cannot manually override availability in ROL when connected to a PMS. All changes must be made in your PMS.
:::

**If you manage availability directly in ROL:**
You have full control over which dates are available and at what prices.

## Who Controls This? (ROL vs Your PMS)

| Scenario | Who Controls Availability |
|----------|--------------------------|
| PMS Connected | Your PMS (ROL displays it) |
| ROL-Native Property | You, directly in ROL |
| Hybrid Setup | Varies by room type |',
ARRAY['user'], 1, 'warning'),

('Why Some Fields Are Locked', 'locked-fields-explained', 'availability_pricing',
'## What This Setting Controls

Certain fields in your property dashboard may appear grayed out or locked. This is intentional.

## What Guests Will See

Guests are not affected by locked fields - they simply ensure data consistency between systems.

## Important Things to Know

Fields are locked when:

1. **Data comes from your PMS** - Room names, base prices, and availability sync from your property management system
2. **ROL manages it automatically** - Some calculations like total revenue are computed
3. **It requires admin access** - Certain settings can only be changed by ROL support

:::info
If you need to change a locked field, check if it can be updated in your PMS first. Changes there will sync to ROL.
:::

## Who Controls This? (ROL vs Your PMS)

Locked fields indicate the data authority lies elsewhere - usually in your PMS or with ROL system settings.',
ARRAY['user'], 2, 'info');

-- Troubleshooting Section
INSERT INTO public.help_articles (title, slug, section, content_markdown, role_target, sort_order, impact_level) VALUES
('Why Bookings Can Fail', 'booking-failures', 'troubleshooting',
'## What This Setting Controls

Understanding why a booking might fail helps you prevent lost revenue and guest frustration.

## What Guests Will See

If a booking fails, guests typically see a message like:
- "This room is no longer available for your selected dates"
- "Unable to complete booking - please try again"
- "The price has changed - please review"

## Important Things to Know

**Common reasons bookings fail:**

1. **Live availability check** - ROL verifies availability with your PMS in real-time. If someone else booked the room while your guest was checking out, the booking fails.

2. **Price changes** - If rates updated between when the guest started and finished booking

3. **Minimum stay not met** - Guest selected fewer nights than your minimum requirement

4. **Payment issues** - Card declined or payment gateway timeout

:::warning
ROL intentionally prevents overbookings. A failed booking is better than a double-booking that requires you to relocate a guest.
:::

## Who Controls This? (ROL vs Your PMS)

Availability verification happens against your PMS in real-time. ROL acts as a safety net to prevent overbookings.',
ARRAY['user'], 1, 'warning'),

('When Availability Looks Right But Isn''t', 'availability-discrepancy', 'troubleshooting',
'## What This Setting Controls

Sometimes the calendar shows a date as available, but bookings still fail. Here''s why.

## What Guests Will See

Guests may see availability on the calendar, click to book, and receive an error during checkout.

## Important Things to Know

**Why this happens:**

1. **Cache timing** - ROL shows cached availability for fast page loads. Real-time checks happen at checkout.

2. **Simultaneous bookings** - Two guests may be trying to book the same room at the same time

3. **PMS sync delay** - Your PMS may have just received a booking that hasn''t synced to ROL yet

4. **Block not yet synced** - You blocked dates in your PMS but the sync hasn''t run

:::info
**This is by design.** ROL uses the "NO_BOOKING_FROM_CACHE" rule - we never confirm a booking without a live availability check. This protects you from overbookings.
:::

## Who Controls This? (ROL vs Your PMS)

The real-time verification always checks your PMS. Cached data is only for display speed.',
ARRAY['user'], 2, 'info');

-- Common Mistakes Section
INSERT INTO public.help_articles (title, slug, section, content_markdown, role_target, sort_order, related_table, related_field, impact_level) VALUES
('Never Remove Navigation Tags', 'navigation-tags-warning', 'common_mistakes',
'## What This Setting Controls

Navigation tags determine how guests find your property when browsing RoomsOnline by location, type, or features.

## What Guests Will See

Tags like "Cape Town", "Boutique Hotel", or "Pet Friendly" help guests filter and discover your property. Without tags, your property may not appear in relevant searches.

## Important Things to Know

:::critical
⚠️ **Removing all navigation tags makes your property nearly invisible**

Without tags, your property:
- Won''t appear in location-based searches
- Won''t show in category filters
- Can only be found via direct link or name search
:::

**Before removing a tag, ask yourself:**
- Will guests still be able to find my property?
- Am I removing a tag because it''s wrong, or just tidying up?

## Who Controls This? (ROL vs Your PMS)

Navigation tags are managed in RoomsOnline and are essential for discoverability.',
ARRAY['user'], 1, 'properties', 'navigation_tags', 'critical'),

('Accidentally Deactivating Your Property', 'deactivation-warning', 'common_mistakes',
'## What This Setting Controls

The "Active" toggle determines whether your property is visible and bookable on RoomsOnline.

## What Guests Will See

If your property is deactivated:
- ❌ Property page shows "Not Available"
- ❌ Property doesn''t appear in search results
- ❌ Direct links show an error message
- ❌ All booking attempts fail

## Important Things to Know

:::warning
⚠️ **Deactivating your property immediately stops all bookings**

This is useful for:
- Seasonal closures
- Major renovations
- Permanently closing

But if done accidentally, you lose revenue until reactivated.
:::

**Before deactivating:**
1. Confirm you want to stop ALL bookings
2. Consider using date-specific blocks instead
3. Check if you have upcoming confirmed bookings

## Who Controls This? (ROL vs Your PMS)

This is a ROL-level setting. Deactivating here stops all ROL bookings regardless of PMS availability.',
ARRAY['user'], 2, 'properties', 'is_active', 'warning');

-- SEED DATA: Admin/Dev Articles (role_target: ['admin', 'dev'])

-- Architecture Section
INSERT INTO public.help_articles (title, slug, section, content_markdown, role_target, sort_order, impact_level) VALUES
('PMS Adapter Pattern Architecture', 'adapter-pattern', 'architecture',
'## Overview

RoomsOnline uses an **Adapter Pattern** to integrate with multiple Property Management Systems (PMS). Each PMS has its own isolated edge function that translates between the PMS API and ROL''s unified data model.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                   ROL Frontend                       │
│              (PMS-Agnostic Components)              │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              Unified Data Model                      │
│    (pms_mappings, pms_room_types_cache, etc.)       │
└─────────────────────┬───────────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ Benson   │ │CloudBeds │ │ Little   │
    │ Adapter  │ │ Adapter  │ │ Hotelier │
    └────┬─────┘ └────┬─────┘ └────┬─────┘
         │            │            │
         ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ Benson   │ │CloudBeds │ │ Little   │
    │   API    │ │   API    │ │Hotelier  │
    └──────────┘ └──────────┘ └──────────┘
```

## Key Principles

1. **Isolation**: Each adapter edge function is independent
2. **Unified Output**: All adapters produce the same data structure
3. **PMS-Agnostic UI**: Frontend components never know which PMS is being used
4. **Fail-Safe**: One PMS failure doesn''t affect others

## Edge Functions

| Function | PMS | Purpose |
|----------|-----|---------|
| `benson-api` | Benson | SA hospitality integration |
| `cloudbeds-api` | CloudBeds | Global PMS |
| `little-hotelier-api` | Little Hotelier | Small property focus |
| `checkfront-api` | Checkfront | Activity/tour bookings |
| `hostfully-api` | Hostfully | Vacation rentals |

## Data Flow

1. Frontend requests availability for property
2. System identifies property''s PMS from `properties.external_system`
3. Appropriate adapter edge function is called
4. Adapter translates PMS response to unified format
5. Data cached in `pms_availability_cache`
6. Frontend displays using generic components',
ARRAY['admin', 'dev'], 1, 'info'),

('The NO_BOOKING_FROM_CACHE Rule', 'no-booking-from-cache', 'architecture',
'## Overview

The **NO_BOOKING_FROM_CACHE** rule is a critical safety mechanism that prevents overbookings by ensuring all booking confirmations are validated against live PMS availability.

## The Rule

:::critical
**NEVER confirm a booking using cached availability data.**

All booking attempts MUST perform a real-time availability check against the PMS before confirmation.
:::

## Why This Exists

```
Timeline Problem:
─────────────────────────────────────────────────────►
     
T0: Cache shows Room 101 available Jan 15
T1: Guest A starts booking Room 101 for Jan 15
T2: Guest B books Room 101 via Booking.com
T3: PMS updates (Room 101 now unavailable)
T4: Guest A clicks "Confirm Booking"

Without NO_BOOKING_FROM_CACHE:
  → Booking confirms using T0 cache = OVERBOOKING ❌

With NO_BOOKING_FROM_CACHE:
  → Real-time check at T4 finds unavailability = Booking fails safely ✅
```

## Implementation

```typescript
// In push-booking edge function
async function confirmBooking(bookingData) {
  // ALWAYS check live availability first
  const liveAvailability = await pmsAdapter.checkAvailability({
    propertyId: bookingData.propertyId,
    roomTypeId: bookingData.roomTypeId,
    checkIn: bookingData.checkIn,
    checkOut: bookingData.checkOut
  });
  
  if (!liveAvailability.available) {
    throw new Error("Room no longer available");
  }
  
  // Only proceed if live check passes
  return await pmsAdapter.createReservation(bookingData);
}
```

## Cache Usage

Cached data IS used for:
- ✅ Displaying availability calendars (fast UX)
- ✅ Showing price estimates
- ✅ Filtering search results

Cached data is NEVER used for:
- ❌ Final booking confirmation
- ❌ Payment authorization
- ❌ Reservation creation',
ARRAY['admin', 'dev'], 2, 'critical');

-- Roles & Permissions Section
INSERT INTO public.help_articles (title, slug, section, content_markdown, role_target, sort_order, impact_level) VALUES
('Role Hierarchy & Capabilities', 'role-hierarchy', 'roles_permissions',
'## Overview

ROL uses a role-based access control (RBAC) system with three primary roles stored in the `user_roles` table.

## Role Hierarchy

```
        ┌─────────┐
        │   Dev   │  (Highest - inherits all)
        └────┬────┘
             │
        ┌────▼────┐
        │  Admin  │  (Full admin access)
        └────┬────┘
             │
        ┌────▼────┐
        │  User   │  (Property owners)
        └─────────┘
```

## Capabilities Matrix

| Capability | User (Owner) | Admin | Dev |
|------------|:------------:|:-----:|:---:|
| View own properties | ✅ | ✅ | ✅ |
| Edit own properties | ✅ | ✅ | ✅ |
| View all properties | ❌ | ✅ | ✅ |
| Edit all properties | ❌ | ✅ | ✅ |
| Manage users | ❌ | ✅ | ✅ |
| View audit logs | ❌ | ✅ | ✅ |
| API key management | ❌ | ✅ | ✅ |
| PMS configuration | ❌ | ✅ | ✅ |
| Dev tools access | ❌ | ❌ | ✅ |
| System configuration | ❌ | ❌ | ✅ |

## Implementation Details

```typescript
// Role check using has_role function
const isAdmin = await supabase.rpc("has_role", {
  _user_id: userId,
  _role: "admin"
});

// Dev role inherits admin access
const hasAdminAccess = userRole === "admin" || userRole === "dev";
```

## Security Notes

:::warning
Roles are stored in `user_roles` table, NOT in the `profiles` table. This prevents privilege escalation through profile updates.
:::

RLS policies use the `has_role()` security definer function to check permissions without exposing the roles table directly.',
ARRAY['admin', 'dev'], 1, 'info'),

('RLS Implementation Patterns', 'rls-patterns', 'roles_permissions',
'## Overview

Row Level Security (RLS) policies control data access at the database level. ROL uses several patterns to implement role-based access.

## Key Patterns

### 1. Security Definer Functions

```sql
-- Avoids recursive RLS checks
CREATE FUNCTION has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER  -- Runs with function owner privileges
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
```

### 2. Role-Based Policies

```sql
-- Admin can see all, users see own
CREATE POLICY "Users see own, admins see all"
ON properties FOR SELECT
USING (
  owner_id = auth.uid() OR
  has_role(auth.uid(), ''admin'') OR
  has_role(auth.uid(), ''dev'')
);
```

### 3. Public Views for Unauthenticated Access

```sql
-- Expose limited data publicly
CREATE VIEW public_properties AS
SELECT id, name, city, price_per_night
FROM properties
WHERE is_active = true;
```

## Common Gotchas

:::warning
1. **Never reference auth.users directly** - Use profiles or security definer functions
2. **Avoid recursive policies** - Use SECURITY DEFINER for role checks
3. **Test as different roles** - RLS behaves differently per user
:::

## Testing RLS

```sql
-- Impersonate a user for testing
SET request.jwt.claims = ''{"sub": "user-uuid-here"}'';
SELECT * FROM properties; -- See what this user sees
```',
ARRAY['admin', 'dev'], 2, 'warning');

-- Data Authority Section
INSERT INTO public.help_articles (title, slug, section, content_markdown, role_target, sort_order, impact_level) VALUES
('PMS as Source of Truth', 'pms-source-of-truth', 'data_authority',
'## Overview

For PMS-connected properties, the Property Management System is the **authoritative source** for:
- Room types and names
- Availability
- Base pricing
- Reservations

## Data Authority Model

```
┌─────────────────────────────────────────────────────┐
│                    DATA AUTHORITY                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  PMS Controls (Source of Truth):                    │
│  ├── Room Types & Inventory                         │
│  ├── Availability Calendar                          │
│  ├── Base Rates & Pricing                          │
│  ├── Reservations & Bookings                       │
│  └── Guest Stay Data                               │
│                                                      │
│  ROL Controls:                                      │
│  ├── Editorial Content (descriptions, photos)      │
│  ├── Navigation Tags & Categorization              │
│  ├── Editorial Ratings                             │
│  ├── Marketing Content                             │
│  └── UI/Display Preferences                        │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Sync Flow

1. **Scheduled Sync**: ROL polls PMS every 15-30 minutes
2. **On-Demand Sync**: Triggered before booking confirmation
3. **Webhook (where supported)**: Real-time updates from PMS

## Conflict Resolution

When data conflicts:
1. **PMS always wins** for operational data
2. **ROL preserves** editorial content
3. **Timestamps determine** freshness

:::critical
Never manually override PMS-synced data in ROL. Changes will be overwritten on next sync.
:::',
ARRAY['admin', 'dev'], 1, 'critical'),

('Sync States & Failure Handling', 'sync-states', 'data_authority',
'## Overview

The sync system tracks the state of data synchronization between ROL and each PMS.

## Sync States

| State | Description | Action Required |
|-------|-------------|-----------------|
| `synced` | Data matches PMS | None |
| `pending` | Sync scheduled | Wait |
| `syncing` | Sync in progress | Wait |
| `failed` | Sync attempt failed | Investigate |
| `stale` | Data older than threshold | Force sync |

## Failure Modes

### 1. Connection Failure
```
PMS API unreachable
→ Retry with exponential backoff
→ Alert after 3 failures
→ Mark property as "sync_failed"
```

### 2. Authentication Failure
```
API credentials invalid/expired
→ Mark credentials as invalid
→ Notify admin
→ Stop sync attempts until fixed
```

### 3. Data Validation Failure
```
PMS returns unexpected format
→ Log raw response
→ Use last known good data
→ Alert dev team
```

## Monitoring

Check `sync_logs` table for:
- Failed sync attempts
- Error messages
- Request/response data

```sql
SELECT * FROM sync_logs
WHERE status = ''error''
ORDER BY created_at DESC
LIMIT 20;
```

## Recovery Procedures

1. **Force re-sync**: Call sync function with `force: true`
2. **Clear cache**: Delete stale `pms_availability_cache` entries
3. **Credential refresh**: Update `pms_credentials` if expired',
ARRAY['admin', 'dev'], 2, 'warning');

-- Booking Flow Section
INSERT INTO public.help_articles (title, slug, section, content_markdown, role_target, sort_order, impact_level) VALUES
('Booking State Machine', 'booking-state-machine', 'booking_flow',
'## Overview

Every booking in ROL follows a defined state machine from initiation to completion (or failure).

## State Diagram

```
┌──────────┐
│  START   │
└────┬─────┘
     │
     ▼
┌──────────┐     ┌──────────────┐
│ PENDING  │────►│   EXPIRED    │ (timeout)
└────┬─────┘     └──────────────┘
     │
     ▼ (availability confirmed)
┌──────────┐     ┌──────────────┐
│ RESERVED │────►│  CANCELLED   │ (user/admin)
└────┬─────┘     └──────────────┘
     │
     ▼ (payment initiated)
┌──────────────┐
│ PAYMENT_PENDING │
└────┬─────────┘
     │
     ├────────────────┐
     ▼                ▼
┌──────────┐    ┌──────────────┐
│CONFIRMED │    │PAYMENT_FAILED│
└────┬─────┘    └──────────────┘
     │
     ▼ (pushed to PMS)
┌──────────────┐
│ PMS_SYNCED   │
└──────────────┘
```

## State Definitions

| State | Description |
|-------|-------------|
| `pending` | Booking initiated, awaiting availability check |
| `reserved` | Availability confirmed, awaiting payment |
| `payment_pending` | Payment in progress |
| `confirmed` | Payment successful |
| `pms_synced` | Pushed to PMS successfully |
| `cancelled` | Booking cancelled |
| `expired` | Timed out before completion |
| `payment_failed` | Payment was declined |

## Timeouts

- **Pending → Expired**: 15 minutes
- **Reserved → Expired**: 30 minutes
- **Payment Pending → Failed**: 5 minutes',
ARRAY['admin', 'dev'], 1, 'info'),

('Partial Success Handling', 'partial-success', 'booking_flow',
'## Overview

A "partial success" occurs when a booking is confirmed and paid but fails to sync to the PMS. This requires manual intervention.

## Scenario

```
1. Guest completes booking ✅
2. Payment processed ✅
3. Booking saved to ROL database ✅
4. Push to PMS fails ❌
   → Property not aware of booking
   → Risk of overbooking
```

## Detection

Check `booking_sync_status` table:

```sql
SELECT b.*, bss.sync_status, bss.error_message
FROM bookings b
JOIN booking_sync_status bss ON b.id = bss.booking_id
WHERE bss.sync_status = ''failed''
AND b.status = ''confirmed'';
```

## Recovery Steps

### Automatic Retry
1. System retries push every 5 minutes
2. Up to 5 retry attempts
3. Exponential backoff

### Manual Resolution
1. Check error in `booking_sync_status.error_message`
2. Verify booking details are correct
3. Manually enter in PMS if needed
4. Update `booking_sync_status.sync_status` to `synced`
5. Log manual intervention in audit

:::warning
Always prioritize notifying the property owner if PMS sync fails. They need to block the inventory manually to prevent overbooking.
:::

## Prevention

- Monitor sync failures in real-time
- Set up alerts for failed syncs
- Implement webhook confirmations where possible',
ARRAY['admin', 'dev'], 2, 'warning');

-- Debugging Section
INSERT INTO public.help_articles (title, slug, section, content_markdown, role_target, sort_order, impact_level) VALUES
('Interpreting Sync Logs', 'sync-logs-guide', 'debugging',
'## Overview

The `sync_logs` table records all synchronization attempts between ROL and external systems.

## Table Structure

| Column | Purpose |
|--------|---------|
| `id` | Unique log ID |
| `property_id` | Which property |
| `external_system` | PMS name |
| `sync_type` | availability, rates, booking |
| `status` | success, error |
| `message` | Human-readable result |
| `request_data` | What we sent |
| `response_data` | What we received |
| `created_at` | When it happened |

## Common Queries

### Recent Failures
```sql
SELECT property_id, external_system, message, created_at
FROM sync_logs
WHERE status = ''error''
ORDER BY created_at DESC
LIMIT 50;
```

### Property Sync History
```sql
SELECT sync_type, status, message, created_at
FROM sync_logs
WHERE property_id = ''uuid-here''
ORDER BY created_at DESC;
```

### Error Patterns
```sql
SELECT message, COUNT(*) as occurrences
FROM sync_logs
WHERE status = ''error''
AND created_at > now() - interval ''24 hours''
GROUP BY message
ORDER BY occurrences DESC;
```

## Interpreting Errors

| Error Pattern | Likely Cause | Solution |
|---------------|--------------|----------|
| "401 Unauthorized" | Invalid credentials | Update pms_credentials |
| "404 Not Found" | Property removed from PMS | Verify property code |
| "Rate limit exceeded" | Too many requests | Increase sync interval |
| "Timeout" | PMS API slow | Retry later |',
ARRAY['admin', 'dev'], 1, 'info'),

('Troubleshooting Failed Bookings', 'failed-bookings-debug', 'debugging',
'## Overview

When a booking fails, use this guide to identify and resolve the issue.

## Diagnostic Steps

### 1. Check Booking Record

```sql
SELECT * FROM bookings
WHERE id = ''booking-uuid''
OR guest_email = ''guest@example.com'';
```

### 2. Check Sync Status

```sql
SELECT * FROM booking_sync_status
WHERE booking_id = ''booking-uuid'';
```

### 3. Check Edge Function Logs

View logs in Supabase dashboard or via:
```bash
supabase functions logs push-booking
```

### 4. Check Payment Status

```sql
SELECT * FROM payment_transactions
WHERE booking_id = ''booking-uuid'';
```

## Common Failure Points

### Availability Check Failed
- **Symptom**: Booking rejected before payment
- **Cause**: Room no longer available
- **Evidence**: `sync_logs` shows availability check failure

### Payment Failed
- **Symptom**: Payment declined
- **Cause**: Card issues, fraud detection
- **Evidence**: `payment_transactions.status = ''failed''`

### PMS Push Failed
- **Symptom**: Booking confirmed but not in PMS
- **Cause**: API error, invalid data format
- **Evidence**: `booking_sync_status.sync_status = ''failed''`

## Resolution Flowchart

```
Guest reports failed booking
         │
         ▼
Find booking in database
         │
    ┌────┴────┐
    │ Found?  │
    └────┬────┘
    No   │   Yes
    │    │    │
    ▼    │    ▼
Check   │  Check status
payment │         │
logs    │    ┌────┴────┐
        │    │confirmed?│
        │    └────┬────┘
        │   No    │   Yes
        │    │    │    │
        │    ▼    │    ▼
        │  Check  │  Check
        │  sync   │  PMS sync
        │  logs   │  status
```',
ARRAY['admin', 'dev'], 2, 'info');

-- Shared articles (all roles)
INSERT INTO public.help_articles (title, slug, section, content_markdown, role_target, sort_order, impact_level) VALUES
('Navigating the Dashboard', 'dashboard-navigation', 'getting_started',
'## Overview

The RoomsOnline dashboard gives you access to manage your properties, view bookings, and access settings.

## Main Sections

### Sidebar Navigation

- **Dashboard** - Overview of key metrics
- **Properties** - Manage your property listings
- **Bookings** - View and manage reservations
- **Calendar** - Visual availability view
- **Insights** - Analytics and reporting
- **Settings** - Configuration options

### Quick Actions

Use the top bar for:
- Searching for properties or bookings
- Accessing notifications
- Viewing your profile

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `?` | Open this help panel |
| `Esc` | Close dialogs/panels |
| `/` | Focus search |

## Getting More Help

Click the floating **?** button in the bottom-right corner anytime to access help articles relevant to your current page.',
ARRAY['all'], 0, 'info');