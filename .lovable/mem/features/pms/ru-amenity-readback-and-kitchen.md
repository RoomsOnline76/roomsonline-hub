---
name: Channel amenity read-back and kitchen coherence
description: Channel stores every pushed amenity (verified by read-back); public listing shows only highlights; dictionary id 101 = "Separate kitchen"
type: feature
---

Verified via `rentalsunited-api` `get_property` (needs `owner_id` for the owning account, else status 56 "Property does not exist"):

- Every ROLOS-selected amenity is accepted and stored at the channel (29 ids on unit 5655615, including kitchenware, appliances, bathroom 81 and WC 37 derived from composition counts). The public "What this place offers" block only renders a curated highlight subset — a short list there is **not** a push failure. Never diagnose "amenities not pushed" without a read-back.
- Dictionary id **101 ("Kitchen") is rendered as "Separate kitchen"** on OTA listings. ROLOS therefore treats the Kitchen amenity and the `separate_kitchen` / unit `separateKitchen` flag as one fact: selecting or clearing either mirrors the other (`src/lib/ruKitchen.ts`). Kitchenette is 157 and does not set the flag.
