

# Add Sync Failure Admin Notification and Intervention Tracking

## Problem

When a booking payment succeeds but PMS sync fails:
1. The guest receives a success email with a sync warning note
2. BUT the admin team is NOT notified to take action
3. There's no flag to easily filter bookings requiring manual intervention

## Solution

### 1. Database Changes

Add a `requires_intervention` boolean column to the `bookings` table to flag paid bookings with failed syncs:

```sql
ALTER TABLE bookings 
ADD COLUMN requires_intervention boolean DEFAULT false;
```

### 2. Update `push-booking` Edge Function

After detecting a paid booking with failed PMS sync:

```typescript
// Flag booking as requiring intervention
if (paymentSucceeded && !anySuccess) {
  await supabaseClient
    .from('bookings')
    .update({ requires_intervention: true })
    .eq('id', booking_id);
}
```

### 3. Add Admin Notification Email

When sync fails for a paid booking, send an email to `admin@roomsonline.co.za`:

```typescript
// Send admin notification for failed sync on paid booking
if (paymentSucceeded && !anySuccess) {
  try {
    await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-booking-email`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          booking_id,
          status: 'admin_alert',  // New status type for admin notifications
          error_message: firstError?.error,
        }),
      }
    );
  } catch (alertError) {
    console.error('Failed to send admin alert:', alertError);
  }
}
```

### 4. Update `send-booking-email` Edge Function

Add a new email type `admin_alert` that sends to `admin@roomsonline.co.za`:

```typescript
// Handle admin_alert status
if (status === 'admin_alert') {
  const adminEmailHtml = generateAdminAlertEmail(booking, property, errorMessage);
  
  await resend.emails.send({
    from: fromEmail,
    to: ['admin@roomsonline.co.za'],
    subject: `ACTION REQUIRED: Paid booking sync failed - ${property.name} - ${booking.guest_name}`,
    html: adminEmailHtml,
  });
  
  return new Response(
    JSON.stringify({ success: true, message: 'Admin alert sent' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

Admin email content includes:
- Booking reference, guest name, property, dates, total amount
- PMS error message
- Clear call-to-action: "Please manually enter this booking in the PMS"
- Link to dashboard/bookings page

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/push-booking/index.ts` | Set `requires_intervention = true` and trigger admin alert email |
| `supabase/functions/send-booking-email/index.ts` | Add `admin_alert` handler with admin-specific email template |

## Database Migration

```sql
-- Add intervention tracking
ALTER TABLE bookings 
ADD COLUMN requires_intervention boolean DEFAULT false;

-- Create index for quick filtering
CREATE INDEX idx_bookings_requires_intervention 
ON bookings(requires_intervention) 
WHERE requires_intervention = true;
```

---

## Technical Flow

```text
Payment Succeeds → PMS Sync Fails
         ↓
  [1] Update booking: requires_intervention = true
         ↓
  [2] Send guest email (success with sync warning)
         ↓
  [3] Send admin email (ACTION REQUIRED)
         ↓
  Admin sees email → Manually enters booking in PMS
         ↓
  Admin marks requires_intervention = false
```

---

## Admin Alert Email Template

```
Subject: ACTION REQUIRED: Paid booking sync failed - [Property Name] - [Guest Name]

Body:
------------------------------------------
⚠️ MANUAL ACTION REQUIRED

A guest has paid for a booking but it failed to sync to the PMS.

BOOKING DETAILS
Reference: [BOOKING-REF]
Guest: [Guest Name] ([Guest Email])
Property: [Property Name]
Dates: [Check-in] to [Check-out]
Amount Paid: R[Amount]

SYNC ERROR
[Error message from PMS]

REQUIRED ACTION
Please manually enter this booking in the PMS for [Property Name].

View Booking: [Link to booking in dashboard]
------------------------------------------
```

---

## Dashboard Enhancement (Future)

The `requires_intervention` flag enables:
- A filtered view showing only bookings needing attention
- A badge count in the navigation showing pending interventions
- Quick action buttons to mark as resolved

