## Update ROLOS Billing Matrix (v3)

Produce `/mnt/documents/rolos-billing-matrix-v3.docx` (versioned; keeps v2 intact).

### 1. Add PriceLabs add-on row to every strategy

New "Revenue Add-ons" row inserted into each of the 7 strategy tables (Default, Widget, ROL'OS PMS, Portfolio Aggregator, Enterprise White-Label, Volume Tiered, Payment Facilitator):

- **Default per-property fee:** R250 / property / month (billed alongside subscription line).
- **Portfolio sliding scale** (applied when admin toggles "Apply to all in portfolio"):
  - 1–5 properties: R250 each (R250 flat)
  - 6–15: R200 each
  - 16–30: R160 each
  - 31–60: R130 each
  - 61+: R100 each
- Notes: gated by admin `pricelabs_allowed`, billed as separate `pricelabs_fee` transaction.

### 2. Side-by-side sales rep commission column

Add a **Sales Rep Commission** column to each strategy table, showing what a rep earns *per that revenue derivative*, split by tier:

| Tier | Year 1 (of ROL'OS-collected revenue) | Residual | Duration |
|------|--------------------------------------|----------|----------|
| Base | 20% | 5% | 12 mo |
| Accelerated | 25% | 7.5% | 18 mo |
| Elite | 30% | 10% | 24 mo |

For each strategy, list what portions are commissionable (subscription, transaction %, PriceLabs add-on, white-label fee, etc.) and which are pass-through (payment processing fees).

### 3. Addendum — Sales rep earnings worked examples

New "Addendum A: Rep Earnings Scenarios" section with:

**A. Per-model single-property examples** (Base / Accelerated / Elite side-by-side)
- Widget-only property (R120k/yr GMV)
- ROL'OS PMS property (R450 base + 2% × R900k GMV + R250 PriceLabs)
- ROL'OS PMS + White-label buy-in
- Portfolio Aggregator (10 properties at R650 each)
- Enterprise White-Label (R925 × 20 properties + PriceLabs sliding)

**B. Real-world mix scenario (ROLOS-weighted)** — the "expected" rep book:
- 70% ROL'OS PMS clients (target aquisition focus)
- 15% Widget-only
- 10% Portfolio properties
- 5% Enterprise white-label
- 60% adopt PriceLabs

Show 12-month and 24-month cumulative earnings for a rep who closes 3 / 6 / 12 accounts per quarter, at each tier. Include a "primary ROLOS focus" summary row highlighting the earnings advantage of driving ROL'OS PMS signups vs widget-only.

### 4. Formatting

Match v2 styles (Instrument Sans / Geist Mono where used, brand pink `#E91E8C` for headers), keep same 8.5×11 layout. Add a change-log note referencing v2.

### QA

After generation, convert all pages to images and inspect each for layout/overflow before delivering.
