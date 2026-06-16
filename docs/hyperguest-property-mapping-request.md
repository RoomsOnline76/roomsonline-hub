# Email Draft — HyperGuest Property Mapping / OTA Cross-Reference

**To:** integrations@hyperguest.com (cc your HG integration manager)
**From:** ROL'OS Engineering
**Subject:** Distributor token — request for OTA → HG property mapping (Booking.com `hotel_id` ⇄ HG `propertyId`)

---

Hi team,

ROL'OS is now live on your 2.0 distributor API (certification 10/10 passed, account *<insert account name / token alias>*). We're rolling out a feature where properties already onboarded with us enter their **Booking.com `hotel_id`** in our channel manager, and we'd like to use HyperGuest as the live ARI source for those properties instead of polling Booking.com directly.

To do that we need to resolve `bookingDotCom.hotel_id → hyperguest.propertyId` server-side. Two options would work for us — whichever fits your platform best:

1. **Lookup endpoint** on the distributor API, e.g.
   `GET /2.0/property/lookup?ota=booking_com&ota_property_id=12345`
   returning the HG `propertyId` (and ideally the active rate plans).

2. **Mapping export** (CSV / JSON feed, refreshed daily) of every property under our token with their OTA cross-references (`booking_com`, `expedia`, `agoda`, `airbnb` where applicable).

A few specific questions:

- Is either option available on our current token scope? If it requires a token upgrade, please let us know what's involved.
- For properties **not** contracted with us on HG, can we still receive read-only ARI if the owner authorises it through HG, or does the property have to be in our distribution contract?
- Confirm the canonical OTA identifier names HG uses internally (`booking_com` vs `bookingdotcom` vs `bdc`, etc.) so our mapping matches yours.
- Rate limits on the lookup endpoint (if option 1) — we'd expect ~1 call per property per onboarding, cached thereafter.

Happy to jump on a quick call if easier.

Thanks,
*<your name>*
ROL'OS Engineering
