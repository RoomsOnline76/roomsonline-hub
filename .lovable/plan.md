
# Enhance Terms of Service for PayGate/PayFast Compliance

## Overview
Update the Terms of Service page to comply with PayGate/PayFast (Network International) Internet Merchant Requirements. The uploaded document specifies mandatory T&C sections that must be displayed for card processing compliance.

---

## Current State Analysis

**Existing Terms of Service** contains:
- Acceptance of Terms
- Description of Service
- User Accounts
- Booking Terms (Reservations, Pricing, Cancellations)
- User Responsibilities
- Intellectual Property
- Limitation of Liability
- Governing Law
- Changes to Terms
- Contact Information

**Missing PayGate Requirements** (from the IMR document):
1. Detailed Description of Goods/Services
2. Delivery Policy
3. Export Restriction
4. Returns and Refunds Policy
5. Customer Privacy Policy reference
6. Payment Options Accepted (card types)
7. Card Security Statement (SSL3/PayFast)
8. Customer Details Separate from Card Details
9. Merchant Outlet Country and Transaction Currency
10. Responsibility Statement
11. Country of Domicile
12. Company Information

---

## Implementation Plan

### File: `src/pages/TermsOfService.tsx`

Restructure and enhance the Terms of Service to include all PayGate-mandated sections:

**New Section Structure:**
1. **Acceptance of Terms** (keep existing)
2. **Description of Service** (enhance with detailed goods/services description)
3. **Payment Terms** (NEW - major section)
   - 3.1 Payment Options Accepted (Visa, MasterCard, Diners, American Express, bank transfer)
   - 3.2 Payment Security (PayFast/PayGate, SSL encryption, no card storage on site)
   - 3.3 Customer Details Separation (card details entered on PayFast secure site)
   - 3.4 Transaction Currency (ZAR only)
   - 3.5 Merchant Outlet Country (South Africa)
4. **Booking & Delivery Policy** (enhance existing booking terms)
   - Confirmation process and timeframes
   - Booking voucher delivery method
5. **Export Restriction** (NEW - South African clients only for SA properties)
6. **Returns and Refunds Policy** (NEW)
   - Unavailability refunds (within 30 days)
   - Cancellation fees per property policy
   - Administration fee structure
7. **User Accounts** (keep existing)
8. **User Responsibilities** (keep existing)
9. **Intellectual Property** (keep existing)
10. **Liability and Responsibility** (enhance)
    - Merchant responsibility statement
    - Dispute resolution
11. **Privacy** (NEW - link to Privacy Policy + PayFast reference)
12. **Governing Law and Domicile** (enhance with domicilium citandi et executandi)
13. **Variation of Terms** (enhance existing)
14. **Company Information** (NEW - RoomsOnline company details)
15. **Contact Information** (keep existing)

---

## Key Content to Add

### Payment Security Statement
```text
Card transactions are acquired for RoomsOnline via PayFast by Network, 
the approved payment gateway for South African Acquiring Banks. PayFast 
uses Secure Socket Layer 3 (SSL3) encryption and no card details are 
stored on this website. View the PayFast security certificate at 
https://payfast.io/
```

### Payment Options
```text
Payment may be made via Visa, MasterCard, Diners or American Express 
Cards, or by bank transfer. Card details are entered directly on 
PayFast's secure site - RoomsOnline does not store card information.
```

### Merchant Responsibility
```text
RoomsOnline takes responsibility for all aspects relating to the 
transaction including sale of services on this website, customer 
service and support, dispute resolution and delivery of booking 
confirmations.
```

### Domicile Statement
```text
This website is governed by the laws of South Africa and RoomsOnline 
chooses as its domicilium citandi et executandi for all purposes under 
this agreement, whether in respect of court process, notice, or other 
documents or communication of whatsoever nature, the registered 
business address.
```

---

## Technical Implementation

### Changes to `src/pages/TermsOfService.tsx`:
- Add new sections for PayGate compliance
- Update section numbering
- Add PayFast links (https://payfast.io/, https://payfast.io/privacy-policy/)
- Add company registration details placeholder
- Maintain existing visual styling (consistent with current design)

### No Database Changes Required
This is a pure frontend content update.

### No Edge Function Changes
The addpay-api edge function can remain as-is for now (separate task to replace with PayGate integration).

---

## Note on AddPay Removal
The codebase still contains AddPay edge functions and references. Fully removing AddPay and implementing PayGate payment processing would be a separate, larger task involving:
- New PayGate edge function
- Database column renaming
- System health check updates

This plan focuses on the Terms of Service compliance update only.
