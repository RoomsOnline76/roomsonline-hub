# Implementation Brief: Modify/Cancel Booking Functionality for Lovable.dev

## Executive Summary

This document provides a comprehensive implementation plan for adding modify and cancel functionality to the RoomsOnline (ROL) platform. The solution combines two detailed proposals into a unified architecture that maintains PMS-agnostic design, enforces live data validation, and provides a seamless user experience.

---

## 🏗 System Architecture

### Core Components

```
┌─────────────────┐     ┌─────────────────────────────────────┐     ┌─────────────────┐
│   Bookings UI   │────▶│       Edge Functions Layer          │────▶│   PMS Adapters  │
│  (Bookings.tsx) │     │  modify-booking / cancel-booking    │     │   (Benson,      │
└─────────────────┘     └─────────────────────────────────────┘     │   Native, etc.) │
         │                           │                                  └─────────────────┘
         │                           │                                          │
         ▼                           ▼                                          ▼
┌─────────────────┐     ┌─────────────────────────────────────┐     ┌─────────────────┐
│  TanStack Query │     │      Database Operations             │     │   External PMS  │
│  Cache Inval    │     │  bookings / pms_reservations /       │     │   APIs          │
└─────────────────┘     │  booking_sync_status / sync_logs    │     └─────────────────┘
                        └─────────────────────────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────────────┐
                        │         Email Service                │
                        │  (modification/cancellation emails)  │
                        └─────────────────────────────────────┘
```

---

## 📋 Database Schema Updates

### Table: `bookings`
```sql
-- Add these columns to existing bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS modification_notes JSONB DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES auth.users(id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_bookings_modified_at ON bookings(last_modified_at);
```

### Table: `pms_reservations`
```sql
ALTER TABLE pms_reservations ADD COLUMN IF NOT EXISTS modification_notes JSONB DEFAULT '[]';
ALTER TABLE pms_reservations ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
```

### Table: `booking_sync_status`
```sql
ALTER TABLE booking_sync_status ADD COLUMN IF NOT EXISTS last_action TEXT CHECK (last_action IN ('create', 'modify', 'cancel'));
ALTER TABLE booking_sync_status ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE booking_sync_status ADD COLUMN IF NOT EXISTS modification_attempts INTEGER DEFAULT 0;
ALTER TABLE booking_sync_status ADD COLUMN IF NOT EXISTS last_error_message TEXT;
```

### Trigger for Audit Logging
```sql
CREATE OR REPLACE FUNCTION log_booking_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != NEW.status OR 
     OLD.check_in_date != NEW.check_in_date OR 
     OLD.check_out_date != NEW.check_out_date THEN
    
    -- Append to modification_notes
    NEW.modification_notes = 
      COALESCE(OLD.modification_notes, '[]'::jsonb) || 
      jsonb_build_object(
        'timestamp', NOW(),
        'user_id', auth.uid(),
        'action', CASE 
          WHEN NEW.status = 'cancelled' THEN 'cancel'
          ELSE 'modify'
        END,
        'changes', jsonb_strip_nulls(jsonb_build_object(
          'status', CASE WHEN OLD.status != NEW.status THEN NEW.status END,
          'dates', CASE 
            WHEN OLD.check_in_date != NEW.check_in_date OR 
                 OLD.check_out_date != NEW.check_out_date 
            THEN jsonb_build_object(
              'old_in', OLD.check_in_date,
              'new_in', NEW.check_in_date,
              'old_out', OLD.check_out_date,
              'new_out', NEW.check_out_date
            )
          END
        ))
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_booking_modification
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION log_booking_modification();
```

### RLS Policies
```sql
-- Bookings update policy
CREATE POLICY "Users can update their property bookings"
ON bookings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM properties
    WHERE properties.id = bookings.property_id
    AND (
      properties.owner_id = auth.uid() OR
      auth.is_admin() = true
    )
  )
)
WITH CHECK (
  status != 'cancelled' OR 
  (status = 'cancelled' AND OLD.status != 'cancelled')
);

-- Prevent updates to cancelled bookings
CREATE POLICY "Cannot modify cancelled bookings"
ON bookings FOR UPDATE
USING (
  OLD.status != 'cancelled' OR
  auth.is_admin() = true
);
```

