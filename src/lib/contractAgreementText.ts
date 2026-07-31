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

// ROL Logo URL for reliable display in contract HTML (absolute URL works better for print-to-PDF)
const ROL_LOGO_URL = 'https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png';

export interface SignatureData {
  signedByName: string;
  signedByEmail: string;
  signedByDesignation?: string;
  signatureImageUrl: string;
  signedAt: string;
}

export interface ContractMetadata {
  contractId: string;
  downloadedAt: string;
  version: number;
}

export interface CoveredProperty {
  name: string;
  address?: string;
  city?: string;
  country?: string;
  property_type?: string;
}

/**
 * Fee terms resolved from the property/portfolio billing config
 * (see `resolveBillingContractVariables`). When omitted the generic
 * "as per the agreed fee schedule" wording is used — never a hardcoded rate.
 */
export interface ContractFeeTerms {
  listing_commission_clause?: string;
  pms_commission_clause?: string;
  fee_schedule_table?: string;
}

const NA_MARKER = '<!-- N/A -->';
const clean = (v?: string) => (!v || v.trim() === NA_MARKER ? '' : v);

function renderFeeSection(feeTerms?: ContractFeeTerms): string {
  const listing = clean(feeTerms?.listing_commission_clause);
  const pms = clean(feeTerms?.pms_commission_clause);
  const table = clean(feeTerms?.fee_schedule_table);

  if (!listing && !pms && !table) {
    return `<p class="mb-6 text-sm leading-relaxed">
    Roomsonline charges commission and fees in accordance with the fee schedule agreed with the Property, as reflected in the Property's billing configuration and any written variation thereof.
  </p>`;
  }

  return `
  ${listing ? `<p class="mb-3 text-sm leading-relaxed">${listing}</p>` : ''}
  ${pms ? `<p class="mb-3 text-sm leading-relaxed">${pms}</p>` : ''}
  ${table ? `<h3 class="text-base font-semibold mb-2">Annexure A — Fee Schedule</h3>${table}` : ''}
`;
}

// Generate contract HTML with property details
export function generateContractHTML(
  property?: PropertyContractDetails,
  coveredProperties?: CoveredProperty[],
  feeTerms?: ContractFeeTerms,
): string {
  const effectiveProperty: PropertyContractDetails | undefined = property || (coveredProperties?.[0] ? {
    name: coveredProperties[0].name,
    physicalAddress: [coveredProperties[0].address, coveredProperties[0].city, coveredProperties[0].country].filter(Boolean).join(', '),
  } : undefined);


  const propertySection = effectiveProperty ? `
  <table class="w-full mb-6 text-sm border-collapse">
    <tbody>
      <tr class="border-b"><td class="py-2 font-medium w-40">Registered Name</td><td>${effectiveProperty.registeredName || effectiveProperty.name || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Registration number</td><td>${effectiveProperty.registrationNumber || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">VAT number</td><td>${effectiveProperty.vatNumber || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Telephone number</td><td>${effectiveProperty.telephone || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Mobile number</td><td>${effectiveProperty.mobileNumber || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">E-mail address</td><td>${effectiveProperty.email || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Physical address</td><td>${effectiveProperty.physicalAddress || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Postal address</td><td>${effectiveProperty.postalAddress || effectiveProperty.physicalAddress || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Key Representative</td><td>${effectiveProperty.keyRepresentative || 'N/A'}</td></tr>
    </tbody>
  </table>
  ` : `<p class="mb-6 text-sm italic text-muted-foreground">[Property details will be displayed here]</p>`;

  const coveredPropertiesSection = coveredProperties && coveredProperties.length > 0 ? `
  <div class="mb-6 p-4 bg-muted/30 rounded-lg border">
    <h3 class="text-base font-semibold mb-3">Properties Covered by This Agreement (${coveredProperties.length})</h3>
    <ul class="list-disc pl-5 space-y-1 text-sm">
      ${coveredProperties.map(p => {
        const location = [p.address, p.city, p.country].filter(Boolean).join(', ');
        return `<li><strong>${p.name}</strong>${p.property_type ? ` (${p.property_type})` : ''}${location ? `<br/><span class="text-muted-foreground">${location}</span>` : ''}</li>`;
      }).join('')}
    </ul>
  </div>
  ` : '';

  return `
<div class="contract-text">
  <h1 class="text-2xl font-bold text-center mb-6">ROOMSONLINE ACCOMMODATION LISTING & DISTRIBUTION AGREEMENT</h1>
  
  <p class="mb-4 text-sm leading-relaxed">
    This Agreement sets out the terms and conditions on which Roomsonline provides online accommodation listing, booking facilitation, payment collection, and related distribution services to accommodation establishments.
  </p>

  <h2 class="text-lg font-semibold mb-3">1. ROOMSONLINE</h2>
  <table class="w-full mb-6 text-sm border-collapse">
    <tbody>
      <tr class="border-b"><td class="py-1 font-medium w-40">Registered Name</td><td>Sleep in Africa (Pty) Ltd t/a Roomsonline</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Registration number</td><td>2014012490</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Mobile number</td><td>082 323 8115</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">E-mail address</td><td>sleepinafrica@roomsonline.co.za</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Physical address</td><td>29 Woodlands Close, Parklands, 7441</td></tr>
    </tbody>
  </table>

  <h2 class="text-lg font-semibold mb-3">2. THE PROPERTY and/or PORTFOLIO</h2>
  ${propertySection}
  ${coveredPropertiesSection}

  <h2 class="text-lg font-semibold mb-3">3. COMMISSION AND FEES</h2>
  ${renderFeeSection(feeTerms)}

</div>
`;
}

