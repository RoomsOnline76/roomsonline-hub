

# Add Distribution Channel Partners to ConnectIntegrations Page

## Problem
The integrations page only shows direct PMS adapters (ROL'OS Native, Hostfully, NightsBridge, Custom). It's missing the intermediary distribution channels — HyperGuest, HotelBeds, Rentals United, and ProfitRoom — which act as the bridge from ROL'OS to OTAs like Booking.com, Expedia, etc.

## What will be done

### Add a new "Distribution Channels" section to `ConnectIntegrations.tsx`

Between the existing "Integration cards" section and the CTA, add a new section titled **"Distribution & Channel Partners"** with a subtitle explaining these are intermediary links that connect ROL'OS to OTAs and global distribution networks.

Four new cards:

| System | Role | Features |
|---|---|---|
| **HyperGuest** | ROL'OS → HG → Booking.com, Expedia, etc. | PULL model, Live availability, Prebook, Reservations, Static data sync |
| **HotelBeds** | ROL'OS → HotelBeds → Global bedbank network | Rate distribution, Inventory push, Multi-currency, Global reach |
| **Rentals United** | ROL'OS → RU → 60+ vacation rental channels | XML adapter, Property sync, Availability, Pricing, Reservations |
| **ProfitRoom** | ROL'OS → ProfitRoom → CRS & booking engine | Booking engine, Channel manager, Rate plans, Availability sync |

Each card will show a small flow diagram badge (e.g. "ROL'OS → HyperGuest → OTAs") to visually communicate the intermediary role, plus feature bullet points.

### Visual distinction
- Use a different background tint or a subtle "Distribution" tag to distinguish these from direct PMS adapters
- Add a small intro paragraph: "These partners extend your reach to global OTAs and distribution networks. ROL'OS connects to them — they connect you to the world."

## Files Changed

| File | Change |
|---|---|
| `src/pages/connect/ConnectIntegrations.tsx` | Add `DISTRIBUTION_CHANNELS` array and new section with cards between integrations and CTA |

