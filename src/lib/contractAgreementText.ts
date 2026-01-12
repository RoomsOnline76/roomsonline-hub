// Contract agreement text generator with dynamic property details

export interface PropertyContractDetails {
  name: string;
  registeredName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  telephone?: string;
  mobileNumber?: string;
  email?: string;
  physicalAddress?: string;
  postalAddress?: string;
  keyRepresentative?: string;
}

// Generate contract HTML with property details
export function generateContractHTML(property?: PropertyContractDetails): string {
  const propertySection = property ? `
  <table class="w-full mb-6 text-sm border-collapse">
    <tbody>
      <tr class="border-b"><td class="py-2 font-medium w-40">Registered Name</td><td>${property.registeredName || property.name || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Registration number</td><td>${property.registrationNumber || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">VAT number</td><td>${property.vatNumber || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Telephone number</td><td>${property.telephone || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Mobile number</td><td>${property.mobileNumber || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">E-mail address</td><td>${property.email || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Physical address</td><td>${property.physicalAddress || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Postal address</td><td>${property.postalAddress || property.physicalAddress || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Key Representative</td><td>${property.keyRepresentative || 'N/A'}</td></tr>
    </tbody>
  </table>
  ` : `<p class="mb-6 text-sm italic text-muted-foreground">[Property details will be displayed here]</p>`;

  return `
<div class="contract-text">
  <h1 class="text-2xl font-bold text-center mb-6">ROOMSONLINE ACCOMMODATION LISTING & DISTRIBUTION AGREEMENT</h1>
  
  <p class="mb-4 text-sm leading-relaxed">
    This Agreement sets out the terms and conditions on which Roomsonline provides online accommodation listing, booking facilitation, payment collection, and related distribution services to accommodation establishments, and the basis upon which the Establishment agrees to be listed and promoted on the Roomsonline platform.
  </p>
  
  <p class="mb-6 text-sm leading-relaxed">
    The parties acknowledge that Roomsonline operates solely as a booking and distribution platform and does not own, manage, or control the Establishment. The Establishment remains solely responsible for the operation of its accommodation business and for the delivery of accommodation services to Customers.
  </p>

  <h2 class="text-lg font-semibold mb-3">1. ROOMSONLINE</h2>
  <table class="w-full mb-6 text-sm border-collapse">
    <tbody>
      <tr class="border-b"><td class="py-1 font-medium w-40">Registered Name</td><td>Sleep in Africa (Pty) Ltd t/a Roomsonline</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Registration number</td><td>2014012490</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Mobile number</td><td>082 323 8115</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">E-mail address</td><td>Carike@roomsonline.co.za</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Physical address</td><td>29 Woodlands Close, Parklands, 7441</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Postal address</td><td>29 Woodlands Close, Parklands, 7441</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Key Representative</td><td>Carike Ligthelm</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Bank account details</td><td>Bank: FNB | Account holder: Sleep in Africa (PTY) LTD | Account: 62453541700 | Branch: 203809</td></tr>
    </tbody>
  </table>

  <h2 class="text-lg font-semibold mb-3">2. THE PROPERTY</h2>
  ${propertySection}

  <h2 class="text-lg font-semibold mb-3">3. COMMISSION AND FEES</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Roomsonline charges a commission of <strong>ten percent (10%)</strong> (VAT exclusive) of the Total Booking Value for all bookings made via the Roomsonline Software, unless otherwise agreed in writing.
  </p>

  <h2 class="text-lg font-semibold mb-3">4. DEFINITIONS</h2>
  <p class="mb-2 text-sm leading-relaxed">In this Agreement, unless the context indicates otherwise:</p>
  <ul class="list-disc pl-6 mb-6 text-sm space-y-1">
    <li><strong>"Roomsonline"</strong>, "we", "us" or "our" means Sleep in Africa (Pty) Ltd trading as Roomsonline.</li>
    <li><strong>"You"</strong> or "your" means the accommodation establishment listed, or seeking to be listed, on the Roomsonline Software, including any authorised representative thereof.</li>
    <li><strong>"Roomsonline Software"</strong> means all websites, applications, systems, databases, and platforms owned, operated, or controlled by Roomsonline, including third‑party platforms making use of Roomsonline data.</li>
    <li><strong>"Establishment"</strong> means the accommodation establishment listed or proposed to be listed on the Roomsonline Software.</li>
    <li><strong>"Content"</strong> means all information supplied by you relating to the Establishment, including descriptions, photographs, rates, availability, and related information.</li>
    <li><strong>"Listing"</strong> means the public or private display of the Establishment on the Roomsonline Software.</li>
    <li><strong>"Customer"</strong> means any person who makes or benefits from a booking at the Establishment through the Roomsonline Software.</li>
    <li><strong>"Total Booking Value"</strong> means the full value of a booking, including accommodation, fees, and included services.</li>
    <li><strong>"Applicable Cancellation Policy"</strong> means the cancellation policy applicable to a particular booking at the time of confirmation.</li>
    <li><strong>"Satisfactory Stay"</strong> and <strong>"Unsatisfactory Stay"</strong> have the meanings assigned to them in this Agreement.</li>
  </ul>
  <p class="mb-6 text-sm">Words in the singular include the plural and vice versa.</p>

  <h2 class="text-lg font-semibold mb-3">5. LISTING OF THE ESTABLISHMENT</h2>
  <ul class="list-decimal pl-6 mb-6 text-sm space-y-2">
    <li>Roomsonline may, acting reasonably and in its discretion, approve, decline, withdraw, or suspend the Listing of any Establishment.</li>
    <li>Roomsonline shall not be liable for any loss arising from the withdrawal or suspension of a Listing.</li>
    <li>Certain categories of establishments may be declined, including those associated with unethical or illegal activities.</li>
    <li>Roomsonline may determine the placement and presentation of Listings at its discretion.</li>
  </ul>

  <h2 class="text-lg font-semibold mb-3">6. DELISTING</h2>
  <ul class="list-decimal pl-6 mb-6 text-sm space-y-2">
    <li>Roomsonline may Delist an Establishment at any time.</li>
    <li>Upon request by the Establishment, Roomsonline will Delist within five (5) business days. Existing confirmed bookings must be honoured.</li>
    <li>No right to continued listing is created by this Agreement.</li>
  </ul>

  <h2 class="text-lg font-semibold mb-3">7. CONTENT AND INTELLECTUAL PROPERTY</h2>
  <ul class="list-decimal pl-6 mb-6 text-sm space-y-2">
    <li>You warrant that all Content is accurate, lawful, and owned or licensed by you.</li>
    <li>You grant Roomsonline a perpetual, royalty‑free right to use, adapt, and publish the Content for marketing and operational purposes.</li>
  </ul>

  <h2 class="text-lg font-semibold mb-3">8. BOOKINGS AND PAYMENTS</h2>
  <ul class="list-decimal pl-6 mb-6 text-sm space-y-2">
    <li>Roomsonline acts as payment collection agent for the Establishment.</li>
    <li>Payouts will be made subject to commission deductions and verification of a Satisfactory Stay.</li>
    <li>Roomsonline may withhold payments for up to seven (7) days after checkout.</li>
  </ul>

  <h2 class="text-lg font-semibold mb-3">9. NON‑DELIVERY AND CUSTOMER PROTECTION</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Where a Customer experiences an Unsatisfactory Stay or non‑delivery, Roomsonline may refund the Customer and recover such amounts from the Establishment.
  </p>

  <h2 class="text-lg font-semibold mb-3">10. CANCELLATIONS AND REFUNDS</h2>
  <ul class="list-decimal pl-6 mb-6 text-sm space-y-2">
    <li>Cancellations are governed by the Applicable Cancellation Policy.</li>
    <li>Any ambiguity shall be interpreted in favour of the Customer.</li>
  </ul>

  <h2 class="text-lg font-semibold mb-3">11. FRAUD AND PAYMENT REVERSALS</h2>
  <p class="mb-6 text-sm leading-relaxed">
    The Establishment remains responsible for fraudulent or reversed payments.
  </p>

  <h2 class="text-lg font-semibold mb-3">12. OPERATION OF THE ESTABLISHMENT</h2>
  <p class="mb-6 text-sm leading-relaxed">
    The Establishment remains solely responsible for legal compliance, insurance, staffing, and operations.
  </p>

  <h2 class="text-lg font-semibold mb-3">13. AFFILIATES AND PARTNERS</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Roomsonline may collaborate with affiliate partners to promote Listings.
  </p>

  <h2 class="text-lg font-semibold mb-3">14. DATA PROTECTION</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Both parties shall comply with the Protection of Personal Information Act.
  </p>

  <h2 class="text-lg font-semibold mb-3">15. AUTHORITATIVE RECORDS</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Roomsonline records shall prevail in the event of disputes.
  </p>

  <h2 class="text-lg font-semibold mb-3">16. CHANGES TO THE AGREEMENT</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Roomsonline may amend this Agreement upon forty‑eight (48) hours' notice.
  </p>

  <h2 class="text-lg font-semibold mb-3">17. LIMITATION OF LIABILITY AND INDEMNITY</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Roomsonline's liability is limited to the commission paid by the Establishment.
  </p>

  <h2 class="text-lg font-semibold mb-3">18. SOFTWARE DISCLAIMER</h2>
  <p class="mb-6 text-sm leading-relaxed">
    The Roomsonline Software is provided on an "as‑is" basis.
  </p>

  <h2 class="text-lg font-semibold mb-3">19. FORCE MAJEURE</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Neither party shall be liable for failure to perform due to events beyond reasonable control.
  </p>

  <h2 class="text-lg font-semibold mb-3">20. CONFIDENTIALITY</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Each party shall keep Confidential Information private for three (3) years following termination.
  </p>

  <h2 class="text-lg font-semibold mb-3">21. INDEPENDENT CONTRACTOR</h2>
  <p class="mb-6 text-sm leading-relaxed">
    The parties act as independent contractors and no partnership or employment relationship is created.
  </p>

  <h2 class="text-lg font-semibold mb-3">22. GOVERNING LAW</h2>
  <p class="mb-6 text-sm leading-relaxed">
    This Agreement is governed by the laws of South Africa.
  </p>

  <h2 class="text-lg font-semibold mb-3">23. ELECTRONIC SIGNATURES AND ACCEPTANCE</h2>
  <p class="mb-6 text-sm leading-relaxed">
    This Agreement may be accepted electronically or by conduct and is enforceable in terms of the Electronic Communications and Transactions Act 25 of 2002.
  </p>
</div>
`;
}