// Generate signature block HTML
export function generateSignatureBlockHTML(signature?: SignatureData): string {
  if (!signature) {
    return `
      <div class="signature-block">
        <p style="color: #666; font-style: italic;">Contract not yet signed</p>
      </div>
    `;
  }

  const signedDate = new Date(signature.signedAt).toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return `
    <div class="signature-block" style="margin-top: 40px; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h3 style="margin-bottom: 16px; font-size: 14pt; font-weight: 600;">Authorized Signature</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 4px 0; font-weight: 500;">Signed by:</td><td>${signature.signedByName}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: 500;">Email:</td><td>${signature.signedByEmail}</td></tr>
        ${signature.signedByDesignation ? `<tr><td style="padding: 4px 0; font-weight: 500;">Designation:</td><td>${signature.signedByDesignation}</td></tr>` : ''}
        <tr><td style="padding: 4px 0; font-weight: 500;">Date:</td><td>${signedDate}</td></tr>
      </table>
      ${signature.signatureImageUrl ? `
        <div style="margin-top: 16px;">
          <p style="font-weight: 500; margin-bottom: 8px;">Signature:</p>
          <img src="${signature.signatureImageUrl}" alt="Signature" style="max-height: 100px; max-width: 250px; border: 1px solid #ddd; border-radius: 4px; padding: 8px; background: #fff;" />
        </div>
      ` : ''}
    </div>
  `;
}