---

## 🔧 Edge Functions

### 1. `modify-booking/index.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { corsHeaders } from '../_shared/cors.ts'

// Input validation schema
const ModifyBookingSchema = z.object({
  booking_id: z.string().uuid(),
  modifications: z.object({
    check_in_date: z.string().date().optional(),
    check_out_date: z.string().date().optional(),
    guests: z.number().int().min(1).optional(),
    rooms: z.array(z.object({
      room_id: z.string(),
      guests: z.number().int().min(1)
    })).optional(),
    special_requests: z.string().optional(),
    note: z.string().optional()
  })
})

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate input
    const body = await req.json()
    const { booking_id, modifications } = ModifyBookingSchema.parse(body)

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // S1: Fetch booking with property and credentials
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        property:properties (
          *,
          pms_credentials:pms_credentials (
            pms_type,
            capabilities,
            credentials
          )
        )
      `)
      .eq('id', booking_id)
      .single()

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ 
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // S2: Check if booking can be modified
    if (booking.status === 'cancelled') {
      return new Response(
        JSON.stringify({ 
          code: 'BOOKING_CANCELLED',
          message: 'Cannot modify a cancelled booking' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // S3: Check PMS capabilities
    const pmsCredentials = booking.property.pms_credentials
    if (!pmsCredentials?.capabilities?.supports_modify_booking) {
      return new Response(
        JSON.stringify({ 
          code: 'MODIFICATION_NOT_SUPPORTED',
          message: 'This PMS does not support modifications' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // S4: Fetch live availability (NO CACHING!)
    const availabilityCheck = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/fetch-availability`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          property_id: booking.property_id,
          check_in: modifications.check_in_date || booking.check_in_date,
          check_out: modifications.check_out_date || booking.check_out_date,
          rooms: modifications.rooms || booking.rooms
        })
      }
    )

    const availability = await availabilityCheck.json()
    
    if (!availability.available) {
      return new Response(
        JSON.stringify({ 
          code: 'AVAILABILITY_CHANGED',
          message: 'Selected dates/rooms are no longer available',
          availability: availability
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // S5: Call PMS adapter
    const pmsResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/${pmsCredentials.pms_type}-api`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          action: 'modify_reservation',
          credentials: pmsCredentials.credentials,
          payload: {
            reservation_id: booking.external_reservation_id,
            modifications: {
              check_in_date: modifications.check_in_date,
              check_out_date: modifications.check_out_date,
              rooms: modifications.rooms,
              guest_count: modifications.guests,
              note: modifications.note
            }
          }
        })
      }
    )

    const pmsResult = await pmsResponse.json()

    if (!pmsResponse.ok) {
      // Log failure
      await supabase.from('sync_logs').insert({
        booking_id,
        sync_type: 'booking_modification',
        status: 'failed',
        error_message: pmsResult.message,
        created_at: new Date().toISOString()
      })

      return new Response(
        JSON.stringify({ 
          code: pmsResult.code || 'PMS_ERROR',
          message: pmsResult.message || 'PMS modification failed' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // S6: Update local database
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        check_in_date: modifications.check_in_date || booking.check_in_date,
        check_out_date: modifications.check_out_date || booking.check_out_date,
        rooms: modifications.rooms || booking.rooms,
        guest_count: modifications.guests || booking.guest_count,
        special_requests: modifications.special_requests || booking.special_requests,
        last_modified_at: new Date().toISOString(),
        modified_by: (await supabase.auth.getUser()).data.user?.id
      })
      .eq('id', booking_id)

    if (updateError) {
      // Critical: PMS succeeded but local update failed
      await supabase.from('sync_logs').insert({
        booking_id,
        sync_type: 'booking_modification',
        status: 'partial',
        error_message: 'PMS updated but local DB sync failed',
        metadata: { pms_response: pmsResult, local_error: updateError }
      })

      return new Response(
        JSON.stringify({ 
          code: 'PARTIAL_SUCCESS',
          message: 'Booking modified in PMS but local update pending',
          pms_response: pmsResult
        }),
        { status: 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // S7: Update sync status
    await supabase
      .from('booking_sync_status')
      .update({
        last_action: 'modify',
        last_action_at: new Date().toISOString(),
        modification_attempts: supabase.rpc('increment', { x: 1 }),
        sync_status: 'synced'
      })
      .eq('booking_id', booking_id)

    // S8: Log success
    await supabase.from('sync_logs').insert({
      booking_id,
      sync_type: 'booking_modification',
      status: 'success',
      message: modifications.note,
      created_at: new Date().toISOString()
    })

    // S9: Trigger email
    await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-booking-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          booking_id,
          type: 'modification_confirmation',
          old_data: {
            check_in: booking.check_in_date,
            check_out: booking.check_out_date,
            rooms: booking.rooms
          },
          new_data: modifications,
          note: modifications.note
        })
      }
    )

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Booking modified successfully',
        booking_id,
        pms_response: pmsResult
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ 
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          errors: error.errors 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        code: 'INTERNAL_ERROR',
        message: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

### 2. `cancel-booking/index.ts`

```typescript
// Similar structure to modify-booking with simplified flow
// Key differences:
// - Requires cancellation_reason
// - Calls cancel_reservation on adapter
// - Updates status to 'cancelled'
// - Restores availability for native PMS
// - Sends cancellation email
```

---

## 🎨 Frontend Implementation

### `Bookings.tsx` - Action Buttons

```tsx
// Add to the expandable row content
const ActionButtons = ({ booking, capabilities }) => {
  const [showModifyModal, setShowModifyModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const handleModify = async (data) => {
    try {
      const { data: result, error } = await supabase.functions.invoke(
        'modify-booking',
        { body: { booking_id: booking.id, modifications: data } }
      )

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Booking modified successfully'
      })

      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      setShowModifyModal(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
    }
  }

  const handleCancel = async (reason) => {
    try {
      const { error } = await supabase.functions.invoke(
        'cancel-booking',
        { body: { booking_id: booking.id, reason } }
      )

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Booking cancelled successfully'
      })

      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      setShowCancelModal(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
    }
  }

  return (
    <div>
      <Button
        onClick={() => setShowModifyModal(true)}
        disabled={!capabilities?.supports_modify_booking || booking.status === 'cancelled'}
        title={!capabilities?.supports_modify_booking ? 'Modification not supported by PMS' : ''}
      >
        Modify
      </Button>
      
      <Button
        onClick={() => setShowCancelModal(true)}
        disabled={!capabilities?.supports_cancel_booking || booking.status === 'cancelled'}
        title={!capabilities?.supports_cancel_booking ? 'Cancellation not supported by PMS' : ''}
      >
        Cancel
      </Button>

      {/* Modals */}
      <ModifyBookingModal open={showModifyModal} onOpenChange={setShowModifyModal} booking={booking} onSubmit={handleModify} />
      <CancelBookingModal open={showCancelModal} onOpenChange={setShowCancelModal} booking={booking} onSubmit={handleCancel} />
    </div>
  )
}
```

### `ModifyBookingModal.tsx`

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'

const modifySchema = z.object({
  check_in_date: z.date(),
  check_out_date: z.date(),
  guests: z.number().min(1),
  rooms: z.array(z.object({
    room_id: z.string(),
    guests: z.number().min(1)
  })),
  special_requests: z.string().optional(),
  note: z.string().optional()
})

export const ModifyBookingModal = ({ open, onOpenChange, booking, onSubmit }) => {
  const form = useForm({
    resolver: zodResolver(modifySchema),
    defaultValues: {
      check_in_date: new Date(booking.check_in_date),
      check_out_date: new Date(booking.check_out_date),
      guests: booking.guest_count,
      rooms: booking.rooms,
      special_requests: booking.special_requests || ''
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modify Booking</DialogTitle>
          <DialogDescription>
            Update reservation details for {booking.guest_name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* Date Selection */}
            <FormField
              control={form.control}
              name="check_in_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Check-in Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline">
                        {field.value ? format(field.value, 'PPP') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent>
                      <Calendar
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                </FormItem>
              )}
            />
            {/* Similar for check_out_date */}

            {/* Room Configuration - Reuse from StagingBook.tsx */}

            {/* Notes */}
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modification Note</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">Confirm Modification</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

### `CancelBookingModal.tsx`

```tsx
import { z } from 'zod'
import { useForm } from 'react-hook-form'

const cancelSchema = z.object({
  reason: z.string().min(5, 'Please provide a cancellation reason'),
  confirm: z.boolean().refine(val => val === true, 'Please confirm cancellation')
})

export const CancelBookingModal = ({ open, onOpenChange, booking, onSubmit }) => {
  const form = useForm({
    resolver: zodResolver(cancelSchema),
    defaultValues: { reason: '', confirm: false }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Booking</DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel this reservation?
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => onSubmit(data.reason))}>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cancellation Reason *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Required: reason for cancellation"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox 
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">
                    I confirm this cancellation and understand it will be sent to the PMS
                  </FormLabel>
                </FormItem>
              )}
            />

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Keep Booking
              </Button>
              <Button type="submit" variant="destructive">
                Confirm Cancellation
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

---

## 🔌 PMS Adapter Updates

### Adapter Contract Extension

Each PMS adapter must implement:

```typescript
// In each PMS adapter (e.g., benson-api/index.ts)
interface ModifyReservationPayload {
  reservation_id: string;
  modifications: {
    check_in_date?: string;  // YYYY-MM-DD
    check_out_date?: string;
    rooms?: Array<{
      room_id: string;
      guests: number;
    }>;
    guest?: {
      name?: string;
      email?: string;
      phone?: string;
    };
    note?: string;
  };
}

interface CancelReservationPayload {
  reservation_id: string;
  reason?: string;
}

// Standard responses
type AdapterResponse = {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
  };
};
```

### Benson Adapter Example

```typescript
// supabase/functions/benson-api/actions/modify-reservation.ts
export const modifyReservation = async (credentials, payload) => {
  try {
    const response = await fetch(
      `${credentials.api_url}/reservations/${payload.reservation_id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${credentials.api_key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          check_in_date: payload.modifications.check_in_date,
          check_out_date: payload.modifications.check_out_date,
          rooms: payload.modifications.rooms,
          comments: payload.modifications.note
        })
      }
    )

    if (!response.ok) {
      const error = await response.json()
      return {
        success: false,
        error: {
          code: error.code || 'PMS_ERROR',
          message: error.message || 'Benson API error'
        }
      }
    }

    const data = await response.json()
    return {
      success: true,
      data: {
        modified_at: data.updated_at,
        external_id: data.id
      }
    }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error.message
      }
    }
  }
}
```

### Capabilities Matrix Update

```json
// pms-adapter-registry.json
{
  "pms_adapters": {
    "benson": {
      "capabilities": {
        "supports_modify_booking": true,
        "supports_cancel_booking": true,
        "supports_partial_cancel": true
      },
      "implemented_actions": ["modify_reservation", "cancel_reservation"]
    },
    "nightsbridge": {
      "capabilities": {
        "supports_modify_booking": false,
        "supports_cancel_booking": false,
        "supports_partial_cancel": false
      }
    },
    "roomsonline_native": {
      "capabilities": {
        "supports_modify_booking": true,
        "supports_cancel_booking": true,
        "supports_partial_cancel": true
      },
      "implemented_actions": ["modify_reservation", "cancel_reservation"]
    }
  }
}
```

---

## 📊 State Machine Updates

### `booking-flow-state-machine.json` Additions

```json
{
  "modify_booking": {
    "states": [
      {
        "id": "S0_VALIDATE_INPUT",
        "description": "Validate modify request input",
        "invariants": ["INV_VALID_BOOKING_ID"]
      },
      {
        "id": "S1_CHECK_CAPABILITY",
        "description": "Verify PMS supports modifications",
        "invariants": ["INV_PMS_SUPPORTS_MODIFY"]
      },
      {
        "id": "S2_FETCH_LIVE_AVAILABILITY",
        "description": "Get current availability from PMS",
        "invariants": ["INV_NO_BOOKING_FROM_CACHE", "INV_LIVE_CHECK"]
      },
      {
        "id": "S3_VALIDATE_MODIFICATIONS",
        "description": "Validate new dates/rooms against live availability",
        "invariants": ["INV_AVAILABILITY_CONFIRMED"]
      },
      {
        "id": "S4_CALL_ADAPTER_MODIFY",
        "description": "Send modify request to PMS",
        "invariants": ["INV_ADAPTER_RESPONSE_HANDLED"]
      },
      {
        "id": "S5_UPDATE_LOCAL",
        "description": "Update local database",
        "invariants": ["INV_TRANSACTION_ATOMIC"]
      },
      {
        "id": "S6_LOG_AND_NOTIFY",
        "description": "Log action and send notifications",
        "invariants": ["INV_AUDIT_TRAIL"]
      }
    ],
    "transitions": [
      { "from": "S0_VALIDATE_INPUT", "to": "S1_CHECK_CAPABILITY", "on": "VALIDATION_SUCCESS" },
      { "from": "S1_CHECK_CAPABILITY", "to": "S2_FETCH_LIVE_AVAILABILITY", "on": "CAPABILITY_CONFIRMED" },
      { "from": "S2_FETCH_LIVE_AVAILABILITY", "to": "S3_VALIDATE_MODIFICATIONS", "on": "AVAILABILITY_FETCHED" },
      { "from": "S3_VALIDATE_MODIFICATIONS", "to": "S4_CALL_ADAPTER_MODIFY", "on": "VALIDATION_PASSED" },
      { "from": "S4_CALL_ADAPTER_MODIFY", "to": "S5_UPDATE_LOCAL", "on": "ADAPTER_SUCCESS" },
      { "from": "S5_UPDATE_LOCAL", "to": "S6_LOG_AND_NOTIFY", "on": "UPDATE_SUCCESS" }
    ],
    "error_states": [
      { "code": "MODIFICATION_NOT_SUPPORTED", "description": "PMS does not support modifications", "recovery": "Display message to user" },
      { "code": "AVAILABILITY_CHANGED", "description": "Selected dates/rooms no longer available", "recovery": "Show updated availability to user" },
      { "code": "BOOKING_CANCELLED", "description": "Cannot modify cancelled booking", "recovery": "Prevent modification attempt" }
    ]
  }
}
```

---

## 🧪 Testing Strategy

### Unit Tests
```typescript
// __tests__/modify-booking.test.ts
describe('modify-booking edge function', () => {
  test('validates input correctly', async () => { /* Test Zod validation */ })
  test('checks PMS capabilities', async () => { /* Test capability check */ })
  test('fetches live availability', async () => { /* Test availability fetch */ })
  test('handles PMS adapter errors', async () => { /* Test error scenarios */ })
})
```

### Integration Tests
```typescript
// __tests__/integration/modify-flow.test.ts
describe('Modify flow integration', () => {
  test('complete modify flow with Benson PMS', async () => { /* Test end-to-end flow */ })
  test('handles PMS failure gracefully', async () => { /* Test failure scenarios */ })
})
```

### E2E Tests (Cypress)
```typescript
// cypress/e2e/modify-cancel.cy.ts
describe('Modify/Cancel UI', () => {
  it('should modify a booking successfully', () => {
    cy.visit('/bookings')
    cy.get('[data-testid="expand-row"]').first().click()
    cy.get('[data-testid="modify-btn"]').click()
    cy.get('[data-testid="check-in-date"]').click()
    cy.contains('15').click()
    cy.get('[data-testid="submit-modify"]').click()
    cy.contains('Success').should('be.visible')
  })

  it('should cancel a booking', () => {
    cy.visit('/bookings')
    cy.get('[data-testid="expand-row"]').first().click()
    cy.get('[data-testid="cancel-btn"]').click()
    cy.get('[data-testid="cancel-reason"]').type('Test cancellation')
    cy.get('[data-testid="confirm-cancel"]').check()
    cy.get('[data-testid="submit-cancel"]').click()
    cy.contains('Success').should('be.visible')
  })
})
```

---

## 🚀 Deployment Plan

### Phase 1: Database & Infrastructure (Day 1-2)
- [ ] Run migration scripts for new columns
- [ ] Update RLS policies
- [ ] Create triggers for audit logging
- [ ] Deploy edge function stubs

### Phase 2: Core PMS Adapters (Day 3-5)
- [ ] Implement modify/cancel in Native PMS
- [ ] Implement modify/cancel in Benson
- [ ] Update NightsBridge (capabilities = false)
- [ ] Update adapter registry

### Phase 3: UI Implementation (Day 6-8)
- [ ] Add action buttons to Bookings.tsx
- [ ] Create Modify modal with form reuse
- [ ] Create Cancel modal
- [ ] Implement TanStack Query cache invalidation

### Phase 4: Email & Notifications (Day 9)
- [ ] Update email templates
- [ ] Implement modification email
- [ ] Implement cancellation email
- [ ] Test email delivery

### Phase 5: Testing & QA (Day 10-12)
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
- [ ] Role-based access testing
- [ ] Cross-browser testing

### Phase 6: Rollout (Day 13-14)
- [ ] Enable feature flag for internal testing
- [ ] Gradual rollout to beta users
- [ ] Monitor error rates in sync_logs
- [ ] Full production enablement

---

## 📈 Monitoring & Observability

### Key Metrics
- `modification_success_rate` - Percentage of successful modifications
- `cancellation_success_rate` - Percentage of successful cancellations
- `modification_duration_ms` - Time to complete modification
- `pms_error_rate` - Errors by PMS type
- `unsupported_action_attempts` - Attempts on unsupported PMS

### Log Queries
```sql
-- Monitor modification failures
SELECT 
  pms_type,
  COUNT(*) as failure_count,
  error_message
