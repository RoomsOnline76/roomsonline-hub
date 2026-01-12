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

// Generate signature block HTML for signed contracts
export interface SignatureData {
  signedByName: string;
  signedByEmail: string;
  signedByDesignation?: string;
  signatureImageUrl: string;
  signedAt: string;
}

export interface ContractMetadata {
  contractId: string;
  downloadedAt?: string;
  version?: number;
}

export interface CoveredProperty {
  name: string;
}

export function generateSignatureBlockHTML(signature: SignatureData): string {
  const signedDate = new Date(signature.signedAt).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  
  return `
  <div class="signature-block mt-8 pt-6 border-t-2 border-primary">
    <h2 class="text-lg font-semibold mb-4">SIGNED</h2>
    <div class="grid grid-cols-2 gap-6">
      <div>
        <p class="text-sm font-medium mb-1">For the Establishment:</p>
        <p class="text-sm"><strong>Name:</strong> ${signature.signedByName}</p>
        <p class="text-sm"><strong>Email:</strong> ${signature.signedByEmail}</p>
        ${signature.signedByDesignation ? `<p class="text-sm"><strong>Designation:</strong> ${signature.signedByDesignation}</p>` : ''}
        <p class="text-sm"><strong>Date:</strong> ${signedDate}</p>
      </div>
      <div>
        <p class="text-sm font-medium mb-2">Signature:</p>
        <img src="${signature.signatureImageUrl}" alt="Signature" class="max-h-24 border rounded p-2 bg-white" />
      </div>
    </div>
  </div>
  `;
}

