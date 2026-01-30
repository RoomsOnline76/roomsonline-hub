
# PayFast Integration: Complete AddPay Replacement

## Executive Summary
Replace the AddPay payment gateway with PayFast PayWeb v3 (Network International) across the entire RoomsOnline booking engine. This involves creating a new edge function, updating database schemas, modifying frontend checkout flows, enhancing confirmation emails with payment details, and cleaning up all AddPay references.

---

## 1. Database Schema Changes

### 1.1 Add `payment_provider` Column to Properties Table
```sql
-- Add payment provider column (null = no payment, 'payfast' = PayFast enabled)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS payment_provider text DEFAULT null;

-- Example values: 'payfast', null (for properties without online payment)
COMMENT ON COLUMN properties.payment_provider IS 'Payment gateway provider: payfast or null';
```

### 1.2 Update `payment_transactions` Table
Rename the AddPay-specific column to a generic column and add PayFast fields:
```sql
-- Rename addpay_response to gateway_response (generic)
ALTER TABLE payment_transactions 
RENAME COLUMN addpay_response TO gateway_response;

-- Add payment_provider column to track which gateway was used
ALTER TABLE payment_transactions 
ADD COLUMN IF NOT EXISTS payment_provider text DEFAULT 'payfast';

-- Add PayFast-specific fields
ALTER TABLE payment_transactions 
ADD COLUMN IF NOT EXISTS pf_payment_id text,
ADD COLUMN IF NOT EXISTS m_payment_id text,
ADD COLUMN IF NOT EXISTS signature_valid boolean DEFAULT null;

-- Rename psn to transaction_ref (generic)
ALTER TABLE payment_transactions 
RENAME COLUMN psn TO transaction_ref;
```

### 1.3 Create Payment Credentials Table (Optional)
Alternatively, store PayFast credentials in `api_keys` table as is done with other integrations. Recommended approach: Use Supabase secrets for merchant_id, merchant_key, passphrase (already exists pattern).

---

## 2. New PayFast Edge Function

### 2.1 File: `supabase/functions/payfast-api/index.ts`

**Actions supported:**
- `initiate_payment`: Build PayWeb v3 form payload with signature
- `verify_itn`: Validate ITN webhook (IP, signature, server confirmation)
- `verify_payment`: Query transaction status

**Key implementation details:**

```text
PayFast PayWeb v3 Flow:
1. Frontend calls initiate_payment with booking_id
2. Edge function:
   - Fetches booking details
   - Creates payment_transactions record (status=pending)
   - Builds form fields (merchant_id, amount, item_name, etc.)
   - Generates MD5 signature (alphabetically sorted params + passphrase)
   - Returns form fields and redirect URL
3. Frontend auto-submits hidden form to PayFast
4. PayFast processes payment, sends ITN to notify_url
5. verify_itn action:
   - Validates source IP (41.74.179.194 or sandbox IPs)
   - Validates signature using MD5
   - Server-side validation POST to PayFast
   - Updates payment_transactions and bookings
   - Triggers push-booking if payment successful
   - Triggers send-booking-email
```

**PayFast URLs:**
- Sandbox: `https://sandbox.payfast.co.za/eng/process`
- Production: `https://www.payfast.co.za/eng/process`
- ITN Validation: `https://www.payfast.co.za/eng/query/validate` (or sandbox equivalent)

**Required Secrets (new):**
- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_PASSPHRASE` (optional but recommended)
- `PAYFAST_SANDBOX` (boolean toggle, default true during development)

---

## 3. Frontend Changes

### 3.1 Update `src/pages/Booking.tsx`

Add payment initiation logic after booking creation:

```text
Current flow:
1. Create booking in DB (status=pending)
2. Call push-booking (PMS sync)
3. Email sent via push-booking
4. Redirect to confirmation

New flow (when property.payment_provider = 'payfast'):
1. Create booking in DB (status=pending, payment_status=pending)
2. Call payfast-api initiate_payment
3. Receive form fields
4. Auto-submit hidden form to PayFast
5. User completes payment on PayFast hosted page
6. PayFast redirects to return_url with payment details
7. Verify payment status via callback
8. If successful: trigger push-booking + email
9. Redirect to confirmation
```

**New component: PayFastForm (hidden form auto-submit)**
```tsx
// Submits automatically when form fields are received
<form method="POST" action={payfastUrl} id="payfast-form" className="hidden">
  {Object.entries(formFields).map(([key, value]) => (
    <input key={key} name={key} value={value} type="hidden" />
  ))}
