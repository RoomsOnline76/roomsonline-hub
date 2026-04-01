

# Jongensfontein.com Portfolio — Full Setup Plan

## Overview

Create 4 properties owned by Julius Erasmus, group them into a "Jongensfontein.com" portfolio, configure ROL'OS PMS with room types and seasonal rates, enable Experience Engine with branding and cancellation policies, and seed email templates for all properties.

## Branding (from website screenshot)

- **Primary color**: `#F5A623` (golden yellow from header bar)
- **Secondary color**: `#1B7FAD` (ocean blue from the nav/accent area)
- **Font color**: `#333333`
- **Logo URL**: `https://jongensfontein.com/wp-content/uploads/2020/01/jongensfontein_cover-image.jpg` (hero — will use as brand image)
- **Brand voice**: "Warm, coastal, family-friendly. Jongensfontein is a peaceful seaside village on the Garden Route, ideal for families seeking quiet self-catering beach holidays."
- **AI tone**: "friendly and informative"

## Execution Steps (via script)

### Step 1: Insert 4 Properties
Insert into `properties` table with:
- `name`, `description`, `property_type`, `address`, `city`, `country`, `latitude`, `longitude`, `price_per_night` (lowest rate), `max_guests` (highest room), `bedrooms`, `bathrooms`
- `owner_name`: "Julius Erasmus", `owner_email`: "bookings@jongensfontein.com"
- `property_url`, `slug` (auto-generated)
- `external_system`: "roomsonline", `is_rol_property`: true
- `is_active`: true, `brand_override_enabled`: true
- `brand_primary_color`: "#F5A623", `brand_secondary_color`: "#1B7FAD", `brand_font_color`: "#333333"
- `amenities` JSONB with facilities, contact info, currency, etc.

Properties:
1. **Dassiesingel Self Catering Units** — slug: `dassiesingel-self-catering-units` — 4 room types
2. **Fonteinhutte Self-Catering Chalets** — slug: `fonteinhutte-self-catering-chalets` — 4 room types
3. **Seesig Self Catering Chalets** — slug: `seesig-self-catering-chalets` — 4 room types
4. **Tidal Pools Self Catering Apartments** — slug: `tidal-pools-self-catering-apartments` — 4 room types

### Step 2: Create ROL'OS Room Types
For each property, insert into `rolos_room_types`:
- `property_id`, `name`, `code` (slugified name), `description`, `base_occupancy`, `max_occupancy`, `default_rate` (low season rate), `amenities`, `is_active`

Total: 16 room types across 4 properties.

### Step 3: Create Rate Plans + Seasons + Prices
For each property, insert:
- 1 rate plan per property in `rolos_rate_plans` (name: "Standard Rate", code: "standard", pricing_model: "per_unit")
- Link room types via `rolos_rate_plan_room_types`
- 3 seasons per rate plan in `rolos_rate_seasons`: High, Middle, Low with date ranges from the seed data
- Per-room-type prices in `rolos_rate_prices` for each season

### Step 4: Create Portfolio
Insert into `property_portfolios`:
- name: "Jongensfontein.com", slug: "jongensfontein"

Insert 4 rows into `property_portfolio_members` linking all properties.

### Step 5: Enable Experience Engine
For each property, insert into `rolos_experience_configs`:
- `experience_type`: "experience_engine", `config`: `{}`, `is_active`: true
- `experience_type`: "brand_kit", `config`: `{ brand_voice, ai_email_tone, primary_color, secondary_color, font_color }`, `is_active`: true

### Step 6: Seed Cancellation Policies
For each property, insert into `rolos_policies`:
- `policy_type`: "cancellation"
- Self-catering tier: 21 days notice, 100% forfeit
- High season override: 60 days, Dec 15 – Jan 15

### Step 7: Seed Email Templates
For each property, insert 6 templates into `rolos_message_templates`:
1. **Booking Confirmation** (booking_confirmed)
2. **Pre-Arrival** (pre_arrival) — -48h offset
3. **Check-In Welcome** (check_in)
4. **Check-Out Thank You** (check_out)
5. **Payment Request** (payment_request)
6. **Cancellation** (cancellation)

Templates use `{{property_name}}`, `{{guest_name}}`, `{{check_in_date}}` variables with coastal, family-friendly copy.

## Technical Detail

All data operations use the `supabase--insert` tool (not migrations). The script will:
1. Insert properties and capture returned IDs
2. Use those IDs for all child table inserts
3. No schema changes needed — all tables exist

Approximately 80+ rows across 9 tables:
- 4 × `properties`
- 16 × `rolos_room_types`
- 4 × `rolos_rate_plans`
- 16 × `rolos_rate_plan_room_types`
- 12 × `rolos_rate_seasons`
- 48 × `rolos_rate_prices`
- 1 × `property_portfolios` + 4 × `property_portfolio_members`
- 8 × `rolos_experience_configs`
- 4 × `rolos_policies`
- 24 × `rolos_message_templates`

## Files Modified

No code file changes required. All operations are data inserts into existing tables via scripts.