// Generate complete signed contract HTML for PDF download
export function generateSignedContractHTML(
  property?: PropertyContractDetails,
  signature?: SignatureData,
  metadata?: ContractMetadata,
  coveredProperties?: CoveredProperty[]
): string {
  const coveredPropertiesList = coveredProperties && coveredProperties.length > 0
    ? coveredProperties.map(p => {
        const location = [p.address, p.city, p.country].filter(Boolean).join(', ');
        return `<li><strong>${p.name}</strong>${p.property_type ? ` (${p.property_type})` : ''}${location ? ` - ${location}` : ''}</li>`;
      }).join('')
    : '<li>No properties specified</li>';

  const propertySection = property ? `
    <table class="info-table">
      <tr><td class="label">Registered Name</td><td>${property.registeredName || property.name || 'N/A'}</td></tr>
      <tr><td class="label">Email</td><td>${property.email || 'N/A'}</td></tr>
    </table>
  ` : '';

  const signatureBlockHtml = generateSignatureBlockHTML(signature);
  const downloadDate = metadata?.downloadedAt ? new Date(metadata.downloadedAt).toLocaleDateString('en-ZA') : new Date().toLocaleDateString('en-ZA');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Roomsonline Partnership Agreement</title>
  <style>
    @page { margin: 20mm; size: A4; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #2c5530; }
    .header img { max-width: 180px; height: auto; display: block; margin: 0 auto 8px auto; }
    .tagline { font-size: 10pt; color: #666; font-style: italic; margin-top: 8px; }
    h1 { font-size: 18pt; color: #2c5530; margin-bottom: 20px; text-align: center; }
    h2 { font-size: 13pt; color: #2c5530; margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
    h3 { font-size: 12pt; margin-bottom: 8px; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .info-table td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; }
    .info-table .label { font-weight: 600; width: 180px; }
    .covered-properties { margin: 20px 0; padding: 16px; background: #f9f9f9; border-radius: 8px; }
    .covered-properties ul { margin: 8px 0; padding-left: 20px; }
    .covered-properties li { margin-bottom: 4px; }
    .signature-block { margin-top: 40px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; page-break-inside: avoid; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 9pt; color: #666; }
    @media print { body { padding: 0; } .signature-block { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${ROL_LOGO_URL}" alt="Roomsonline" />
    <p class="tagline">Strategize • Optimize • Maximize</p>
  </div>

  <h1>ROOMSONLINE ACCOMMODATION LISTING & DISTRIBUTION AGREEMENT</h1>

  <div class="covered-properties">
    <h3>This agreement covers the following properties:</h3>
    <ul>${coveredPropertiesList}</ul>
  </div>

  <p>This Agreement sets out the terms and conditions on which Roomsonline provides online accommodation listing, booking facilitation, payment collection, and related distribution services.</p>

  <h2>1. ROOMSONLINE</h2>
  <table class="info-table">
    <tr><td class="label">Registered Name</td><td>Sleep in Africa (Pty) Ltd t/a Roomsonline</td></tr>
    <tr><td class="label">Registration number</td><td>2014012490</td></tr>
    <tr><td class="label">E-mail address</td><td>Carike@roomsonline.co.za</td></tr>
  </table>

  <h2>2. THE PROPERTY</h2>
  ${propertySection}

  <h2>3. COMMISSION</h2>
  <p>Roomsonline charges a commission of <strong>ten percent (10%)</strong> (VAT exclusive) of the Total Booking Value.</p>

  ${signatureBlockHtml}
  
  <div class="footer">
    ${metadata?.contractId ? `<p>Contract ID: ${metadata.contractId}</p>` : ''}
    <p>Downloaded: ${downloadDate}</p>
    <p>This is an official Roomsonline contract document.</p>
  </div>
</body>
</html>`;
}

export function generateContractPlainText(property?: PropertyContractDetails): string {
  return `ROOMSONLINE ACCOMMODATION LISTING & DISTRIBUTION AGREEMENT

This Agreement sets out the terms and conditions on which Roomsonline provides services.

Property: ${property?.name || 'N/A'}
Email: ${property?.email || 'N/A'}

Commission: 10% (VAT exclusive) of Total Booking Value.
`;
}

export function generatePdfFromDynamicTemplate(
  templateHtml: string,
  signature?: SignatureData,
  metadata?: ContractMetadata,
  logoBase64?: string
): string {
  const logoSrc = logoBase64 || ROL_LOGO_URL;
  const signatureBlockHtml = generateSignatureBlockHTML(signature);
  const downloadDate = metadata?.downloadedAt ? new Date(metadata.downloadedAt).toLocaleDateString('en-ZA') : new Date().toLocaleDateString('en-ZA');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Roomsonline Partnership Agreement</title>
  <style>
    body { font-family: Georgia, serif; font-size: 11pt; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2c5530; padding-bottom: 20px; }
    .header img { max-width: 180px; height: auto; display: block; margin: 0 auto 8px; }
    .tagline { font-size: 10pt; color: #666; font-style: italic; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 9pt; color: #666; }
    @media print { body { padding: 20px; } .signature-block { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Roomsonline" />
    <p class="tagline">Strategize • Optimize • Maximize</p>
  </div>
  
  ${templateHtml}
  
  ${signatureBlockHtml}
  
  <div class="footer">
    ${metadata?.contractId ? `<p>Contract ID: ${metadata.contractId}</p>` : ''}
    <p>Downloaded: ${downloadDate}</p>
    <p>This is an official Roomsonline contract document.</p>
  </div>
</body>
</html>`;
}