</form>
```

### 3.2 Create Payment Return Handler

New route: `/payment/return` or handle via query params on `/booking-confirmation/:id`

Handle return_url callback:
- Check for `payment_status` query param
- If cancelled: show cancellation message
- If completed: verify via edge function, show confirmation

### 3.3 Update `src/pages/BookingConfirmation.tsx`

Add payment status display:
- Show "Payment Successful" badge if `payment_status = 'paid'`
- Show PayFast transaction reference if available
- Handle pending/failed states gracefully

---

## 4. Confirmation Email Updates

### 4.1 Update `supabase/functions/send-booking-email/index.ts`

**Add payment details to email template:**

```html
<!-- Payment Information Section (when payment_status = 'paid') -->
<tr>
  <td style="padding: 0 40px 20px;">
    <h2 style="...">Payment Confirmation</h2>
    <table>
      <tr>
        <td>Payment Status</td>
        <td style="color: #22c55e;">Paid</td>
      </tr>
      <tr>
        <td>Transaction Reference</td>
        <td>{{payment_reference}}</td>
      </tr>
      <tr>
        <td>Payment Method</td>
        <td>{{payment_method}}</td>
      </tr>
      <tr>
        <td>Paid At</td>
        <td>{{paid_at}}</td>
      </tr>
    </table>
    <p style="font-size: 12px; color: #666;">
      Processed securely via PayFast
    </p>
  </td>
</tr>
```

**Update `replaceTemplateVariables` function:**
```typescript
// Add payment variables
"{{payment_reference}}": booking.payment_reference || "N/A",
"{{payment_status}}": booking.payment_status === "paid" ? "Paid" : "Pending",
"{{payment_method}}": booking.payment_method || "Card",
"{{paid_at}}": booking.paid_at ? formatDate(booking.paid_at) : "N/A",
```

**Conditional section logic:**
- Only show payment section if `payment_status = 'paid'`
- Remove the generic "Payment Note" warning when paid
- Update failure email to mention payment failure if applicable

---

## 5. System Health Check Updates

### 5.1 Update `supabase/functions/system-health-check/index.ts`

Replace `checkAddPay` with `checkPayFast`:

```typescript
async function checkPayFast(): Promise<HealthCheckResult> {
  const start = Date.now();
  const merchantId = Deno.env.get('PAYFAST_MERCHANT_ID');
  const merchantKey = Deno.env.get('PAYFAST_MERCHANT_KEY');
  
  if (!merchantId || !merchantKey) {
    return {
      component_key: 'payfast_gateway',
      status: 'unknown',
      latency_ms: 0,
      error_code: 'NO_CREDENTIALS',
      error_message: 'PayFast credentials not configured',
    };
  }

  // PayFast doesn't have a health endpoint, verify credentials exist
  return {
    component_key: 'payfast_gateway',
    status: 'healthy',
    latency_ms: Date.now() - start,
    response_data: { credentials_configured: true },
    metadata: { sandbox: Deno.env.get('PAYFAST_SANDBOX') === 'true' },
  };
}
```

Update the dispatcher to call `checkPayFast` instead of `checkAddPay`.

### 5.2 Update `system_health_components` Table

Via migration:
```sql
-- Remove or rename AddPay component
UPDATE system_health_components 
SET component_key = 'payfast_gateway',
    component_name = 'PayFast Payment Gateway',
    description = 'PayFast PayWeb v3 payment processing'
WHERE component_key = 'addpay_gateway';
```

---

## 6. Booking Flow State Machine Update

### 6.1 Update `docs/system-export/booking-flow-state-machine.json`

Replace AddPay references:
```json
{
  "flow_id": "payment_flow",
  "description": "Payment processing flow via PayFast PayWeb v3",
  "entry_point": "supabase/functions/payfast-api/index.ts",
  "states": [
    {
      "state_id": "P1_INITIATE",
      "name": "Initiate Payment",
      "action": "Create payment_transactions record, build PayFast form",
      "initial_status": "pending"
    },
    {
      "state_id": "P2_REDIRECT",
      "name": "Redirect to PayFast",
      "action": "Auto-submit form to PayFast hosted page",
      "url": "https://www.payfast.co.za/eng/process"
    },
    {
      "state_id": "P3_ITN_CALLBACK",
      "name": "Receive ITN Webhook",
      "action": "PayFast POSTs to notify_url with payment result",
      "verify": "IP whitelist, signature, server validation"
    },
    {
      "state_id": "P4_UPDATE",
      "name": "Update Payment Status",
      "action": "Update payment_transactions and bookings tables",
      "fields": {
        "bookings.payment_status": "paid|failed",
        "bookings.payment_reference": "m_payment_id or pf_payment_id",
        "bookings.paid_at": "timestamp"
      }
    },
    {
      "state_id": "P5_TRIGGER_BOOKING",
      "name": "Trigger PMS Push + Email",
      "action": "Call push-booking and send-booking-email",
      "condition": "payment_status === 'paid'"
    }
  ]
}
```

---

## 7. Config.toml Updates

### 7.1 Add PayFast Function, Remove AddPay

```toml
# Add new PayFast function
[functions.payfast-api]
verify_jwt = false  # Webhook must be accessible without auth

