-- Insert new ROL'OS PMS Agreement contract template
INSERT INTO contract_templates (id, name, description, is_active, created_at, updated_at)
VALUES (
  'b2c3d4e5-f6a7-4890-bcde-f12345678901',
  'ROL''OS PMS Partnership Agreement',
  'Comprehensive agreement for properties using ROL''OS as their Property Management System. Includes standard listing terms plus PMS-specific clauses covering system access, data handling, booking management, and technical support.',
  true,
  now(),
  now()
);

-- Insert the initial version for the ROL'OS PMS template with active status
INSERT INTO contract_template_versions (
  id,
  template_id,
  version_number,
  status,
  content_markdown,
  variables_schema,
  created_at,
  activated_at
)
VALUES (
  'c3d4e5f6-a7b8-4901-cdef-123456789012',
  'b2c3d4e5-f6a7-4890-bcde-f12345678901',
  1,
  'active',
  '# ROL''OS PMS PARTNERSHIP AGREEMENT

**Between:**
- **RoomsOnline (Pty) Ltd** ("RoomsOnline" / "We" / "Us")
- **{{property_name}}** ("The Property" / "You")

**Effective Date:** {{effective_date}}

---

## PART A: ACCOMMODATION LISTING & DISTRIBUTION

### 1. INTRODUCTION
This Agreement governs the partnership between RoomsOnline and The Property for accommodation listing, distribution, and property management services.

### 2. LISTING SERVICES
2.1. RoomsOnline will list The Property on the Sleep In Africa marketplace and partner distribution channels.
2.2. The Property grants RoomsOnline non-exclusive rights to market and promote the accommodation.
2.3. All property information, images, and pricing will be displayed accurately as provided by The Property.

### 3. COMMISSION STRUCTURE
3.1. The Property agrees to pay RoomsOnline a commission of **{{commission_rate}}** on all bookings generated through RoomsOnline channels.
3.2. Commission is calculated on the total accommodation value excluding additional charges.
3.3. Commission invoices are issued monthly with payment due within 14 days.

### 4. BOOKING MANAGEMENT
4.1. Bookings received through RoomsOnline channels will be communicated to The Property promptly.
4.2. The Property must maintain accurate availability to prevent overbookings.
4.3. Cancellation policies must be clearly communicated and consistently applied.

### 5. PAYMENT COLLECTION
5.1. RoomsOnline may collect payments on behalf of The Property where agreed.
5.2. Guest payments collected by RoomsOnline will be remitted to The Property less applicable commission.
5.3. Payment remittances occur on a weekly or monthly basis as agreed.

### 6. CUSTOMER PROTECTION
6.1. Both parties commit to maintaining high standards of guest service.
6.2. Guest complaints will be handled promptly and professionally.
6.3. RoomsOnline may mediate disputes between The Property and guests.

---

## PART B: ROL''OS PROPERTY MANAGEMENT SYSTEM

### 7. ROL''OS PMS ACCESS
7.1. The Property is granted access to the ROL''OS Property Management System for operational use.
7.2. Access includes the following modules:
   - Reservations & Calendar Management
   - Rate & Inventory Control
   - Guest Profiles & CRM
   - Housekeeping & Maintenance Tracking
   - Reporting & Analytics
   - Channel Integration Management

7.3. ROL''OS access is provided as part of this partnership at no additional subscription cost.

### 8. SYSTEM RESPONSIBILITIES

**8.1. RoomsOnline Responsibilities:**
- Maintain system uptime of 99.5% or higher
- Provide technical support during business hours (Mon-Fri 08:00-17:00 SAST)
- Implement security updates and system improvements
- Provide training materials and documentation
- Back up system data regularly

**8.2. Property Responsibilities:**
- Maintain accurate and current information in the system
- Protect login credentials and user access
- Report technical issues promptly
- Ensure staff are adequately trained on system use
- Comply with system usage policies

### 9. DATA & PRIVACY
9.1. Guest data collected through ROL''OS is jointly controlled by RoomsOnline and The Property.
9.2. Both parties agree to comply with POPIA (Protection of Personal Information Act) requirements.
9.3. Guest data may only be used for legitimate business purposes related to accommodation services.
9.4. RoomsOnline may anonymize and aggregate data for statistical and improvement purposes.

### 10. INTEGRATION & CONNECTIVITY
10.1. ROL''OS may integrate with third-party booking channels on behalf of The Property.
10.2. The Property authorizes RoomsOnline to manage channel connections as agreed.
10.3. Any additional channel integration costs will be communicated before implementation.

### 11. SYSTEM CUSTOMIZATION
11.1. Branding customization (logo, colors) is available for The Property''s operational interface.
11.2. Custom features or integrations may be requested and quoted separately.
11.3. Standard system features are provided as-is with updates applied uniformly.

---

## PART C: GENERAL TERMS

### 12. TERM & TERMINATION
12.1. This Agreement is effective from the date of signature and continues indefinitely.
12.2. Either party may terminate with **30 days written notice**.
12.3. Upon termination:
   - Outstanding commissions remain payable
   - ROL''OS access will be revoked
   - Property data exports will be provided upon request
   - Active bookings must be honored

### 13. INTELLECTUAL PROPERTY
13.1. RoomsOnline retains all rights to the ROL''OS platform and branding.
13.2. The Property retains ownership of their content, images, and branding.
13.3. Each party grants the other limited license to use materials for purposes of this Agreement.

### 14. LIABILITY
14.1. RoomsOnline is not liable for indirect, consequential, or punitive damages.
14.2. Liability is limited to the commission earned in the 12 months preceding any claim.
14.3. The Property indemnifies RoomsOnline against claims arising from property operations.

### 15. DISPUTE RESOLUTION
15.1. Disputes will first be addressed through good faith negotiation.
15.2. Unresolved disputes may be referred to mediation.
15.3. This Agreement is governed by the laws of South Africa, with jurisdiction in the Western Cape.

### 16. GENERAL
16.1. This Agreement constitutes the entire agreement between the parties.
16.2. Amendments must be in writing and signed by both parties.
16.3. Neither party may assign this Agreement without written consent.
16.4. Notices must be sent to the registered email addresses on file.

---

## PROPERTY DETAILS

**Property Name:** {{property_name}}
**Registered Business Name:** {{registered_business_name}}
**Registration Number:** {{registration_number}}
**VAT Number:** {{vat_number}}
**Physical Address:** {{physical_address}}
**Primary Contact:** {{key_representative}}
**Contact Email:** {{contact_email}}
**Contact Phone:** {{contact_phone}}

---

## ACCEPTANCE

By signing below, both parties agree to the terms and conditions of this ROL''OS PMS Partnership Agreement.

**Signature:** ___________________________
**Name:** {{signatory_name}}
**Designation:** {{signatory_designation}}
**Date:** {{signature_date}}

---

*This is an electronic agreement. Digital signatures are legally binding under the ECT Act of South Africa.*',
  '{
    "property_name": {"required": true, "description": "Property trading name"},
    "registered_business_name": {"required": false, "description": "Legal registered business name"},
    "registration_number": {"required": false, "description": "Company registration number"},
    "vat_number": {"required": false, "description": "VAT registration number"},
    "physical_address": {"required": true, "description": "Property physical address"},
    "key_representative": {"required": true, "description": "Primary contact person"},
    "contact_email": {"required": true, "description": "Contact email address"},
    "contact_phone": {"required": false, "description": "Contact phone number"},
    "effective_date": {"required": true, "description": "Contract effective date", "default": "Date of signature"},
    "commission_rate": {"required": true, "description": "Commission percentage", "default": "10%"},
    "signatory_name": {"required": true, "description": "Name of person signing"},
    "signatory_designation": {"required": true, "description": "Title/role of signatory"},
    "signature_date": {"required": true, "description": "Date of signature"}
  }'::jsonb,
  now(),
  now()
);

-- Update the template to reference its current version
UPDATE contract_templates 
SET current_version_id = 'c3d4e5f6-a7b8-4901-cdef-123456789012'
WHERE id = 'b2c3d4e5-f6a7-4890-bcde-f12345678901';