// Generate plain text version for emails
export function generateContractPlainText(property?: PropertyContractDetails): string {
  const propertySection = property ? `
Registered Name: ${property.registeredName || property.name || 'N/A'}
Registration number: ${property.registrationNumber || 'N/A'}
VAT number: ${property.vatNumber || 'N/A'}
Telephone number: ${property.telephone || 'N/A'}
Mobile number: ${property.mobileNumber || 'N/A'}
E-mail address: ${property.email || 'N/A'}
Physical address: ${property.physicalAddress || 'N/A'}
Postal address: ${property.postalAddress || property.physicalAddress || 'N/A'}
Key Representative: ${property.keyRepresentative || 'N/A'}
` : '[Property details will be displayed here]';

  return `ROOMSONLINE ACCOMMODATION LISTING & DISTRIBUTION AGREEMENT

This Agreement sets out the terms and conditions on which Roomsonline provides online accommodation listing, booking facilitation, payment collection, and related distribution services to accommodation establishments, and the basis upon which the Establishment agrees to be listed and promoted on the Roomsonline platform.

The parties acknowledge that Roomsonline operates solely as a booking and distribution platform and does not own, manage, or control the Establishment. The Establishment remains solely responsible for the operation of its accommodation business and for the delivery of accommodation services to Customers.

1. ROOMSONLINE

Registered Name: Sleep in Africa (Pty) Ltd t/a Roomsonline
Registration number: 2014012490
Mobile number: 082 323 8115
E-mail address: Carike@roomsonline.co.za
Physical address: 29 Woodlands Close, Parklands, 7441
Key Representative: Carike Ligthelm
Bank account details: Bank: FNB | Account holder: Sleep in Africa (PTY) LTD | Account: 62453541700 | Branch: 203809

2. THE PROPERTY

${propertySection}

3. COMMISSION AND FEES

Roomsonline charges a commission of ten percent (10%) (VAT exclusive) of the Total Booking Value for all bookings made via the Roomsonline Software, unless otherwise agreed in writing.

4. DEFINITIONS

In this Agreement, unless the context indicates otherwise:

"Roomsonline", "we", "us" or "our" means Sleep in Africa (Pty) Ltd trading as Roomsonline.

"You" or "your" means the accommodation establishment listed, or seeking to be listed, on the Roomsonline Software, including any authorised representative thereof.

"Roomsonline Software" means all websites, applications, systems, databases, and platforms owned, operated, or controlled by Roomsonline, including third-party platforms making use of Roomsonline data.

"Establishment" means the accommodation establishment listed or proposed to be listed on the Roomsonline Software.

"Content" means all information supplied by you relating to the Establishment, including descriptions, photographs, rates, availability, and related information.

"Listing" means the public or private display of the Establishment on the Roomsonline Software.

"Customer" means any person who makes or benefits from a booking at the Establishment through the Roomsonline Software.

"Total Booking Value" means the full value of a booking, including accommodation, fees, and included services.

"Applicable Cancellation Policy" means the cancellation policy applicable to a particular booking at the time of confirmation.

"Satisfactory Stay" and "Unsatisfactory Stay" have the meanings assigned to them in this Agreement.

Words in the singular include the plural and vice versa.

5. LISTING OF THE ESTABLISHMENT

5.1 Roomsonline may, acting reasonably and in its discretion, approve, decline, withdraw, or suspend the Listing of any Establishment.

5.2 Roomsonline shall not be liable for any loss arising from the withdrawal or suspension of a Listing.

5.3 Certain categories of establishments may be declined, including those associated with unethical or illegal activities.

5.4 Roomsonline may determine the placement and presentation of Listings at its discretion.

6. DELISTING

6.1 Roomsonline may Delist an Establishment at any time.

6.2 Upon request by the Establishment, Roomsonline will Delist within five (5) business days. Existing confirmed bookings must be honoured.

6.3 No right to continued listing is created by this Agreement.

7. CONTENT AND INTELLECTUAL PROPERTY

7.1 You warrant that all Content is accurate, lawful, and owned or licensed by you.

7.2 You grant Roomsonline a perpetual, royalty-free right to use, adapt, and publish the Content for marketing and operational purposes.

8. BOOKINGS AND PAYMENTS

8.1 Roomsonline acts as payment collection agent for the Establishment.

8.2 Payouts will be made subject to commission deductions and verification of a Satisfactory Stay.

8.3 Roomsonline may withhold payments for up to seven (7) days after checkout.

9. NON-DELIVERY AND CUSTOMER PROTECTION

Where a Customer experiences an Unsatisfactory Stay or non-delivery, Roomsonline may refund the Customer and recover such amounts from the Establishment.

10. CANCELLATIONS AND REFUNDS

10.1 Cancellations are governed by the Applicable Cancellation Policy.

10.2 Any ambiguity shall be interpreted in favour of the Customer.

11. FRAUD AND PAYMENT REVERSALS

The Establishment remains responsible for fraudulent or reversed payments.

12. OPERATION OF THE ESTABLISHMENT

The Establishment remains solely responsible for legal compliance, insurance, staffing, and operations.

13. AFFILIATES AND PARTNERS

Roomsonline may collaborate with affiliate partners to promote Listings.

14. DATA PROTECTION

Both parties shall comply with the Protection of Personal Information Act.

15. AUTHORITATIVE RECORDS

Roomsonline records shall prevail in the event of disputes.

16. CHANGES TO THE AGREEMENT

Roomsonline may amend this Agreement upon forty-eight (48) hours' notice.

17. LIMITATION OF LIABILITY AND INDEMNITY

Roomsonline's liability is limited to the commission paid by the Establishment.

18. SOFTWARE DISCLAIMER

The Roomsonline Software is provided on an "as-is" basis.

19. FORCE MAJEURE

Neither party shall be liable for failure to perform due to events beyond reasonable control.

20. CONFIDENTIALITY

Each party shall keep Confidential Information private for three (3) years following termination.

21. INDEPENDENT CONTRACTOR

The parties act as independent contractors and no partnership or employment relationship is created.

22. GOVERNING LAW

This Agreement is governed by the laws of South Africa.

23. ELECTRONIC SIGNATURES AND ACCEPTANCE

This Agreement may be accepted electronically or by conduct and is enforceable in terms of the Electronic Communications and Transactions Act 25 of 2002.
`;
}
