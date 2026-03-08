

## Dual Commission Rate System: Listing vs PMS

### Problem
Currently, each property has a single `revenue_share_percent` in `property_commercial_terms`. In reality, there are two distinct commission streams:
- **Listing Rate** (default 10%): Bookings via book.sleepinafrica.roomsonline.co.za (standard OTA listing)
- **PMS Rate**: Bookings via ROL'OS integrations (widget, API, embed, direct PMS bookings) — typically lower

Both rates can be active simultaneously for the same property. The system needs to apply the correct rate based on how the booking originated.

### Database Changes

**Alter `property_commercial_terms`** — add a `commission_type` column:

```sql
ALTER TABLE property_commercial_terms
  ADD COLUMN commission_type text NOT NULL DEFAULT 'listing'
  CHECK (commission_type IN ('listing', 'pms'));
```

This allows two active rows per property — one for each type.

### Changes Overview

#### 1. CommissionTab UI (`src/components/property/CommissionTab.tsx`)
- Display **two cards** side-by-side: "Listing Commission" (default 10%) and "PMS Commission" (default 2-5%)
- Each card shows the active rate, effective date, and status
- "Set New Rate" form gets a **commission type selector** (Listing / PMS)
- History table gains a "Type" column showing Listing or PMS badge
- Clear labelling: Listing = "Bookings via Sleep in Africa marketplace", PMS = "Bookings via ROL'OS integrations (widget, API, embed)"

#### 2. Commission Calculation (`supabase/functions/calculate-commission/index.ts`)
- Determine the booking's commission type from `integration_type` and `booking_channel`:
  - If `integration_type` is `rolos`, `widget`, `embed`, `api`, `wordpress`, or `booking_channel` is `direct` with ROL'OS source → use **pms** rate
  - Otherwise → use **listing** rate
- Query `property_commercial_terms` filtered by the resolved `commission_type`
- Fall back to default: 10% for listing, 2% for PMS (or whatever the admin sets)
- Store the resolved `commission_type` on the booking (new column `commission_type` on bookings table)

#### 3. Revenue Pulse API (`supabase/functions/revenue-pulse-api/index.ts`)
- Break down ROL Revenue by commission type (Listing vs PMS) in the response
- Channel breakdown already exists; enhance it to show which rate was applied
- Add a new field to tier1 KPIs: `listingRevenue` and `pmsRevenue`

#### 4. Revenue Pulse Dashboard (`src/components/dashboard/ROLRevenuePulse.tsx`)
- Add a revenue split visual showing Listing income vs PMS income
- Enhance the property breakdown to indicate which commission type generated the revenue

#### 5. Contract Wording (`src/pages/ContractSign.tsx`)
- Currently fetches a single `commission_percentage` text variable
- Update to fetch **both** rates and inject two template variables:
  - `{{listing_commission_percentage}}` — e.g., "ten percent (10%)"
  - `{{pms_commission_percentage}}` — e.g., "two percent (2%)"
- Maintain backward compatibility: `{{commission_percentage}}` still resolves to the listing rate
- Contract templates should be updated to include wording like: *"A commission of {{listing_commission_percentage}} applies to bookings made through the Sleep in Africa marketplace. For bookings facilitated through the ROL'OS Property Management System integrations, a commission of {{pms_commission_percentage}} shall apply."*

#### 6. Bookings Table
```sql
ALTER TABLE bookings ADD COLUMN commission_type text DEFAULT 'listing';
```
This records which rate type was applied for audit and revenue reporting.

### Files to Modify
- **Migration**: New SQL migration for `commission_type` column on both tables
- **`src/components/property/CommissionTab.tsx`**: Dual-rate UI
- **`supabase/functions/calculate-commission/index.ts`**: Type-aware rate resolution
- **`supabase/functions/revenue-pulse-api/index.ts`**: Split revenue by type
- **`src/components/dashboard/ROLRevenuePulse.tsx`**: Display listing vs PMS revenue
- **`src/pages/ContractSign.tsx`**: Dual commission variable injection
- **`src/hooks/useROLPulseData.tsx`**: Add `listingRevenue`/`pmsRevenue` to type definitions