# Keep addpay-api entry but can be removed after migration
# [functions.addpay-api]  # REMOVE after testing
```

---

## 8. AddPay Cleanup

### 8.1 Files to Delete/Archive
- `supabase/functions/addpay-api/index.ts` (archive or delete)

### 8.2 Secrets to Remove (via Supabase dashboard)
- `ADDPAY_PRIVATE_KEY`
- `ADDPAY_PUBLIC_KEY`
- `ADDPAY_MERCHANT_ID`
- `ADDPAY_STORE_NO`
- `ADDPAY_TERMINAL_SN`
- `ADDPAY_APP_ID`

### 8.3 Database Cleanup
The `addpay_response` column rename to `gateway_response` handles this.

---

## 9. Testing Instructions

### 9.1 PayFast Sandbox Testing

**Sandbox Credentials:**
- Merchant ID: `10000100` (standard test)
- Merchant Key: `46f0cd694581a`
- Passphrase: (empty or your test passphrase)

**Test Cards:**
- Success: `4000 0000 0000 0003`
- Declined: `4000 0000 0000 0019`
- Expiry: Any future date
- CVV: Any 3 digits

**ITN Testing:**
- Use ngrok or similar to expose local endpoint
- Set notify_url to accessible endpoint
- Sandbox ITN is sent from test IPs

### 9.2 Test Scenarios
1. Create booking, initiate payment, complete successfully
2. Create booking, cancel payment on PayFast page
3. Verify ITN webhook updates DB correctly
4. Verify email contains payment details
5. Test with NightsBridge property (no payment flow)
6. Test with Benson property + PayFast enabled

---

## 10. Technical Notes

### PayFast Signature Generation
```typescript
function generateSignature(data: Record<string, string>, passphrase?: string): string {
  // Sort alphabetically, encode values, build query string
  const sortedKeys = Object.keys(data).sort();
  const paramString = sortedKeys
    .filter(key => data[key] !== '')
    .map(key => `${key}=${encodeURIComponent(data[key]).replace(/%20/g, '+')}`)
    .join('&');
  
  const stringToHash = passphrase 
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase)}`
    : paramString;
  
  return md5(stringToHash);
}
```

### ITN IP Whitelist
```typescript
const PAYFAST_IPS = [
  '197.97.145.144', '197.97.145.145', '197.97.145.146', '197.97.145.147',
  '41.74.179.194', '41.74.179.195', '41.74.179.196', '41.74.179.197',
  // Sandbox IPs
  '102.216.36.0/24'
];
```

### Required Form Fields (PayWeb v3)
| Field | Description |
|-------|-------------|
| merchant_id | PayFast Merchant ID |
| merchant_key | PayFast Merchant Key |
| return_url | Success redirect URL |
| cancel_url | Cancellation redirect URL |
| notify_url | ITN webhook URL |
| m_payment_id | Internal transaction reference |
| amount | Payment amount (ZAR) |
| item_name | Description (max 100 chars) |
| signature | MD5 hash of all params |

---

## 11. Implementation Order

1. **Phase 1: Database & Secrets**
   - Add PayFast secrets
   - Run schema migrations
   - Update health components table

2. **Phase 2: Edge Function**
   - Create `payfast-api` edge function
   - Implement initiate_payment action
   - Implement verify_itn action
   - Update config.toml

3. **Phase 3: Frontend**
   - Update Booking.tsx with payment initiation
   - Create PayFast form submission component
   - Update BookingConfirmation.tsx

4. **Phase 4: Email Updates**
   - Update send-booking-email with payment section
   - Test email templates

5. **Phase 5: Health Check**
   - Update system-health-check
   - Remove AddPay check, add PayFast check

6. **Phase 6: Documentation & Cleanup**
   - Update booking-flow-state-machine.json
   - Archive/delete addpay-api
   - Remove AddPay secrets
   - Update Terms of Service (already done)

---

## 12. Files Affected Summary

| File | Action |
|------|--------|
| `supabase/functions/payfast-api/index.ts` | CREATE |
| `supabase/functions/addpay-api/index.ts` | DELETE |
| `supabase/functions/send-booking-email/index.ts` | MODIFY |
| `supabase/functions/system-health-check/index.ts` | MODIFY |
| `supabase/config.toml` | MODIFY |
| `src/pages/Booking.tsx` | MODIFY |
| `src/pages/BookingConfirmation.tsx` | MODIFY |
| `docs/system-export/booking-flow-state-machine.json` | MODIFY |
| Database migrations | CREATE |

