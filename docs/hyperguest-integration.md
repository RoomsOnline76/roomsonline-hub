# HyperGuest Integration

## Endpoints (HG 2.0)

| Purpose       | Method | URL |
|---------------|--------|------|
| Static data   | GET    | `https://hg-static.hyperguest.com/hotels.json` |
| Search (ARI)  | GET    | `https://search-api.hyperguest.io/2.0/` |
| Booking       | POST   | `https://book-api.hyperguest.com/2.0/` |

## Auth
- Header: `Authorization: Bearer <token>` (also sent as `X-Api-Key`)
- Sandbox token is stored in the `HYPERGUEST_AUTH_TOKEN` secret
- Sandbox certification property: **19912**

## Search Contract (GET)

Required query params:
- `checkIn` — `YYYY-MM-DD`
- `nights` — integer
- `guests` — adults per room, joined by `.` for multiple rooms; child ages appended as `-age1,age2`
  - 1 room, 2 adults → `2`
  - 2 rooms, 2 adults each → `2.2`
  - 1 room, 2 adults + 2 children (11,12) → `2-11,12`
- `hotelIds` — comma-separated hotel IDs

Optional:
- `customerNationality` (ISO-3166-1 alpha-2) — strongly encouraged for rate eligibility
- `currency` (ISO-4217)
- `filter.charge=customer|agent`
- `meta[key]=value` — must be echoed identically on the booking request

Always send `Accept-Encoding: gzip, deflate`.

### Example
```
GET https://search-api.hyperguest.io/2.0/?checkIn=2026-07-15&nights=2&guests=2&hotelIds=19912&customerNationality=ZA
Authorization: Bearer <token>
```

## Response Shape (key fields)

```jsonc
{
  "results": [{
    "propertyId": 19912,
    "propertyInfo": { "name": "...", "starRating": 4, "cityName": "..." },
    "remarks": ["..."],         // MUST be shown to guest before booking
    "rooms": [{
      "roomId": 1234,
      "roomTypeCode": "SGL",
      "roomName": "Single Room",
      "numberOfAvailableRooms": 3,
      "settings": { "maxOccupancy": 3, "maxAdultsNumber": 2, ... },
      "ratePlans": [{
        "ratePlanId": 19080,
        "ratePlanCode": "BAR",
        "ratePlanName": "...",
        "board": "BB",
        "remarks": ["..."],     // MUST be shown to guest
        "cancellationPolicies": [{ "daysBefore": 1, "penaltyType": "nights", "amount": 1, ... }],
        "payment": { "charge": "agent|customer", "chargeType": "net|sell", "chargeAmount": { ... } },
        "prices": {
          "net":  { "price": 1234.45, "currency": "EUR", "taxes": [...] },
          "sell": { "price": 1534.45, "currency": "EUR", "taxes": [...] },
          "commission": { "price": 123, "currency": "EUR" },
          "bar":  { "price": 1534.45, "currency": "EUR" },   // never sell below this
          "fees": [...]
        },
        "nightlyBreakdown": [{ "date": "YYYY-MM-DD", "prices": { ... } }],
        "isImmediate": true     // false = on-request
      }]
    }]
  }]
}
```

### Adapter Normalization

`fetchAvailability` maps the HG response into the internal adapter shape:
- `room_types[].room_type_id` ← `room.roomId`
- `room_types[].rate_types[].rate_type_id` ← `ratePlan.ratePlanId`
- `room_types[].rate_types[].selling_rate` ← `prices.sell.price`
- `room_types[].rate_types[].net_total` ← `prices.net.price`
- `room_types[].rate_types[].rates[]` derived from `nightlyBreakdown[]`
- `rooms_available_per_night[].available_units` ← `numberOfAvailableRooms`

## Pre-flight Requirement

ARI lookups require the static catalogue (`pms_room_types_cache` + `pms_rate_types_cache`)
to exist for the property. `ensureStaticCatalogue()` pulls from
`https://hg-static.hyperguest.com/hotels.json` automatically when missing or older
than 24 h. If the static pull fails or returns no rooms, the function returns
HTTP **424** with code `STATIC_CATALOGUE_EMPTY`.

## Cancellation Policy Calculation

Penalty time = `(checkInDate @ cancellationDeadlineHour, property TZ)` minus `timeFromCheckIn × timeFromCheckInType`.

## BAR Rule

The final customer price must **never** be below `prices.bar.price`. Display
`relation: "display"` taxes/fees to the guest before confirmation and on the voucher.

## Compliance Checks (per cert run)

1. Static catalogue present and fresh
2. Availability returns at least one offer
3. `remarks` shown
4. Cancellation policy stored and rendered
5. Taxes & fees split by `included` / `display`
6. BAR not breached
7. Nationality echoed back
8. `meta` round-tripped intact
9. `isImmediate` honoured (pending vs confirmed)
10. Booking push uses `book-api.hyperguest.com/2.0/`
