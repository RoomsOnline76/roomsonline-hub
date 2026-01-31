
# Plan: Manual Rates for No-PMS Properties - Bookable with Property Email Notification

## Status: ✅ IMPLEMENTED

## Overview

This plan enables properties without a PMS connection to be bookable on the public-facing PropertyShowcase page using rates captured during the onboarding wizard. Since there's no PMS to sync bookings to, the property owner must be notified via email when a paid booking is received.

## Implementation Summary

### Changes Made

1. **PropertyShowcase.tsx** - Added synthetic availability from wizard rates for non-PMS properties
   - Builds `syntheticAvailMap` from `amenities.room_types` when no external system
   - Sets `available_units: 99` for unlimited availability
   - Fallback rate lookup checks wizard `base_rate` / `baseRate` / `daily_rate`
   - Added `isManualRatesProperty` flag to enable Quick Book and Floating Date Picker

2. **Booking.tsx** - Calculate costs from wizard data when no PMS
   - Added `generateDailyRates()` helper - generates per-day rates with season adjustments
   - Added `generateAvailabilityArray()` helper - creates synthetic availability array
   - Modified cost calculation to build synthetic room types from `amenities.room_types`
   - Supports season-specific rate adjustments when defined

3. **push-booking/index.ts** - Property owner notification for non-PMS bookings
   - Updated `!externalSystem` case to mark booking as `confirmed`
   - Sends `property_notification` email to `property.owner_email`
   - Also sends `success` confirmation email to guest
   - Returns success with message "Booking confirmed, owner notified"

4. **send-booking-email/index.ts** - Added property_notification email template
   - Extended schema to include `property_notification` status and `recipient_email`
   - Added `generatePropertyNotificationEmail()` function
   - New template includes: booking details, guest info, payment confirmation, special requests
   - Features "Action Required" section prompting owner to manually record booking

## Files Modified

| File | Changes |
|------|---------|
| `src/pages/PropertyShowcase.tsx` | ✅ Synthetic availability from wizard rates for non-PMS properties |
| `src/pages/Booking.tsx` | ✅ Cost calculation from wizard data; helper functions added |
| `supabase/functions/push-booking/index.ts` | ✅ Owner notification + guest email flow for non-PMS |
| `supabase/functions/send-booking-email/index.ts` | ✅ `property_notification` status handler and email template |

## Testing Checklist

- [x] Non-PMS property shows rooms with wizard rates on PropertyShowcase
- [x] Guest can select dates and see calculated price (via synthetic availability)
- [ ] Payment flow completes successfully (manual test recommended)
- [ ] Guest receives confirmation email (manual test recommended)
- [ ] Property owner receives notification email with full booking details (manual test recommended)
- [ ] Booking appears in dashboard with status "confirmed" (manual test recommended)

## Edge Cases Handled

1. **No owner_email**: Logs warning, sends only guest email
2. **Seasons pricing**: Applies season-specific rates when calculating costs
3. **Missing base_rate**: Shows "Contact for rates" in UI (existing behavior)
4. **PMS later connected**: Once a PMS is connected, wizard rates are replaced by PMS rates automatically

## Technical Notes

### Synthetic Availability Format
```typescript
{
  external_room_type_id: roomId,
  available_units: 99,
  rates: [{
    rate_type_id: 'wizard-rate',
    room_amount: baseRate,
    price_type: 'UnitRate' | 'PerStay'
  }],
  date: today
}
```

### Property Notification Email Status
New status `property_notification` added to send-booking-email with:
- Subject: "🎉 New Booking Received - [Guest Name] - [Dates]"
- Green success styling (matches confirmed booking theme)
- Guest contact details (clickable email/phone links)
- Payment confirmation section
- "Action Required" prompt for manual property management
