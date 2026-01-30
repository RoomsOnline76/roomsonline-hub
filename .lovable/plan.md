
# Create Sample Availability & Rate Data for Latter Days Test Property

## Overview
Populate the PMS cache tables with sample test data for the "[SANDBOX] xxxLatter Days - STILBAAIxxx" property to enable full checkout testing with the new PayFast integration.

---

## Property Details

| Field | Value |
|-------|-------|
| Property ID | `ea9a019d-1299-46eb-b371-a0b25eb60350` |
| Name | [SANDBOX] xxxLatter Days - STILBAAIxxx |
| Slug | `latter-days` |
| External System | `null` (will set to `rol` for internal testing) |
| Payment Provider | `null` (will set to `payfast`) |

**Room Types from amenities.room_types:**
1. `Holiday House` (id: 1) - Max 2 guests, 1 unit, R2,500/night
2. `One Bedroom Suite` (id: 2) - Max 2 guests, 1 unit, R1,800/night
3. `Petite Hotel Room` (id: 3) - Max 2 guests, 1 unit, R950/night
4. `Two Bedroom Suite` (id: 4) - Max 2 guests, 1 unit, R3,200/night
5. `Dulux Pondok` (id: 1764700610538) - Max 2 guests, 1 unit, R1,500/night

---

## Implementation Plan

### 1. Update Property Settings
Enable PayFast payment and set a test external system:
```sql
UPDATE properties SET
  payment_provider = 'payfast',
  external_system = 'rol'  -- Internal ROL-managed property
WHERE id = 'ea9a019d-1299-46eb-b371-a0b25eb60350';
```

### 2. Insert Room Types into Cache
Create entries in `pms_room_types_cache` for each room:
- System type: `rol` (internal)
- Link to rate type: `per-unit`
- Set appropriate guest limits

### 3. Insert Rate Type into Cache
Create a single rate type in `pms_rate_types_cache`:
- Name: "Standard Rate"
- Price type: `per-unit` (room rate, not per person)

### 4. Generate 90-Day Availability Data
Insert records into `pms_availability_cache` for each room:
- Date range: Today to 90 days forward
- Available units: 1 per room (with some sold-out days for realism)
- Rates: JSONB with `room_amount` field for per-unit pricing

### 5. Sample Rate Structure

| Room | Weekday Rate (ZAR) | Weekend Rate (ZAR) |
|------|-------------------|-------------------|
| Holiday House | 2,500 | 3,000 |
| One Bedroom Suite | 1,800 | 2,200 |
| Petite Hotel Room | 950 | 1,150 |
| Two Bedroom Suite | 3,200 | 3,800 |
| Dulux Pondok | 1,500 | 1,800 |

Weekend = Friday & Saturday nights

---

## SQL Migration (Single Transaction)

The migration will:
1. Update property to enable PayFast and set external_system
2. Clear any existing cache data for this property
3. Insert room types into `pms_room_types_cache`
4. Insert rate type into `pms_rate_types_cache`
5. Insert 90 days of availability per room into `pms_availability_cache`

---

## Data Generation Logic

For availability:
- **Weekdays**: Full availability (1 unit)
- **Peak dates** (Fridays): 80% available
- **Random sold-out days**: ~5% of dates show 0 availability for realism
- **Rates**: Include `room_amount` in rates JSONB for per-unit pricing
- **Restrictions**: min_stay = 1, max_stay = 14

---

## Testing Checklist After Data Insert

1. Navigate to `/property/latter-days`
2. Open QuickBookDrawer and verify room options appear
3. Select dates and see pricing calculated
4. Proceed to checkout at `/booking/latter-days`
5. Complete PayFast payment flow (sandbox)
6. Verify booking confirmation email contains payment details

---

## Files to Create/Modify

| File | Action |
|------|--------|
| Database migration | CREATE - Insert sample data |
| No code changes required | Data-only operation |
