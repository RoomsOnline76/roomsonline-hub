

# Add Webhook Support to ROL'OS API

## Current State
The webhook **infrastructure** already exists — `rolos_webhook_subscriptions` and `rolos_webhook_logs` tables, the `rolos-webhook-receiver` edge function with subscribe/unsubscribe/queue/deliver/test-ping/get-logs actions, and HMAC-SHA256 signing. However, it's completely disconnected from the PMS API.

## What's Missing

1. **PMS API doesn't expose webhook actions** — `supports_webhooks: false`, no webhook actions in the Zod schema
2. **No automatic event firing** — when a booking is created/modified/cancelled/checked-in/checked-out, nothing queues a webhook event
3. **No API documentation** — the interactive docs at `/docs` have no "Webhooks" category

## Changes

### 1. Wire webhook actions into `roomsonline-pms-api/index.ts`
- Set `supports_webhooks: true`
- Add 5 new actions to the Zod enum: `subscribe_webhook`, `unsubscribe_webhook`, `test_webhook`, `get_webhook_logs`, `list_webhook_subscriptions`
- Each action delegates to the existing `rolos-webhook-receiver` function internally (calling Supabase tables directly, same logic)
- Add Zod schemas for each action's parameters

### 2. Auto-queue webhook events on booking changes
- Add a helper function inside the PMS API that fires `queue_event` after successful booking operations
- Hook it into `create_reservation`, `modify_reservation`, `cancel_reservation`, `check_in`, and `check_out` handlers
- Events: `booking.created`, `booking.modified`, `booking.cancelled`, `booking.checked_in`, `booking.checked_out`
- Payload includes booking ID, property ID, guest name, dates, and status

### 3. Add "Webhooks" category to API docs (`src/data/rolos-api-actions.ts`)
- New category: `{ key: "webhooks", label: "Webhooks", icon: "🔔" }`
- Document all 5 actions with params, response examples, and curl/js/php code snippets
- Include supported event types list and HMAC signature verification guidance in descriptions

### 4. Update the downloadable DOCX reference
- Regenerate `public/docs/ROLOS-Developer-REST-API-v3.docx` to include the Webhooks section

## Webhook Event Payload Format
```json
{
  "event": "booking.created",
  "property_id": "uuid",
  "payload": {
    "booking_id": "uuid",
    "guest_name": "John Doe",
    "arrival_date": "2026-04-01",
    "departure_date": "2026-04-05",
    "status": "confirmed",
    "total_amount": 4500,
    "rooms": [...]
  },
  "timestamp": "2026-03-21T10:00:00Z",
  "delivery_id": "uuid"
}
```
Headers: `X-ROL-Signature` (HMAC-SHA256), `X-ROL-Event`, `X-ROL-Delivery`

## Result
- Developers can register webhook URLs via the API and receive real-time push notifications for all booking lifecycle events
- Existing `rolos-webhook-receiver` infrastructure handles queuing, retries (3 attempts), and delivery logging
- Full documentation in both interactive UI and downloadable DOCX

