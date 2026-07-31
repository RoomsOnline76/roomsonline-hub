import { RepCommissionTerms } from "@/lib/repContractTerms";

const ROL_LOGO_URL = "https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png";

export interface RepAgreementRep {
  display_name: string;
  rep_code: string;
  email: string;
  phone?: string | null;
}

export interface RepSignature {
  signedByName: string;
  signedByEmail: string;
  signatureImageUrl: string;
  signedAt: string;
}

/** Variables available to a `sales_rep` contract template. */
export function repAgreementVariables(
  rep: RepAgreementRep,
  terms: RepCommissionTerms,
): Record<string, string> {
  return {
    rep_name: rep.display_name,
    rep_code: rep.rep_code,
    rep_email: rep.email,
    rep_phone: rep.phone || "N/A",
    rep_tier_label: terms.tier_label,
    rep_first_year_rate: `${terms.first_year_rate}%`,
    rep_residual_rate: `${terms.residual_rate}%`,
    rep_residual_months: String(terms.residual_months),
    rep_clawback_days: String(terms.clawback_days),
    rep_target: terms.quarterly_target != null ? String(terms.quarterly_target) : "N/A",
    effective_date: new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" }),
  };
}

function termsTable(terms: RepCommissionTerms): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;font-weight:600;width:280px;">${k}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;">${v}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;">
    ${row("Commission tier", terms.tier_label)}
    ${row("First-year commission", `${terms.first_year_rate}% of net platform revenue`)}
    ${row("Residual commission", `${terms.residual_rate}% of net platform revenue`)}
    ${row("Residual period", `${terms.residual_months} months from referral date`)}
    ${row("Clawback window", `${terms.clawback_days} days`)}
    ${row("Quarterly target", terms.quarterly_target != null ? `${terms.quarterly_target} signed properties` : "By arrangement")}
  </table>`;
}

/** Default rep agreement body used when no `sales_rep` template is active. */
export function generateRepAgreementHTML(
  rep: RepAgreementRep,
  terms: RepCommissionTerms,
): string {
  return `
<div class="contract-body">
  <h1 class="text-xl font-semibold mb-4">ROOMSONLINE SALES REPRESENTATIVE AGREEMENT</h1>

  <p class="mb-4 text-sm leading-relaxed">
    This Agreement is entered into between <strong>Sleep in Africa (Pty) Ltd t/a Roomsonline</strong>
    (registration number 2014012490) and <strong>${rep.display_name}</strong> (rep code
    <strong>${rep.rep_code}</strong>), and records the commission terms applicable to properties
    referred by the Representative.
  </p>

  <h2 class="text-lg font-semibold mb-3">1. THE REPRESENTATIVE</h2>
  <table class="w-full mb-6 text-sm border-collapse">
    <tbody>
      <tr class="border-b"><td class="py-2 font-medium w-40">Name</td><td>${rep.display_name}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Rep code</td><td>${rep.rep_code}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">E-mail address</td><td>${rep.email}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Contact number</td><td>${rep.phone || "N/A"}</td></tr>
    </tbody>
  </table>

  <h2 class="text-lg font-semibold mb-3">2. COMMISSION TERMS</h2>
  <p class="mb-3 text-sm leading-relaxed">
    The Representative earns commission on net platform revenue actually invoiced by Roomsonline to
    properties they referred and which converted. Pass-through payment charges (payment facilitator
    surcharges and own-gateway fees) are excluded from the commission base.
  </p>
  ${termsTable(terms)}

  <h2 class="text-lg font-semibold mb-3 mt-6">3. NEGOTIATED RATES</h2>
  <p class="mb-4 text-sm leading-relaxed">
    Where a specific property is signed on negotiated terms that differ from the rates above, the
    negotiated rate recorded against that property's referral applies to that property only. All other
    referrals remain on the tier rates in clause 2.
  </p>

  <h2 class="text-lg font-semibold mb-3">4. CLAWBACK</h2>
  <p class="mb-4 text-sm leading-relaxed">
    Should a referred property churn within ${terms.clawback_days} days of activation, commission paid
    in respect of that property is reversed against future commission runs.
  </p>

  <h2 class="text-lg font-semibold mb-3">5. TIER MOVEMENT</h2>
  <p class="mb-4 text-sm leading-relaxed">
    Tier placement is reviewed against the criteria published in the Roomsonline billing defaults.
    A change in tier applies from the commission period following the review and does not alter
    commission already earned.
  </p>
</div>`;
}

/** Full standalone HTML document for the signed rep agreement (print/PDF). */
export function generateSignedRepAgreementHTML(
  rep: RepAgreementRep,
  terms: RepCommissionTerms,
  bodyHtml: string,
  signature?: RepSignature,
): string {
  const signedDate = signature
    ? new Date(signature.signedAt).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })
    : "";

  const signatureBlock = signature
    ? `<div class="signature-block">
        <h3>Authorised Signature</h3>
        <table class="info-table">
          <tr><td class="label">Signed by</td><td>${signature.signedByName}</td></tr>
          <tr><td class="label">Email</td><td>${signature.signedByEmail}</td></tr>
          <tr><td class="label">Date</td><td>${signedDate}</td></tr>
        </table>
        ${signature.signatureImageUrl ? `<img src="${signature.signatureImageUrl}" alt="Signature" style="max-height:100px;max-width:250px;border:1px solid #ddd;border-radius:4px;padding:8px;background:#fff;" />` : ""}
      </div>`
    : `<div class="signature-block"><p style="color:#666;font-style:italic;">Agreement not yet signed</p></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Roomsonline Sales Representative Agreement — ${rep.display_name}</title>
  <style>
    @page { margin: 20mm; size: A4; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #2c5530; }
    .header img { max-width: 180px; height: auto; display: block; margin: 0 auto 8px auto; }
    h1 { font-size: 18pt; color: #2c5530; margin-bottom: 20px; }
    h2 { font-size: 13pt; color: #2c5530; margin-top: 24px; margin-bottom: 12px; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .info-table td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; }
    .info-table .label { font-weight: 600; width: 180px; }
    .signature-block { margin-top: 40px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; page-break-inside: avoid; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 9pt; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${ROL_LOGO_URL}" alt="Roomsonline" />
  </div>
  ${bodyHtml}
  ${signatureBlock}
  <div class="footer">
    <p>Tier at signature: ${terms.tier_label} · ${terms.first_year_rate}% year 1 · ${terms.residual_rate}% residual for ${terms.residual_months} months</p>
    <p>This is an official Roomsonline contract document.</p>
  </div>
</body>
</html>`;
}