FROM sync_logs
WHERE sync_type = 'booking_modification'
  AND status = 'failed'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY pms_type, error_message;

-- Track usage by role
SELECT 
  auth.role(),
  COUNT(*) as action_count,
  sync_type
FROM sync_logs
JOIN auth.users ON auth.users.id = sync_logs.user_id
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY auth.role(), sync_type;
```

### Dashboards
- Add widgets to existing admin dashboard:
  - Modify/Cancel success rate gauge
  - PMS error rate by type
  - Recent failure log
  - Usage trends

---

## 🔒 Security Considerations

### Rate Limiting
```typescript
// In edge functions
const rateLimit = await checkRateLimit({
  key: `modify:${auth.uid()}`,
  max: 10, // 10 modifications per hour
  window: 3600
})

if (rateLimit.exceeded) {
  return new Response(
    JSON.stringify({ 
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many modification attempts' 
    }),
    { status: 429 }
  )
}
```

### Audit Trail
- All modifications/cancellations logged in `sync_logs`
- `modification_notes` JSONB field maintains history
- User ID tracked for all actions
- Cannot delete audit logs (immutable once written)

### Data Validation
- Zod schemas on all inputs
- SQL injection prevention via parameterized queries
- No direct user input to PMS adapters

---

## 📚 Documentation Updates

### Update These Files
- [ ] `DEV_BRIEF.md` - Add modify/cancel sections
- [ ] `rol-system-manifest.json` - Update capabilities
- [ ] `pms-adapter-registry.json` - Add new actions
- [ ] `booking-flow-state-machine.json` - Add new flows
- [ ] `data-authority-model.json` - Confirm PMS authority
- [ ] API documentation for new edge functions

### New Documentation
- [ ] `modify-cancel-guide.md` - User guide for property owners
- [ ] `pms-adapter-modify-cancel.md` - Developer guide for adapter implementation

---

## 🎯 Success Criteria

### Functional Requirements
- [ ] Modify button appears only when PMS supports it
- [ ] Cancel button appears only when PMS supports it
- [ ] Live availability check before modification
- [ ] PMS receives modify/cancel request
- [ ] Local database updates after PMS success
- [ ] Email notifications sent
- [ ] Audit trail maintained
- [ ] RLS policies enforced

### Performance Requirements
- [ ] Modify operation completes in < 3 seconds
- [ ] UI remains responsive during operations
- [ ] Database queries optimized with indexes
- [ ] Edge functions cold start < 500ms

### Reliability Requirements
- [ ] 99.9% success rate for supported PMS
- [ ] Proper error messages for failures
- [ ] Automatic retry for transient failures
- [ ] Data consistency between PMS and ROL

---

## 🚨 Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| PMS API downtime | High | Graceful error handling, queue for retry |
| Data inconsistency | High | Always PMS as source of truth, partial success handling |
| Rate limiting by PMS | Medium | Implement backoff, queue modifications |
| Concurrent modifications | Medium | Optimistic locking via modification_notes timestamp |
| Email delivery failure | Low | Queue emails, retry mechanism |