// Generate full signed contract HTML with professional branding (for download/print)
export function generateSignedContractHTML(
  property?: PropertyContractDetails, 
  signature?: SignatureData,
  metadata?: ContractMetadata,
  coveredProperties?: CoveredProperty[]
): string {
  const signedDate = signature?.signedAt 
    ? new Date(signature.signedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  
  const downloadDate = metadata?.downloadedAt 
    ? new Date(metadata.downloadedAt).toLocaleString('en-ZA', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      })
    : new Date().toLocaleString('en-ZA', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });

  const coveredPropertiesList = coveredProperties && coveredProperties.length > 0
    ? coveredProperties.map(p => `<li>${p.name}</li>`).join('')
    : '<li>All properties under this owner</li>';

  const propertySection = property ? `
    <table class="info-table">
      <tr><td class="label">Registered Name</td><td>${property.registeredName || property.name || 'N/A'}</td></tr>
      <tr><td class="label">Registration number</td><td>${property.registrationNumber || 'N/A'}</td></tr>
      <tr><td class="label">VAT number</td><td>${property.vatNumber || 'N/A'}</td></tr>
      <tr><td class="label">Telephone number</td><td>${property.telephone || 'N/A'}</td></tr>
      <tr><td class="label">Mobile number</td><td>${property.mobileNumber || 'N/A'}</td></tr>
      <tr><td class="label">E-mail address</td><td>${property.email || 'N/A'}</td></tr>
      <tr><td class="label">Physical address</td><td>${property.physicalAddress || 'N/A'}</td></tr>
      <tr><td class="label">Postal address</td><td>${property.postalAddress || property.physicalAddress || 'N/A'}</td></tr>
      <tr><td class="label">Key Representative</td><td>${property.keyRepresentative || 'N/A'}</td></tr>
    </table>
  ` : '<p class="placeholder">[Property details will be displayed here]</p>';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signed Contract - ${property?.name || 'Roomsonline Agreement'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      background: #fff;
    }
    
    /* Header */
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #1a1a1a;
    }
    
    .header img {
      max-width: 180px;
      height: auto;
      margin-bottom: 8px;
    }
    
    .tagline {
      font-size: 9pt;
      letter-spacing: 3px;
      color: #666;
      text-transform: uppercase;
      margin-top: 4px;
    }
    
    /* Title */
    h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 20pt;
      font-weight: 600;
      text-align: center;
      margin: 30px 0;
      letter-spacing: -0.5px;
    }
    
    h2 {
      font-family: 'Inter', sans-serif;
      font-size: 12pt;
      font-weight: 600;
      margin: 24px 0 12px 0;
      color: #1a1a1a;
    }
    
    p {
      margin-bottom: 12px;
      text-align: justify;
    }
    
    /* Tables */
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0 24px 0;
      font-size: 10pt;
    }
    
    .info-table td {
      padding: 8px 12px;
      border: 1px solid #ddd;
      vertical-align: top;
    }
    
    .info-table .label {
      width: 180px;
      font-weight: 500;
      background: #f8f8f8;
    }
    
    /* Lists */
    ul, ol {
      margin: 12px 0 20px 24px;
    }
    
    li {
      margin-bottom: 6px;
    }
    
    /* Covered Properties Section */
    .covered-properties {
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 16px 20px;
      margin: 20px 0;
    }
    
    .covered-properties h3 {
      font-size: 11pt;
      font-weight: 600;
      margin-bottom: 10px;
    }
    
    .covered-properties ul {
      margin: 0;
      padding-left: 20px;
    }
    
    .covered-properties li {
      margin-bottom: 4px;
    }
    
    /* Signature Block */
    .signature-block {
      margin-top: 40px;
      padding-top: 24px;
      border-top: 2px solid #1a1a1a;
    }
    
    .signature-block h2 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 14pt;
      margin-bottom: 20px;
    }
    
    .signature-grid {
      display: flex;
      gap: 40px;
    }
    
    .signature-details {
      flex: 1;
    }
    
    .signature-details p {
      margin-bottom: 6px;
      text-align: left;
    }
    
    .signature-image-container {
      flex: 1;
    }
    
    .signature-label {
      font-weight: 500;
      margin-bottom: 8px;
    }
    
    .signature-image {
      max-height: 100px;
      max-width: 250px;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 8px;
      background: #fff;
    }
    
    .signature-placeholder {
      width: 250px;
      height: 80px;
      border: 1px dashed #999;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #666;
      font-style: italic;
      font-size: 10pt;
      background: #fafafa;
    }
    
    /* Footer */
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #ddd;
      font-size: 9pt;
      color: #666;
    }
    
    .footer p {
      margin-bottom: 4px;
      text-align: left;
    }
    
    /* Print Styles */
    @media print {
      body {
        padding: 20px;
        font-size: 10pt;
      }
      
      .header {
        margin-bottom: 24px;
      }
      
      h1 {
        font-size: 16pt;
        margin: 20px 0;
      }
      
      h2 {
        font-size: 11pt;
        margin: 16px 0 8px 0;
      }
      
      .info-table td {
        padding: 6px 10px;
      }
      
      .signature-block {
        page-break-inside: avoid;
      }
      
      .footer {
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
      }
    }
  </style>
