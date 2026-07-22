## Goal
Produce a single .docx matrix that lists every billing configuration currently in the system, its current value, the target value from the attached WhatsApp price sheet, and the required adjustment. Where no default currently exists but the price sheet requires one, mark it clearly.

## Source of truth
**Attached price sheet (authoritative):**
- ROL'OS PMS tiered subscription: 0–9 rooms = R450/mo · 10–19 = R600/mo · 20–50 = R750/mo · 51+ = R925/mo
- ROL'OS Website – Booking Engine: no set-up, no monthly fee, **2% commission** on confirmed bookings
- Channel Manager (Booking.com, Airbnb, LekkeSlaap, Expedia): **R70 per unit per month**

**Current DB (`billing_global_defaults`):**
| Strategy | Commission | Sub fee | Tiers (0-9/10-19/20-50/51+) | White-label | PayFac |
|---|---|---|---|---|---|
| default | 10% | — | — | R0 | 2.5% |
| widget | 8% | — | — | R0 | 2.5% |
| rolos_pms | 2% | R500 | 350 / 450 / 600 / 750 | R0 | 2.5% |
| portfolio_aggregator | 5% | — | — | R0 | 2.5% |
| enterprise_white_label | 0% | R2500 | — | R500 | 2.5% |
| volume_tiered | 8% | — | 350 / 450 / 600 / 750 | R0 | 2.5% |
| payment_facilitator | — | — | — | R0 | 2.5% |

## Deliverable
`/mnt/documents/rolos-billing-matrix.docx` containing:

1. **Header + intro** — purpose, source, date.
2. **Table 1 — ROL'OS PMS tiered subscription**: columns = Tier · Current default (R) · Target (attached) · Δ · Status. Rows for each of the 4 tiers, applied to both `rolos_pms` and `volume_tiered` strategies. Highlights that all four tiers need increases (e.g. 0–9 R350→R450, 51+ R750→R925), and flags the extra `R500` flat `subscription_fee_monthly` on `rolos_pms` as redundant vs. tiers.
3. **Table 2 — ROL'OS Website Booking Engine**: rows for commission (current 10% on `default` → target 2%), set-up fee (none / none), monthly fee (none / none). Flags mismatch on `default` strategy.
4. **Table 3 — Channel Manager (per-unit)**: notes **no current default exists** for a per-unit channel manager fee. Target R70/unit/month. Action = add a new billing line item / column (proposed: `channel_manager_per_unit_fee` on `billing_global_defaults`, or a new `channel_manager` strategy row).
5. **Table 4 — Other strategies (informational)**: `widget`, `portfolio_aggregator`, `enterprise_white_label`, `payment_facilitator` — current values shown, marked "not covered by attached sheet — retain or review".
6. **Legend**: ✅ aligned · ⚠️ needs update · ❌ missing default.
7. **Summary of required changes** (bulleted): concrete list of DB updates to run.

## Technical
- Build with `docx-js` per xlsx/docx skill; US Letter, Arial, brand pink `#E91E8C` accents on headings/table header rows, charcoal text.
- Tables use DXA widths with `columnWidths` matching cell widths; `ShadingType.CLEAR`; cell margins 80/80/120/120.
- QA: convert to PDF via LibreOffice and view every page image before delivery.
- Emit `<presentation-artifact>` tag on completion.

No code or DB changes — document only.
