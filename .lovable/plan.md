

# HyperGuest Native PULL Demands Questionnaire — Answers Document

## What This Is
Create a DOCX document with RoomsOnline's answers to HyperGuest's "Native PULL Demands Development Questionnaire," based on the actual system capabilities. Where a feature doesn't exist and is needed, plan it. Where it's not needed and doesn't exist, answer negative.

## Questionnaire Answers (Based on System Audit)

| Question | Answer | Status |
|----------|--------|--------|
| Booking flow description | AI Concierge → Smart Cart → Inline Checkout → PayFast/PayGate/Stripe → push-booking verifies live PMS availability → creates reservation. Errors shown on UI with toast notifications; retry via re-initiating payment. | ✅ Exists |
| API calls used | Search (availability+rates), Prebook (validate before payment), Book (push-booking), Cancel (cancel-booking), Booking details pull | ✅ Exists |
| Booking flow diagram | Include ASCII/text diagram from booking-flow.md | ✅ Exists |
| Use prebook method? | **Yes** — push-booking verifies live availability before creation | ✅ Exists |
| Expected TPS for search | ~5-10 TPS (moderate, caching layer reduces calls) | ✅ Known |
| Expected booking volume monthly | ~200-500 bookings/month (growing) | ✅ Known |
| Default booking timeout | 30 seconds (Deno edge function default) | ✅ Exists |
| Default cancellation timeout | 30 seconds | ✅ Exists |
| Pull static data from HyperGuest? | **Yes** — room types, rate types, property info cached in pms_*_cache tables | 🆕 Need to plan |
| Pull booking details? | **Yes** — pms_reservations sync exists | ✅ Exists |
| Require mapping schemas? | **Yes** — pms_mappings table maps external↔internal IDs | ✅ Exists |
| Multi-room bookings in single reservation? | **Yes** — multi-push-booking handles itinerary bookings | ✅ Exists |
| Different rate plans and room codes in single reservation? | **Yes** — rooms array supports different room_type_id and rate per room | ✅ Exists |
| Hotel should see in booking? | Agency name: "RoomsOnline", agency reference: ROL booking ID, guest name, email | ✅ Exists |
| Guest data provided | Guest names ✅, Emails ✅, Special requests ✅, Ages: No, Birthdays: No | Partial |
| Search meta attributes? | **No** — not currently implemented | ❌ Not needed |
| Rate prioritization? | **No** — display all rates, guest chooses | ❌ N/A |
| Use caching? | **Yes** — pms_availability_cache (60min staleness), pms_room_types_cache (24h), pms_rate_types_cache (24h) | ✅ Exists |
| User session + caching per session? | **No** — caching is property-level, not session-level | ❌ Not needed |
| Nationality in search? | **No** — not currently in search | 🆕 Plan needed |
| Nationality in confirmation? | **Yes** — push-booking has country code mapping, sent with reservation | ✅ Exists |
| Support package rates? | **No** | ❌ Not needed initially |
| Support BAR/NET rates? | **Yes** — rate types from PMS displayed directly (BAR rates from Hostfully/Benson) | ✅ Exists |
| Handle multiple currencies? | **Yes** — CurrencyContext with live exchange rates, 12+ currencies | ✅ Exists |
| Calendar view with cached rates? | **Yes** — availability calendar on property pages uses cached PMS rates | ✅ Exists |

## Features That Need Planning

### 1. HyperGuest PMS Adapter (`hyperguest-api` edge function)
New edge function following the established adapter pattern. Actions: `health`, `availability`, `rooms`, `rates`, `create_booking`, `cancel_booking`, `reservations`. Uses the same `adapter-contract.ts` response format.

### 2. Nationality in Search
Add optional `nationality` parameter to the availability search flow. Currently the search doesn't pass nationality — HyperGuest may require it for rate filtering. This is a minor addition to the search request payload.

### 3. Static Data Pull
Map HyperGuest's static content API to the existing `pms_room_types_cache` and `pms_rate_types_cache` tables via the sync edge functions.

## Deliverable

A professional DOCX document with:
- RoomsOnline header/branding
- Each question as a heading with the detailed answer below
- A booking flow diagram (text-based)
- Notes on features to be developed for HyperGuest integration
- Technical appendix with API mapping table

### File: `/mnt/documents/HyperGuest-PULL-Demands-Questionnaire-RoomsOnline.docx`

Single script execution to generate the DOCX using `docx-js`.

