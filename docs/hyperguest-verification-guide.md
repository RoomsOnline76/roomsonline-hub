# HyperGuest Certification — Verification Guide

This document is intended for the **HyperGuest certification / QA team** verifying the ROLOS ↔ HyperGuest integration.

---

## 1. Portal URL

Your ROLOS contact will send you a URL of the form:

```
https://sleepinafrica.roomsonline.co.za/hyperguest/certification?token=<bearer-token>
```

The token is a single rotating bearer token. If it ever stops working, ask ROLOS to rotate and resend it.

The portal contains two pages:

| Page | URL | Purpose |
|---|---|---|
| **Certification Runner** | `/hyperguest/certification?token=...` | Run the 12-step booking matrix on demand and download full request/response logs. |
| **Reflection Inspector** | `/hyperguest/certification/reflection?token=...` | Read-only view of how HyperGuest data is reflected in ROLOS. |

No login is required. The token alone grants access.

---

## 2. Sandbox property

All certification traffic targets HyperGuest sandbox hotel:

```
Hotel ID: 19912
Environment: sandbox
```

No live payments are captured; the certification flow uses test-card details supplied by HyperGuest.

---

## 3. Running the 12-step certification

1. Open the Certification Runner URL.
2. Click **Run all 12 tests**.
3. Each step's pass/fail, HyperGuest call count, and duration are streamed live.
4. After a successful run, click **Export full booking process logs (JSON)** to download a redacted trace of every HyperGuest request/response across all 12 tests.

The 12 tests are:

| # | Test |
|---|---|
| 1 | Pre-book (1 room, 1 adult) |
| 2 | Booking (1 room, 1 adult) |
| 3 | Booking (1 room, 2 adults + 1 child + 1 infant) |
| 4 | Multi-room (2 rooms: 2A / 1A) |
| 5 | Multi-room (2 rooms: 1A+1C / 2A+1I) |
| 6 | Multi-room (different room types / rate plans) |
| 7 | Same-day booking (1 room, 2 adults) |
| 8 | Currency conversion (EUR) |
| 9 | Nationality-specific (GB) |
| 10 | Cancellation of refundable reservation |
| 11 | Attempted cancellation of non-refundable reservation |
| 12 | Package rate booking |

### Booking timeout & reconciliation

ROLOS waits the **full 300 s** HyperGuest booking timeout. If the response does not arrive (timeout, network error, or HTTP 5xx) the **Booking List API** is queried via the agency reference to reconcile the true booking state — this avoids "confirmed on HyperGuest, failed on ROLOS" discrepancies. All such fallback events are visible in the exported log under `reconciled_via`.

### Rate types

The integration recognises HyperGuest's three rate types — **Net Rate**, **Sell Rate**, and **BAR** — and respects BAR pricing throughout.

### Request headers

Every HyperGuest call is sent with `Accept-Encoding: gzip, deflate`.

---

## 4. Reflection Inspector — verifying how data is reflected

Open the **Reflection inspector** URL. It groups everything HyperGuest asked us to demonstrate into tabs:

| Tab | What you see |
|---|---|
| **Cancellation policies** | Tiered forfeiture timelines stored on the linked property (source: `rolos_policies`). |
| **Board bases** | Per-rate board code (BB / HB / FB / AI), with NRF and Package badges. |
| **Taxes & fees** | Property charges with type, basis (per-night vs per-stay), inclusive/exclusive, mandatory/optional, currency. |
| **Remarks** | Free-text remarks attached to each rate. |
| **Special requests** | Guest special-request capture flow — concrete payloads visible in test logs from Test #2 onward. |
| **Photos** | Property and per-room images with minimum 1024×683 enforcement. |
| **Facilities** | Categorised property facilities. |

The inspector is read-only and is hard-coded to the sandbox property; it cannot be redirected elsewhere by URL manipulation.

---

## 5. Special instructions

- **Payments:** All sandbox bookings use HyperGuest test cards. No real charge is processed.
- **Re-running tests:** You may re-run the certification up to **10 times per hour** (rate-limited per token).
- **Log retention:** Run history (last 10 runs) is visible on the portal. Earlier runs are archived; ask ROLOS if you need an older export.
- **PII redaction:** Sensitive fields (`number`, `cvv`, `email`, `token`, etc.) are masked in exported logs.

---

## 6. Contact

Issues, blocked tests, or questions about the reflection inspector? Please reply to the email thread that delivered your portal URL, or contact the ROLOS integrations team directly.