</head>
<body>
  <!-- Header with Logo -->
  <div class="header">
    <img src="/images/rol-logo.png" alt="Roomsonline" onerror="this.style.display='none'" />
    <p class="tagline">Strategize • Optimize • Maximize</p>
  </div>

  <h1>ROOMSONLINE ACCOMMODATION LISTING & DISTRIBUTION AGREEMENT</h1>

  <!-- Covered Properties -->
  <div class="covered-properties">
    <h3>This agreement covers the following properties:</h3>
    <ul>
      ${coveredPropertiesList}
    </ul>
  </div>

  <p>
    This Agreement sets out the terms and conditions on which Roomsonline provides online accommodation listing, booking facilitation, payment collection, and related distribution services to accommodation establishments, and the basis upon which the Establishment agrees to be listed and promoted on the Roomsonline platform.
  </p>
  
  <p>
    The parties acknowledge that Roomsonline operates solely as a booking and distribution platform and does not own, manage, or control the Establishment. The Establishment remains solely responsible for the operation of its accommodation business and for the delivery of accommodation services to Customers.
  </p>

  <h2>1. ROOMSONLINE</h2>
  <table class="info-table">
    <tr><td class="label">Registered Name</td><td>Sleep in Africa (Pty) Ltd t/a Roomsonline</td></tr>
    <tr><td class="label">Registration number</td><td>2014012490</td></tr>
    <tr><td class="label">Mobile number</td><td>082 323 8115</td></tr>
    <tr><td class="label">E-mail address</td><td>Carike@roomsonline.co.za</td></tr>
    <tr><td class="label">Physical address</td><td>29 Woodlands Close, Parklands, 7441</td></tr>
    <tr><td class="label">Postal address</td><td>29 Woodlands Close, Parklands, 7441</td></tr>
    <tr><td class="label">Key Representative</td><td>Carike Ligthelm</td></tr>
    <tr><td class="label">Bank account details</td><td>Bank: FNB | Account holder: Sleep in Africa (PTY) LTD | Account: 62453541700 | Branch: 203809</td></tr>
  </table>

  <h2>2. THE PROPERTY</h2>
  ${propertySection}

  <h2>3. COMMISSION AND FEES</h2>
  <p>Roomsonline charges a commission of <strong>ten percent (10%)</strong> (VAT exclusive) of the Total Booking Value for all bookings made via the Roomsonline Software, unless otherwise agreed in writing.</p>

  <h2>4. DEFINITIONS</h2>
  <p>In this Agreement, unless the context indicates otherwise:</p>
  <ul>
    <li><strong>"Roomsonline"</strong>, "we", "us" or "our" means Sleep in Africa (Pty) Ltd trading as Roomsonline.</li>
    <li><strong>"You"</strong> or "your" means the accommodation establishment listed, or seeking to be listed, on the Roomsonline Software, including any authorised representative thereof.</li>
    <li><strong>"Roomsonline Software"</strong> means all websites, applications, systems, databases, and platforms owned, operated, or controlled by Roomsonline, including third-party platforms making use of Roomsonline data.</li>
    <li><strong>"Establishment"</strong> means the accommodation establishment listed or proposed to be listed on the Roomsonline Software.</li>
    <li><strong>"Content"</strong> means all information supplied by you relating to the Establishment, including descriptions, photographs, rates, availability, and related information.</li>
    <li><strong>"Listing"</strong> means the public or private display of the Establishment on the Roomsonline Software.</li>
    <li><strong>"Customer"</strong> means any person who makes or benefits from a booking at the Establishment through the Roomsonline Software.</li>
    <li><strong>"Total Booking Value"</strong> means the full value of a booking, including accommodation, fees, and included services.</li>
    <li><strong>"Applicable Cancellation Policy"</strong> means the cancellation policy applicable to a particular booking at the time of confirmation.</li>
    <li><strong>"Satisfactory Stay"</strong> and <strong>"Unsatisfactory Stay"</strong> have the meanings assigned to them in this Agreement.</li>
  </ul>
  <p>Words in the singular include the plural and vice versa.</p>

  <h2>5. LISTING OF THE ESTABLISHMENT</h2>
  <ol>
    <li>Roomsonline may, acting reasonably and in its discretion, approve, decline, withdraw, or suspend the Listing of any Establishment.</li>
    <li>Roomsonline shall not be liable for any loss arising from the withdrawal or suspension of a Listing.</li>
    <li>Certain categories of establishments may be declined, including those associated with unethical or illegal activities.</li>
    <li>Roomsonline may determine the placement and presentation of Listings at its discretion.</li>
  </ol>

  <h2>6. DELISTING</h2>
  <ol>
    <li>Roomsonline may Delist an Establishment at any time.</li>
    <li>Upon request by the Establishment, Roomsonline will Delist within five (5) business days. Existing confirmed bookings must be honoured.</li>
    <li>No right to continued listing is created by this Agreement.</li>
  </ol>

  <h2>7. CONTENT AND INTELLECTUAL PROPERTY</h2>
  <ol>
    <li>You warrant that all Content is accurate, lawful, and owned or licensed by you.</li>
    <li>You grant Roomsonline a perpetual, royalty-free right to use, adapt, and publish the Content for marketing and operational purposes.</li>
  </ol>

  <h2>8. BOOKINGS AND PAYMENTS</h2>
  <ol>
    <li>Roomsonline acts as payment collection agent for the Establishment.</li>
    <li>Payouts will be made subject to commission deductions and verification of a Satisfactory Stay.</li>
    <li>Roomsonline may withhold payments for up to seven (7) days after checkout.</li>
  </ol>

  <h2>9. NON-DELIVERY AND CUSTOMER PROTECTION</h2>
  <p>Where a Customer experiences an Unsatisfactory Stay or non-delivery, Roomsonline may refund the Customer and recover such amounts from the Establishment.</p>

  <h2>10. CANCELLATIONS AND REFUNDS</h2>
  <ol>
    <li>Cancellations are governed by the Applicable Cancellation Policy.</li>
    <li>Any ambiguity shall be interpreted in favour of the Customer.</li>
  </ol>

  <h2>11. FRAUD AND PAYMENT REVERSALS</h2>
  <p>The Establishment remains responsible for fraudulent or reversed payments.</p>

  <h2>12. OPERATION OF THE ESTABLISHMENT</h2>
  <p>The Establishment remains solely responsible for legal compliance, insurance, staffing, and operations.</p>

  <h2>13. AFFILIATES AND PARTNERS</h2>
  <p>Roomsonline may collaborate with affiliate partners to promote Listings.</p>

  <h2>14. DATA PROTECTION</h2>
  <p>Both parties shall comply with the Protection of Personal Information Act.</p>

  <h2>15. AUTHORITATIVE RECORDS</h2>
  <p>Roomsonline records shall prevail in the event of disputes.</p>

  <h2>16. CHANGES TO THE AGREEMENT</h2>
  <p>Roomsonline may amend this Agreement upon forty-eight (48) hours' notice.</p>

  <h2>17. LIMITATION OF LIABILITY AND INDEMNITY</h2>
  <p>Roomsonline's liability is limited to the commission paid by the Establishment.</p>

  <h2>18. SOFTWARE DISCLAIMER</h2>
  <p>The Roomsonline Software is provided on an "as-is" basis.</p>

  <h2>19. FORCE MAJEURE</h2>
  <p>Neither party shall be liable for failure to perform due to events beyond reasonable control.</p>

  <h2>20. CONFIDENTIALITY</h2>
  <p>Each party shall keep Confidential Information private for three (3) years following termination.</p>

  <h2>21. INDEPENDENT CONTRACTOR</h2>
  <p>The parties act as independent contractors and no partnership or employment relationship is created.</p>

  <h2>22. GOVERNING LAW</h2>
  <p>This Agreement is governed by the laws of South Africa.</p>

  <h2>23. ELECTRONIC SIGNATURES AND ACCEPTANCE</h2>
  <p>This Agreement may be accepted electronically or by conduct and is enforceable in terms of the Electronic Communications and Transactions Act 25 of 2002.</p>

  <!-- Signature Block -->
  ${signature ? `
  <div class="signature-block">
    <h2>SIGNED</h2>
    <div class="signature-grid">
      <div class="signature-details">
        <p><strong>Name:</strong> ${signature.signedByName}</p>
        <p><strong>Email:</strong> ${signature.signedByEmail}</p>
        ${signature.signedByDesignation ? `<p><strong>Designation:</strong> ${signature.signedByDesignation}</p>` : ''}
        <p><strong>Date:</strong> ${signedDate}</p>
      </div>
      <div class="signature-image-container">
        <p class="signature-label">Signature:</p>
        ${signature.signatureImageUrl 
          ? `<img src="${signature.signatureImageUrl}" alt="Signature" class="signature-image" onerror="this.parentElement.innerHTML='<div class=\\'signature-placeholder\\'>Signature on file</div>'" />`
          : `<div class="signature-placeholder">Signature on file</div>`
        }
      </div>
    </div>
  </div>
  ` : ''}

  <!-- Footer -->
  <div class="footer">
    <p><strong>Downloaded:</strong> ${downloadDate}</p>
    ${metadata?.contractId ? `<p><strong>Contract ID:</strong> ${metadata.contractId}${metadata.version ? ` | Version: ${metadata.version}` : ''}</p>` : ''}
  </div>
</body>
</html>
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
