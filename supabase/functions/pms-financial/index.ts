// ============================================================================
// PMS FINANCIAL ENGINE v3.0
// Payments, refunds, invoices, tax, deposits, gateway hooks, reconciliation
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Human label for a distribution channel key. ROL'OS surfaces never name the
 * upstream vendor — channel-manager bookings collapse to "ROL'OS Channels".
 */
function channelLabel(key: string | null | undefined): string {
  const k = String(key || "").toLowerCase();
  if (!k) return "Direct";
  const map: Record<string, string> = {
    direct: "Direct",
    legacy_direct: "Direct",
    embed: "Website widget",
    rol_itinerary: "ROL Itinerary",
    rentals_united: "ROL'OS Channels",
    rentalsunited: "ROL'OS Channels",
    channel_manager: "ROL'OS Channels",
    ota: "OTA",
    manual: "Manual / Front desk",
  };
  return map[k] || key!;
}

/** Escape any value before it lands in the HTML document. */
function esc(value: unknown): string {
  if (value == null) return "";
  const raw = typeof value === "object" ? "" : String(value);
  return raw.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);
}

/** Documents may only ever print plain strings — objects become empty, never "[object Object]". */
function plain(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(plain).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return [o.line1, o.address_line1, o.address_line2, o.street, o.city, o.postal_code, o.province, o.country]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

interface InvoiceBrandTokens {
  accent: string;
  dark: string;
  font: string;
  muted: string;
  pageBg: string;
  panelBg: string;
  rule: string;
  headingFont: string;
  bodyFont: string;
}

/** Brand tokens mirroring the guest confirmation email (ivory / charcoal / accent). */
function invoiceBrandTokens(property: any): InvoiceBrandTokens {
  const isRol = !!property?.is_rol_property;
  const hasColors = !!property?.brand_primary_color;
  const isBranded = isRol ? hasColors : (!!property?.brand_override_enabled && hasColors);
  return {
    accent: isBranded ? property.brand_primary_color : "#e91e8c",
    dark: (isBranded && property?.brand_dark_bg_color) || "#1a1a2e",
    font: (isBranded && property?.brand_font_color) || "#2b2b33",
    muted: (isBranded && property?.brand_muted_text_color) || "#6b6b78",
    pageBg: (isBranded && property?.brand_light_bg_color) || "#f6f3ee",
    panelBg: "#faf8f5",
    rule: "#e7e1d8",
    headingFont: (isBranded && property?.brand_heading_font)
      ? `'${property.brand_heading_font}', Georgia, 'Times New Roman', serif`
      : `Georgia, 'Times New Roman', serif`,
    bodyFont: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`,
  };
}

interface InvoiceExtras {
  guest?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    nationality?: string | null;
  } | null;
  rooms?: Array<{
    name: string;
    basis?: string | null;
    occupancy?: string | null;
    dates?: string | null;
  }>;
  payments?: Array<{ label: string; amount: number; date?: string | null; method?: string | null }>;
  amountPaid?: number;
  deposit?: { amount?: number | null; due_date?: string | null } | null;
  cancellation?: string | null;
  terms?: string[];
  contact?: { phone?: string | null; email?: string | null; website?: string | null; address?: string | null } | null;
  bookingReference?: string | null;
  paymentMode?: string | null;
  banking?: Record<string, unknown> | null;
  paymentReference?: string | null;
}

function generateInvoiceHTML(
  invoice: any,
  transactions: any[],
  property: any,
  branding: any,
  extras: InvoiceExtras = {},
): string {
  const t = invoiceBrandTokens(property);
  const isProForma = invoice?.document_kind === "pro_forma";
  const businessName = plain(branding?.business_name) || plain(property?.name) || "Property";
  const businessAddress = plain(branding?.business_address) ||
    [plain(property?.address), plain(property?.city), plain(property?.postal_code), plain(property?.country)]
      .filter(Boolean)
      .join(", ");
  const amenities = property?.amenities || {};
  const amenityVatNumber = plain(amenities?.vat_number);
  const vatNumber = plain(branding?.vat_number) || amenityVatNumber;
  const isVatRegistered = !!branding?.is_vat_registered || !!amenityVatNumber;
  const logoUrl = plain(property?.brand_logo_url);
  const currency = plain(invoice.currency) || "ZAR";
  const money = (n: number) => `${currency} ${Number(n || 0).toFixed(2)}`;

  const charges = transactions.filter((x: any) => (x.amount || 0) > 0);
  const txPayments = transactions.filter((x: any) => (x.amount || 0) < 0);

  // Guest-facing line clarity: group charges by revenue stream so the guest (or
  // their accounts team) can see accommodation separately from food & beverage.
  const streamOf = (x: any): "accommodation" | "fnb" | "other" => {
    const raw = String(x.revenue_stream || "").toLowerCase();
    if (raw === "fnb" || raw === "other" || raw === "accommodation") return raw as any;
    const text = `${x.transaction_type || ""} ${x.description || ""}`.toLowerCase();
    if (/breakfast|dinner|lunch|meal|restaurant|bar |beverage|food/.test(text)) return "fnb";
    if (/accommodation|room rate|stay charge|booking total|night/.test(text)) return "accommodation";
    return "other";
  };
  const sectionMeta: Array<{ key: "accommodation" | "fnb" | "other"; label: string }> = [
    { key: "accommodation", label: "Accommodation" },
    { key: "fnb", label: "Food &amp; Beverage" },
    { key: "other", label: "Other Charges" },
  ];
  const grouped = sectionMeta
    .map((s) => {
      const items = charges.filter((x: any) => streamOf(x) === s.key);
      return { ...s, items, total: items.reduce((sum: number, x: any) => sum + Number(x.amount || 0), 0) };
    })
    .filter((s) => s.items.length > 0);
  const showSections = grouped.length > 1;

  const lineRow = (x: any) => `
      <tr>
        <td style="padding:9px 14px;border-bottom:1px solid ${t.rule};font-size:13px;color:${t.font};${showSections ? "padding-left:26px;" : ""}">${esc(plain(x.description) || "Charge")}</td>
        <td style="padding:9px 14px;border-bottom:1px solid ${t.rule};text-align:right;font-size:13px;color:${t.font};">${Number(x.amount).toFixed(2)}</td>
      </tr>`;

  const chargeRows = showSections
    ? grouped.map((s) => `
      <tr>
        <td style="padding:11px 14px;border-bottom:1px solid ${t.rule};font-size:11px;text-transform:uppercase;letter-spacing:1.4px;color:${t.accent};">${s.label}</td>
        <td style="padding:11px 14px;border-bottom:1px solid ${t.rule};"></td>
      </tr>
      ${s.items.map(lineRow).join("")}
      <tr>
        <td style="padding:6px 14px;border-bottom:1px solid ${t.rule};font-size:12px;color:${t.muted};">${s.label} subtotal</td>
        <td style="padding:6px 14px;border-bottom:1px solid ${t.rule};text-align:right;font-size:12px;font-weight:600;color:${t.muted};">${s.total.toFixed(2)}</td>
      </tr>`).join("")
    : charges.map(lineRow).join("");

  const streamSummaryRows = showSections
    ? grouped.map((s) => `
      <tr>
        <td style="padding:4px 16px;font-size:12px;color:${t.muted};">${s.label}</td>
        <td style="padding:4px 16px;text-align:right;font-size:12px;color:${t.muted};">${s.total.toFixed(2)}</td>
      </tr>`).join("")
    : "";

  // Payments: gateway/EFT records with their method, plus any folio credit lines.
  const gatewayPayments = (extras.payments || []).map((p) => ({
    label: [p.label, p.method ? `(${p.method})` : "", p.date ? `· ${p.date}` : ""].filter(Boolean).join(" "),
    amount: Math.abs(Number(p.amount || 0)),
  }));
  const folioPayments = txPayments.map((x: any) => ({
    label: plain(x.description) || "Payment",
    amount: Math.abs(Number(x.amount || 0)),
  }));
  const allPayments = gatewayPayments.length ? gatewayPayments : folioPayments;
  const paidTotal = extras.amountPaid != null
    ? Number(extras.amountPaid)
    : allPayments.reduce((s, p) => s + p.amount, 0);
  const total = Number(invoice.total || 0);
  const balance = Math.round((total - paidTotal) * 100) / 100;

  const paymentRows = allPayments.map((p) => `
      <tr>
        <td style="padding:9px 14px;border-bottom:1px solid ${t.rule};font-size:13px;color:#15803d;">${esc(p.label)}</td>
        <td style="padding:9px 14px;border-bottom:1px solid ${t.rule};text-align:right;font-size:13px;color:#15803d;">(${p.amount.toFixed(2)})</td>
      </tr>`).join("");

  const docTitle = isProForma ? "PRO FORMA INVOICE" : (isVatRegistered ? "TAX INVOICE" : "INVOICE");

  const billToKindLabel = ({
    guest: "Guest",
    company: "Company",
    agent: "Travel agent / operator",
    channel: "Channel",
  } as Record<string, string>)[String(invoice.bill_to_type || "guest")] || "";

  const commissionRate = Number(invoice.commission_rate || 0);
  const commissionAmount = Number(invoice.commission_amount || 0);
  const netPayable = invoice.net_payable != null ? Number(invoice.net_payable) : null;
  const commissionRows = commissionAmount > 0 ? `
      <tr>
        <td style="padding:6px 16px;font-size:12px;color:${t.muted};">Commission${commissionRate > 0 ? ` (${commissionRate.toFixed(2)}%)` : ""}</td>
        <td style="padding:6px 16px;text-align:right;font-size:12px;color:${t.muted};">(${commissionAmount.toFixed(2)})</td>
      </tr>
      ${netPayable != null ? `<tr>
        <td style="padding:6px 16px;font-weight:600;font-size:13px;">Net payable</td>
        <td style="padding:6px 16px;text-align:right;font-weight:600;font-size:13px;">${netPayable.toFixed(2)}</td>
      </tr>` : ""}` : "";

  // ── Layout primitives, matching the guest confirmation email ───────────────
  const sectionBlock = (title: string, inner: string) => inner
    ? `
    <div style="margin:0 0 26px;border-top:1px solid ${t.rule};padding-top:20px;">
      <p style="margin:0 0 12px;font-family:${t.headingFont};font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${t.accent};">${title}</p>
      ${inner}
    </div>`
    : "";

  const kvRows = (rows: Array<[string, unknown]>) => {
    const visible = rows.filter(([, v]) => !!plain(v));
    if (!visible.length) return "";
    return `
      <table style="width:100%;border-collapse:collapse;">
        ${visible.map(([label, v]) => `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:${t.muted};vertical-align:top;">${label}</td>
          <td style="padding:6px 0;font-size:13px;color:${t.font};font-weight:600;text-align:right;vertical-align:top;">${esc(plain(v))}</td>
        </tr>`).join("")}
      </table>`;
  };

  const textLines = (text: string) => {
    const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      return `<p style="margin:0;font-size:13px;line-height:1.65;color:${t.font};">${esc(text.trim())}</p>`;
    }
    return `<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:${t.font};">${lines
      .map((l) => `<li style="margin:0 0 4px;">${esc(l.replace(/^[-•*]\s*/, ""))}</li>`)
      .join("")}</ul>`;
  };

  // Accommodation reserved — which unit(s) the guest actually booked.
  const roomsBlock = (extras.rooms || []).length
    ? `<table style="width:100%;border-collapse:collapse;">${(extras.rooms || []).map((r) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid ${t.rule};">
            <div style="font-size:14px;font-weight:600;color:${t.font};">${esc(r.name)}</div>
            <div style="font-size:12px;color:${t.muted};">${esc([r.basis, r.occupancy, r.dates].filter(Boolean).join(" · "))}</div>
          </td>
        </tr>`).join("")}</table>`
    : "";

  const guest = extras.guest || {};
  const guestBlock = kvRows([
    ["Name", guest.name],
    ["Email", guest.email],
    ["Phone", guest.phone],
    ["Address", guest.address],
    ["Nationality", guest.nationality],
  ]);

  const depositAmount = Number(extras.deposit?.amount || 0);
  const settlementRows: Array<[string, unknown]> = [
    ["Invoice total", money(total)],
    ["Paid to date", paidTotal > 0 ? `-${money(paidTotal)}` : money(0)],
  ];
  if (depositAmount > 0 && balance > 0) {
    settlementRows.push(["Deposit due", money(depositAmount)]);
    if (extras.deposit?.due_date) settlementRows.push(["Deposit due by", extras.deposit.due_date]);
  }
  const statusLabel = balance <= 0.009
    ? "PAID IN FULL"
    : paidTotal > 0
      ? "PART PAID"
      : "AWAITING PAYMENT";
  const statusColor = balance <= 0.009 ? "#15803d" : t.accent;
  const settlementBlock = `
      ${kvRows(settlementRows)}
      <div style="margin-top:12px;padding:14px 16px;background:${t.panelBg};border-left:3px solid ${statusColor};border-radius:4px;">
        <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${statusColor};">${statusLabel}</div>
        <div style="margin-top:4px;font-size:18px;font-weight:700;color:${t.font};">
          ${balance > 0.009 ? `Balance owing: ${money(balance)}` : `Nothing further due`}
        </div>
      </div>`;

  const banking = extras.banking || null;
  const bankingBlock = banking
    ? kvRows([
        ["Account holder", (banking as any).account_holder],
        ["Bank", (banking as any).bank_name],
        ["Account number", (banking as any).account_number || (banking as any).account_number_masked],
        ["Account type", (banking as any).account_type],
        ["Branch code", (banking as any).branch_code],
        ["SWIFT / BIC", (banking as any).swift_code],
        ["Payment reference", extras.paymentReference || invoice.invoice_number],
      ])
    : "";

  const contact = extras.contact || {};
  const contactBlock = kvRows([
    ["Telephone", contact.phone],
    ["Email", contact.email],
    ["Website", contact.website],
    ["Address", contact.address || businessAddress],
  ]);

  const termsBlock = (extras.terms || []).filter(Boolean).length
    ? `<ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.7;color:${t.muted};">${(extras.terms || [])
        .filter(Boolean)
        .map((line) => `<li style="margin:0 0 4px;">${esc(line)}</li>`)
        .join("")}</ul>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${docTitle} ${esc(invoice.invoice_number)}</title></head>
<body style="margin:0;padding:0;background-color:${t.pageBg};font-family:${t.bodyFont};color:${t.font};">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" style="width:100%;max-width:720px;border-collapse:collapse;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(26,26,46,0.08);">

        <tr>
          <td style="padding:28px 32px;background:${t.dark};">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="vertical-align:top;">
                  ${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(businessName)}" style="max-height:56px;max-width:190px;display:block;margin-bottom:8px;" />` : ""}
                  <div style="font-family:${t.headingFont};font-size:24px;color:#ffffff;letter-spacing:0.4px;">${esc(businessName)}</div>
                  ${businessAddress ? `<div style="margin-top:6px;font-size:12px;color:rgba(255,255,255,0.7);">${esc(businessAddress)}</div>` : ""}
                  ${isVatRegistered && vatNumber && !isProForma ? `<div style="margin-top:4px;font-size:12px;color:rgba(255,255,255,0.7);">VAT No: ${esc(vatNumber)}</div>` : ""}
                </td>
                <td style="vertical-align:top;text-align:right;">
                  <div style="font-family:${t.headingFont};font-size:16px;letter-spacing:2.4px;text-transform:uppercase;color:${t.accent};">${docTitle}</div>
                  <div style="margin-top:8px;font-size:13px;color:#ffffff;font-family:monospace;">${esc(invoice.invoice_number)}</div>
                  <div style="margin-top:4px;font-size:12px;color:rgba(255,255,255,0.7);">Issued: ${esc(invoice.issued_date || new Date().toISOString().split("T")[0])}</div>
                  ${invoice.due_date ? `<div style="font-size:12px;color:rgba(255,255,255,0.7);">Due: ${esc(invoice.due_date)}</div>` : ""}
                  ${extras.bookingReference ? `<div style="margin-top:4px;font-size:12px;color:rgba(255,255,255,0.7);">Booking: ${esc(extras.bookingReference)}</div>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr><td style="padding:28px 32px 8px;">

          ${isProForma ? `<p style="margin:0 0 22px;padding:12px 14px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px;font-size:12px;color:#92400e;">This is a <strong>pro forma invoice</strong> — a quotation of charges for your upcoming stay. It is not a tax invoice and cannot be used for VAT purposes. A final invoice will be issued after your stay.</p>` : ""}

          ${sectionBlock(`Invoiced to${billToKindLabel ? ` &middot; ${billToKindLabel}` : ""}`, kvRows([
            ["Name", invoice.invoice_to],
            ["Address", invoice.bill_to?.address],
            ["VAT No", invoice.bill_to?.vat_number],
            ["Payment terms", invoice.bill_to?.terms_days ? `${invoice.bill_to.terms_days} days` : ""],
          ]))}

          ${sectionBlock("Guest details", guestBlock)}

          ${sectionBlock("Stay", kvRows([
            ["Arriving", invoice.stay?.check_in],
            ["Departing", invoice.stay?.check_out],
            ["Nights", invoice.stay?.nights],
            ["Guests", invoice.stay?.guests],
            ["Channel", invoice.channel_label],
            ["Reference", extras.bookingReference || invoice.reference],
          ]))}

          ${sectionBlock("Accommodation reserved", roomsBlock)}

          <div style="margin:0 0 22px;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:${t.panelBg};">
                  <th style="padding:11px 14px;text-align:left;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${t.muted};border-bottom:1px solid ${t.rule};">Description</th>
                  <th style="padding:11px 14px;text-align:right;width:130px;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${t.muted};border-bottom:1px solid ${t.rule};">Amount</th>
                </tr>
              </thead>
              <tbody>${chargeRows}</tbody>
            </table>
          </div>

          <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
            <tr><td></td><td style="width:320px;">
              <table style="width:100%;border-collapse:collapse;">
                ${streamSummaryRows}
                <tr>
                  <td style="padding:6px 16px;font-size:13px;color:${t.muted};">Subtotal</td>
                  <td style="padding:6px 16px;text-align:right;font-size:13px;">${Number(invoice.subtotal || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 16px;font-size:13px;color:${t.muted};">Tax${isVatRegistered ? " (incl. VAT)" : ""}</td>
                  <td style="padding:6px 16px;text-align:right;font-size:13px;">${Number(invoice.tax_total || 0).toFixed(2)}</td>
                </tr>
                <tr style="border-top:2px solid ${t.accent};">
                  <td style="padding:10px 16px;font-weight:700;font-size:15px;">Total</td>
                  <td style="padding:10px 16px;text-align:right;font-weight:700;font-size:15px;">${money(total)}</td>
                </tr>
                ${commissionRows}
              </table>
            </td></tr>
          </table>

          ${sectionBlock("Payments received", allPayments.length
            ? `<table style="width:100%;border-collapse:collapse;">${paymentRows}</table>`
            : `<p style="margin:0;font-size:13px;color:${t.muted};">No payments received to date.</p>`)}

          ${sectionBlock("Settlement", settlementBlock)}

          ${bankingBlock && balance > 0.009
            ? sectionBlock("How to pay — bank transfer", `${bankingBlock}<p style="margin:10px 0 0;font-size:12px;color:${t.muted};">Please use the payment reference above and email proof of payment to ${esc(contact.email || "")}.</p>`)
            : ""}

          ${sectionBlock("Cancellation policy", extras.cancellation ? textLines(extras.cancellation) : "")}

          ${sectionBlock("Terms &amp; other information", termsBlock)}

          ${sectionBlock("Property contact", contactBlock)}

          ${invoice.notes ? `<div style="margin:0 0 24px;padding:14px 16px;background:${t.panelBg};border-left:3px solid ${t.rule};border-radius:4px;font-size:13px;color:${t.muted};">${esc(plain(invoice.notes))}</div>` : ""}

        </td></tr>

        <tr>
          <td style="padding:22px 32px 26px;background:${t.panelBg};text-align:center;">
            <p style="margin:0 0 4px;font-family:${t.headingFont};font-size:14px;color:${t.font};">${esc(businessName)}</p>
            <p style="margin:0;font-size:11px;color:${t.muted};">Powered by RoomsOnline · Rooms Done Right</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    // Internal service-to-service calls (e.g. the booking email pipeline) authenticate with the service role key
    const isServiceCall = token === supabaseServiceKey;
    let user: { id: string } | null = null;
    if (!isServiceCall) {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authUser) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = authUser;
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ==================== RECORD PAYMENT ====================
      case "record_payment": {
        const { folio_id, property_id, amount, currency, method, reference, notes } = body;
        const { data: payment, error: payErr } = await supabase
          .from("rolos_payments")
          .insert({
            folio_id,
            property_id,
            amount,
            currency: currency || "ZAR",
            method: method || "cash",
            reference,
            notes,
            status: "completed",
            paid_at: new Date().toISOString(),
            created_by: user?.id ?? null,
          })
          .select()
          .single();
        if (payErr) throw payErr;

        await supabase.from("rolos_folio_transactions").insert({
          folio_id,
          transaction_type: "payment",
          description: `Payment via ${method || "cash"}${reference ? ` (${reference})` : ""}`,
          amount: -Math.abs(amount),
          created_by: user?.id ?? null,
        });

        await updateFolioBalance(supabase, folio_id);

        return new Response(JSON.stringify({ success: true, payment }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== PROCESS REFUND ====================
      case "process_refund": {
        const { payment_id, property_id: refPropId, amount: refAmount, reason } = body;
        const { data: refund, error: refErr } = await supabase
          .from("rolos_refunds")
          .insert({
            payment_id,
            property_id: refPropId,
            amount: refAmount,
            reason,
            status: "processed",
            processed_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (refErr) throw refErr;

        await supabase
          .from("rolos_payments")
          .update({ status: "refunded" })
          .eq("id", payment_id);

        return new Response(JSON.stringify({ success: true, refund }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== GENERATE INVOICE / PRO FORMA ====================
      case "generate_invoice": {
        const {
          property_id: invPropId,
          notes: invNotes,
          booking_id: invBookingId,
          invoice_to: invInvoiceTo,
          reference: invReference,
          bill_to_account_id: reqBillToAccountId,
          channel_key: reqChannelKey,
        } = body;
        const ALLOWED_BILL_TO = ["guest", "company", "agent", "channel"];
        const reqBillToType: string = ALLOWED_BILL_TO.includes(String(body.bill_to_type || ""))
          ? String(body.bill_to_type)
          : "guest";
        const reqCommissionRate = body.commission_rate != null && !Number.isNaN(Number(body.commission_rate))
          ? Number(body.commission_rate)
          : null;
        const documentKind: string = body.document_kind === "pro_forma" ? "pro_forma" : "tax_invoice";
        let invFolioId: string | null = body.folio_id || null;

        // Resolve booking + folio (creating the folio if the booking has none yet)
        let bookingRow: any = null;
        if (invBookingId) {
          const { data: bk } = await supabase
            .from("bookings")
            .select("id, guest_name, guest_email, guest_phone, check_in_date, check_out_date, total_price, status, property_id, company_account_id, agent_account_id, source_account_id, booking_channel, comm_channel, commission_rate_applied, calculated_commission, invoice_to_name, invoice_to_vat, invoice_to_address, deposit_amount, deposit_due_date, rol_reference, payment_status, payment_method, rooms, adults, teens, children, infants, special_requests, room_type_id")
            .eq("id", invBookingId)
            .maybeSingle();

          bookingRow = bk;
          if (!invFolioId) {
            const { data: existingFolio } = await supabase
              .from("rolos_folios")
              .select("id")
              .eq("booking_id", invBookingId)
              .maybeSingle();
            if (existingFolio?.id) {
              invFolioId = existingFolio.id;
            } else {
              const { data: createdFolio } = await supabase
                .from("rolos_folios")
                .insert({ booking_id: invBookingId, property_id: invPropId })
                .select("id")
                .single();
              invFolioId = createdFolio?.id || null;
            }
          }
        }

        if (!invFolioId) {
          return new Response(JSON.stringify({ error: "folio_id or booking_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // A final tax invoice may only be raised once the stay is over / guest checked out
        if (documentKind === "tax_invoice" && bookingRow) {
          const today = new Date().toISOString().split("T")[0];
          const stayEnded = String(bookingRow.check_out_date || "") <= today;
          const checkedOut = ["checked_out", "completed", "departed"].includes(String(bookingRow.status || "").toLowerCase());
          if (!stayEnded && !checkedOut) {
            return new Response(JSON.stringify({
              error: "A tax invoice can only be generated after check-out. Issue a pro forma invoice instead.",
              code: "STAY_NOT_COMPLETE",
            }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }

        const { data: transactionRows } = await supabase
          .from("rolos_folio_transactions")
          .select("*")
          .eq("folio_id", invFolioId)
          .order("created_at");

        const transactions: any[] = [...(transactionRows || [])];
        const bookingTotal = Number(bookingRow?.total_price || 0);
        const positives = transactions.filter((t: any) => (t.amount || 0) > 0);
        const hasAccommodationLine = positives.some((t: any) => {
          const text = `${t.transaction_type || ""} ${t.description || ""}`.toLowerCase();
          return Math.abs(Number(t.amount || 0) - bookingTotal) < 0.01 ||
            text.includes("accommodation") || text.includes("room rate") || text.includes("booking total");
        });
        if (bookingTotal > 0 && !hasAccommodationLine) {
          transactions.unshift({
            id: "accommodation-synthetic",
            description: "Accommodation",
            amount: bookingTotal,
            transaction_type: "accommodation",
          });
        }

        const charges = transactions.filter((t: any) => (t.amount || 0) > 0);
        const subtotal = charges.reduce((sum: number, t: any) => sum + Number(t.amount), 0);

        // Identify refundable deposit charges (excluded from VAT)
        const { data: depositCharges } = await supabase
          .from("rolos_service_charges")
          .select("folio_transaction_id, is_refundable")
          .eq("property_id", invPropId)
          .eq("is_refundable", true);
        const refundableTxIds = new Set((depositCharges || []).map((d: any) => d.folio_transaction_id).filter(Boolean));
        const refundableTotal = charges
          .filter((t: any) => refundableTxIds.has(t.id) || (t.description && t.description.toLowerCase().includes('deposit') && t.description.toLowerCase().includes('refundable')))
          .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

        const { data: taxRules } = await supabase
          .from("rolos_tax_rules")
          .select("*")
          .eq("property_id", invPropId)
          .eq("is_active", true);

        // Apply tax rules only to non-refundable amounts
        const vatableSubtotal = subtotal - refundableTotal;
        let taxTotal = (taxRules || []).reduce((sum: number, rule: any) => {
          return sum + (vatableSubtotal * Number(rule.rate) / 100);
        }, 0);

        // VAT registration is a property-level fact: brand config flag, or a VAT
        // number captured in property setup. It drives both the maths below and
        // the wording on the guest-facing document (tax invoice vs invoice).
        const { data: brandCfgVat } = await supabase
          .from("rolos_brand_config")
          .select("is_vat_registered, vat_rate, vat_number")
          .eq("property_id", invPropId)
          .maybeSingle();
        const { data: propVatData } = await supabase
          .from("properties")
          .select("amenities")
          .eq("id", invPropId)
          .maybeSingle();
        const propVatNumber = (() => {
          const a = (propVatData?.amenities as any) || {};
          const v = a?.vat_number;
          return typeof v === "string" && v.trim() ? v.trim() : null;
        })();
        const vatNumberResolved = (brandCfgVat?.vat_number && String(brandCfgVat.vat_number).trim())
          ? String(brandCfgVat.vat_number).trim()
          : propVatNumber;
        const vatRegistered = !!brandCfgVat?.is_vat_registered || !!vatNumberResolved;
        const vatRateResolved = Number(brandCfgVat?.vat_rate ?? 15);

        // If no explicit tax rules but the property is VAT registered, derive the
        // VAT already contained in the (VAT-inclusive) charges.
        if (taxTotal === 0 && vatRegistered) {
          taxTotal = vatableSubtotal - (vatableSubtotal / (1 + vatRateResolved / 100));
        }

        const vatSummary = {
          registered: vatRegistered,
          rate: vatRateResolved,
          number: vatNumberResolved,
          exempt_total: Math.round(refundableTotal * 100) / 100,
        };


        // ---------------------------------------------------------------------
        // Billing party resolution.
        //
        // Order: what the operator explicitly chose on this document, then the
        // account links already on the booking, then the guest. The resolved
        // identity is *snapshotted* onto the invoice so later CRM edits never
        // rewrite an issued document.
        // ---------------------------------------------------------------------
        let billToType = reqBillToType;
        let billToAccountId: string | null = reqBillToAccountId || null;
        if (!body.bill_to_type) {
          if (bookingRow?.company_account_id) {
            billToType = "company";
            billToAccountId = bookingRow.company_account_id;
          } else if (bookingRow?.agent_account_id) {
            billToType = "agent";
            billToAccountId = bookingRow.agent_account_id;
          }
        }
        if (billToType === "guest" || billToType === "channel") billToAccountId = billToAccountId || null;

        const channelKey: string | null = billToType === "channel"
          ? (reqChannelKey || bookingRow?.booking_channel || bookingRow?.comm_channel || "direct")
          : (reqChannelKey || bookingRow?.booking_channel || null);

        let billTo: {
          name: string | null;
          vat_number: string | null;
          address: string | null;
          terms_days: number | null;
        } = {
          name: bookingRow?.invoice_to_name || null,
          vat_number: bookingRow?.invoice_to_vat || null,
          address: bookingRow?.invoice_to_address || null,
          terms_days: null,
        };

        let accountRow: any = null;
        if (billToAccountId) {
          const { data: acct } = await supabase
            .from("crm_accounts")
            .select("id, name, account_type, vat_number, address_line1, address_line2, city, postal_code, country, default_commission_rate, payment_terms_days")
            .eq("id", billToAccountId)
            .maybeSingle();
          accountRow = acct;
          if (acct) {
            const composed = [
              acct.address_line1,
              acct.address_line2,
              acct.city,
              acct.postal_code,
              acct.country,
            ].filter(Boolean).join(", ");
            billTo = {
              name: acct.name || billTo.name || null,
              vat_number: acct.vat_number || billTo.vat_number || null,
              address: composed || billTo.address || null,
              terms_days: acct.payment_terms_days ?? null,
            };
          }
        }
        if (billToType === "guest") {
          billTo = {
            name: invInvoiceTo || bookingRow?.guest_name || billTo.name || null,
            vat_number: bookingRow?.invoice_to_vat || null,
            address: bookingRow?.invoice_to_address || null,
            terms_days: null,
          };
        }
        if (billToType === "channel" && !billTo.name) {
          billTo.name = channelLabel(channelKey);
        }

        const total = subtotal + taxTotal;

        // Commission held against this document, for channel/agent settlement.
        let commissionRate: number | null = reqCommissionRate;
        if (commissionRate == null) {
          if ((billToType === "agent" || billToType === "company") && accountRow?.default_commission_rate != null) {
            commissionRate = Number(accountRow.default_commission_rate);
          } else if (billToType === "channel") {
            if (bookingRow?.commission_rate_applied != null) {
              commissionRate = Number(bookingRow.commission_rate_applied);
            } else {
              const { data: billingCfg } = await supabase
                .from("property_billing_configs")
                .select("commission_rate, listing_commission_rate")
                .eq("property_id", invPropId)
                .maybeSingle();
              const cfgRate = billingCfg?.listing_commission_rate ?? billingCfg?.commission_rate;
              if (cfgRate != null) commissionRate = Number(cfgRate);
            }
          }
        }
        const commissionAmount = commissionRate != null && commissionRate > 0
          ? Math.round(total * (commissionRate / 100) * 100) / 100
          : null;
        const netPayable = commissionAmount != null
          ? Math.round((total - commissionAmount) * 100) / 100
          : null;

        // ROL numbering strategy: ROL-<DOC>-<PARTY>-<YYYYMM>-<NNN>
        const docCode = documentKind === "pro_forma" ? "PFI" : "TXI";
        const period = new Date().toISOString().slice(0, 7).replace("-", "");
        let invoiceNumber = "";
        try {
          const { data: partyCode } = await supabase.rpc("rol_party_code", {
            _property_id: invPropId,
            _portfolio_id: null,
          });
          const { data: ref } = await supabase.rpc("next_rol_document_reference", {
            _doc: docCode,
            _party_code: partyCode || "GEN",
            _period: period,
          });
          invoiceNumber = String(ref || "");
        } catch (_e) {
          invoiceNumber = "";
        }
        if (!invoiceNumber) {
          invoiceNumber = `ROL-${docCode}-GEN-${period}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
        }

        // Only one live document of each kind per booking — supersede the previous one
        if (invBookingId) {
          await supabase
            .from("rolos_invoices")
            .update({ status: "cancelled" })
            .eq("booking_id", invBookingId)
            .eq("document_kind", documentKind)
            .neq("status", "cancelled");
        }

        const resolvedInvoiceTo = invInvoiceTo || billTo.name || bookingRow?.guest_name || null;

        const { data: invoice, error: invErr } = await supabase
          .from("rolos_invoices")
          .insert({
            folio_id: invFolioId,
            property_id: invPropId,
            booking_id: invBookingId || null,
            document_kind: documentKind,
            invoice_to: resolvedInvoiceTo,
            bill_to_type: billToType,
            bill_to_account_id: billToAccountId,
            bill_to_name: resolvedInvoiceTo,
            bill_to_vat: billTo.vat_number,
            bill_to_address: billTo.address,
            bill_to_terms_days: billTo.terms_days,
            channel_key: channelKey,
            commission_rate: commissionRate,
            commission_amount: commissionAmount,
            net_payable: netPayable,
            due_date: billTo.terms_days
              ? new Date(Date.now() + billTo.terms_days * 86400000).toISOString().split("T")[0]
              : null,
            reference: invReference || null,
            invoice_number: invoiceNumber,
            subtotal,
            tax_total: Math.round(taxTotal * 100) / 100,
            total: Math.round(total * 100) / 100,
            status: "issued",
            notes: invNotes || null,
            created_by: user?.id ?? null,
          })
          .select()
          .single();
        if (invErr) throw invErr;


        const { data: property } = await supabase
          .from("properties")
          .select(
            "name, slug, brand_logo_url, brand_primary_color, brand_secondary_color, brand_font_color, brand_dark_bg_color, brand_muted_text_color, brand_light_bg_color, brand_heading_font, brand_override_enabled, is_rol_property, amenities, payment_mode, address, city, postal_code, country, property_url, latitude, longitude",
          )
          .eq("id", invPropId)
          .maybeSingle();

        // Banking details always accompany a document with a balance owing —
        // reservation-only stays settle by EFT, and part-paid stays still need them.
        const { data: bank } = await supabase
          .from("property_bank_details")
          .select("bank_name, branch_code, account_holder, account_number_masked, account_type, swift_code")
          .eq("property_id", invPropId)
          .maybeSingle();

        // Public property contact rows (never internal/private contacts)
        let contactPhone: string | null = null;
        let contactEmail: string | null = null;
        try {
          const { data: contactRows } = await supabase
            .from("property_contact_details")
            .select("email, phone, is_public, sort_order")
            .eq("property_id", invPropId)
            .eq("is_public", true)
            .order("sort_order", { ascending: true })
            .limit(5);
          contactPhone = (contactRows || []).find((c: any) => c.phone)?.phone || null;
          contactEmail = (contactRows || []).find((c: any) => c.email)?.email || null;
        } catch (_e) {
          // ignore
        }

        // Which unit(s) the guest reserved, e.g. GALJOEN
        const bookedRooms: any[] = Array.isArray(bookingRow?.rooms) ? bookingRow!.rooms : [];
        const nightsCount = bookingRow?.check_in_date && bookingRow?.check_out_date
          ? Math.max(
              0,
              Math.round(
                (new Date(bookingRow.check_out_date).getTime() - new Date(bookingRow.check_in_date).getTime()) /
                  86400000,
              ),
            )
          : null;
        let roomLines = bookedRooms.map((r: any) => {
          const occ = [
            r.numberOfAdults ? `${r.numberOfAdults} adult${r.numberOfAdults > 1 ? "s" : ""}` : "",
            r.numberOfTeens ? `${r.numberOfTeens} teen${r.numberOfTeens > 1 ? "s" : ""}` : "",
            r.numberOfChildren ? `${r.numberOfChildren} child${r.numberOfChildren > 1 ? "ren" : ""}` : "",
            r.numberOfInfants ? `${r.numberOfInfants} infant${r.numberOfInfants > 1 ? "s" : ""}` : "",
          ].filter(Boolean).join(", ");
          const dates = r.checkIn && r.checkOut ? `${r.checkIn} → ${r.checkOut}` : null;
          return {
            name: String(r.roomTypeName || r.roomName || r.unitName || "Unit"),
            basis: r.rateTypeName || r.mealPlan || null,
            occupancy: occ || null,
            dates,
          };
        });
        if (!roomLines.length && bookingRow?.room_type_id) {
          const { data: rt } = await supabase
            .from("rolos_room_types")
            .select("name")
            .eq("id", bookingRow.room_type_id)
            .maybeSingle();
          if (rt?.name) roomLines = [{ name: rt.name, basis: null, occupancy: null, dates: null }];
        }

        // Payments with their method (card / EFT / cash …)
        const { data: paymentRowsData } = await supabase
          .from("rolos_payments")
          .select("amount, method, reference, status, created_at")
          .eq("folio_id", invFolioId)
          .order("created_at");
        const methodLabel = (m: string | null | undefined) => {
          const k = String(m || "").toLowerCase();
          const map: Record<string, string> = {
            card: "Card",
            credit_card: "Card",
            payfast: "Card · PayFast",
            eft: "EFT",
            bank_transfer: "EFT / bank transfer",
            cash: "Cash",
            voucher: "Voucher",
            other: "Other",
          };
          return map[k] || (m ? String(m) : "Payment");
        };
        const settledPayments = (paymentRowsData || []).filter(
          (p: any) => !["failed", "refunded", "cancelled", "voided"].includes(String(p.status || "").toLowerCase()),
        );
        const invoicePayments = settledPayments.map((p: any) => ({
          label: `Payment${p.reference ? ` · ${p.reference}` : ""}`,
          amount: Number(p.amount || 0),
          method: methodLabel(p.method),
          date: p.created_at ? String(p.created_at).slice(0, 10) : null,
        }));
        let amountPaid = invoicePayments.reduce((s, p) => s + Math.abs(p.amount), 0);
        if (!invoicePayments.length) {
          const folioCredits = (transactions || [])
            .filter((x: any) => Number(x.amount || 0) < 0)
            .reduce((s: number, x: any) => s + Math.abs(Number(x.amount || 0)), 0);
          if (folioCredits > 0) {
            amountPaid = folioCredits;
          } else if (String(bookingRow?.payment_status || "").toLowerCase() === "paid") {
            // Gateway-paid booking with no folio payment row yet
            amountPaid = Math.round(total * 100) / 100;
            invoicePayments.push({
              label: "Payment received",
              amount: amountPaid,
              method: methodLabel(bookingRow?.payment_method),
              date: null,
            });
          }
        }

        const amenitiesObj = ((property as any)?.amenities as any) || {};
        const houseRules = amenitiesObj.house_rules || {};
        const policies = amenitiesObj.policies || {};
        const cancellationText =
          policies.cancellation_policy ||
          houseRules.cancellation_policy ||
          null;
        const terms = [
          policies.terms_and_conditions,
          houseRules.fine_print,
          houseRules.deposit_terms,
          houseRules.check_in_instructions ? `Arrival: ${houseRules.check_in_instructions}` : null,
          houseRules.check_in_time ? `Check-in from ${houseRules.check_in_time}` : null,
          houseRules.check_out_time ? `Check-out by ${houseRules.check_out_time}` : null,
          houseRules.pets_allowed === false ? "No pets permitted." : null,
          houseRules.smoking_allowed === false ? "Strictly no smoking indoors." : null,
          bookingRow?.special_requests ? `Guest notes: ${bookingRow.special_requests}` : null,
        ]
          .map((v: unknown) => (typeof v === "string" ? v.trim() : ""))
          .filter(Boolean) as string[];

        const { data: branding } = await supabase
          .from("rolos_brand_config")
          .select("*")
          .eq("property_id", invPropId)
          .maybeSingle();

        const guestsLabel = [
          bookingRow?.adults ? `${bookingRow.adults} adult${bookingRow.adults > 1 ? "s" : ""}` : "",
          bookingRow?.teens ? `${bookingRow.teens} teen${bookingRow.teens > 1 ? "s" : ""}` : "",
          bookingRow?.children ? `${bookingRow.children} child${bookingRow.children > 1 ? "ren" : ""}` : "",
          bookingRow?.infants ? `${bookingRow.infants} infant${bookingRow.infants > 1 ? "s" : ""}` : "",
        ].filter(Boolean).join(", ");

        const html = generateInvoiceHTML(
          {
            ...invoice,
            bill_to: billTo,
            channel_label: channelKey ? channelLabel(channelKey) : null,
            stay: bookingRow
              ? {
                  check_in: bookingRow.check_in_date,
                  check_out: bookingRow.check_out_date,
                  guest: bookingRow.guest_name,
                  nights: nightsCount ? `${nightsCount} night${nightsCount > 1 ? "s" : ""}` : null,
                  guests: guestsLabel || null,
                }
              : null,
          },
          transactions || [],
          property,
          branding,
          {
            guest: bookingRow
              ? {
                  name: bookingRow.guest_name,
                  email: bookingRow.guest_email,
                  phone: bookingRow.guest_phone,
                  address: bookingRow.invoice_to_address,
                }
              : null,
            rooms: roomLines,
            payments: invoicePayments,
            amountPaid,
            deposit: {
              amount: bookingRow?.deposit_amount ?? null,
              due_date: bookingRow?.deposit_due_date ?? null,
            },
            cancellation: cancellationText,
            terms,
            contact: {
              phone: contactPhone,
              email: contactEmail,
              website: (property as any)?.property_url || null,
              address: [
                (property as any)?.address,
                (property as any)?.city,
                (property as any)?.postal_code,
                (property as any)?.country,
              ].filter(Boolean).join(", "),
            },
            bookingReference: bookingRow?.rol_reference || null,
            paymentMode: (property as any)?.payment_mode || null,
            banking: bank || amenitiesObj.banking || null,
            paymentReference: bookingRow?.rol_reference || invoice.invoice_number,
          },
        );


        const filePath = `${invPropId}/${invoiceNumber}.html`;
        const encoder = new TextEncoder();
        const htmlBytes = encoder.encode(html);

        const { error: uploadErr } = await supabase.storage
          .from("invoices")
          .upload(filePath, htmlBytes, {
            contentType: "text/html",
            upsert: true,
          });

        if (!uploadErr) {
          const { data: signedUrlData, error: signedUrlErr } = await supabase.storage
            .from("invoices")
            .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days

          if (!signedUrlErr && signedUrlData?.signedUrl) {
            await supabase.from("rolos_invoices")
              .update({ pdf_url: signedUrlData.signedUrl })
              .eq("id", invoice.id);
            invoice.pdf_url = signedUrlData.signedUrl;
          }
        }

        return new Response(JSON.stringify({ success: true, invoice }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== GET BOOKING INVOICES (+ fresh signed links) ====================
      case "get_booking_invoices": {
        const { booking_id: gbBookingId } = body;
        if (!gbBookingId) {
          return new Response(JSON.stringify({ error: "booking_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: docs, error: gbErr } = await supabase
          .from("rolos_invoices")
          .select("*")
          .eq("booking_id", gbBookingId)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false });
        if (gbErr) throw gbErr;

        // Refresh signed URLs so links never expire on the user
        const refreshed = [];
        for (const doc of docs || []) {
          let url = doc.pdf_url as string | null;
          const path = `${doc.property_id}/${doc.invoice_number}.html`;
          const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 60 * 24 * 7);
          if (signed?.signedUrl) url = signed.signedUrl;
          refreshed.push({ ...doc, pdf_url: url });
        }

        return new Response(JSON.stringify({ success: true, invoices: refreshed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== INVOICE LEDGER (recon by billing party / channel) ====================
      case "list_invoices": {
        const {
          property_id: liPropId,
          bill_to_type: liType,
          channel_key: liChannel,
          from_date: liFrom,
          to_date: liTo,
        } = body;
        if (!liPropId) {
          return new Response(JSON.stringify({ error: "property_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let q = supabase
          .from("rolos_invoices")
          .select("id, invoice_number, document_kind, status, subtotal, tax_total, total, bill_to_type, bill_to_account_id, bill_to_name, bill_to_vat, bill_to_terms_days, channel_key, commission_rate, commission_amount, net_payable, due_date, booking_id, created_at")
          .eq("property_id", liPropId)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(500);
        if (liType && ["guest", "company", "agent", "channel"].includes(String(liType))) {
          q = q.eq("bill_to_type", liType);
        }
        if (liChannel) q = q.eq("channel_key", liChannel);
        if (liFrom) q = q.gte("created_at", liFrom);
        if (liTo) q = q.lte("created_at", liTo);

        const { data: ledger, error: liErr } = await q;
        if (liErr) throw liErr;

        // Roll up per billing party so commission owed is visible at a glance.
        const groups: Record<string, { bill_to_type: string; label: string; channel_key: string | null; count: number; total: number; commission: number; net: number }> = {};
        for (const row of ledger || []) {
          const label = row.bill_to_name || (row.bill_to_type === "channel" ? channelLabel(row.channel_key) : "Guest");
          const key = `${row.bill_to_type}::${row.bill_to_account_id || row.channel_key || label}`;
          const g = groups[key] ||= {
            bill_to_type: row.bill_to_type,
            label,
            channel_key: row.channel_key ?? null,
            count: 0,
            total: 0,
            commission: 0,
            net: 0,
          };
          g.count += 1;
          g.total += Number(row.total || 0);
          g.commission += Number(row.commission_amount || 0);
          g.net += Number(row.net_payable ?? row.total ?? 0);
        }

        return new Response(JSON.stringify({
          success: true,
          invoices: (ledger || []).map((r) => ({
            ...r,
            channel_label: r.channel_key ? channelLabel(r.channel_key) : null,
          })),
          summary: Object.values(groups).sort((a, b) => b.total - a.total),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }


      // ==================== APPLY TAX ====================
      case "apply_tax": {
        const { property_id: taxPropId } = body;
        const { data: rules, error: taxErr } = await supabase
          .from("rolos_tax_rules")
          .select("*")
          .eq("property_id", taxPropId)
          .eq("is_active", true);
        if (taxErr) throw taxErr;

        return new Response(JSON.stringify({ success: true, tax_rules: rules }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== PROCESS GATEWAY PAYMENT ====================
      case "process_gateway_payment": {
        const { folio_id: gwFolioId, property_id: gwPropId, amount: gwAmount, gateway } = body;

        const { data: payment, error: gwErr } = await supabase
          .from("rolos_payments")
          .insert({
            folio_id: gwFolioId,
            property_id: gwPropId,
            amount: gwAmount,
            currency: "ZAR",
            method: "card",
            status: "pending",
            notes: `Gateway: ${gateway || "payfast"}`,
            created_by: user?.id ?? null,
          })
          .select()
          .single();
        if (gwErr) throw gwErr;

        return new Response(JSON.stringify({ success: true, payment, gateway: gateway || "payfast" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== INITIATE GATEWAY PAYMENT ====================
      // Bridges to existing payfast-api / paygate-api edge functions
      case "initiate_gateway_payment": {
        const { folio_id: igFolioId, property_id: igPropId, amount: igAmount, gateway: igGateway, guest_email, guest_name, return_url } = body;

        // Create pending payment record first
        const { data: pendingPayment, error: ppErr } = await supabase
          .from("rolos_payments")
          .insert({
            folio_id: igFolioId,
            property_id: igPropId,
            amount: igAmount,
            currency: "ZAR",
            method: "card",
            status: "pending",
            notes: `Gateway: ${igGateway || "payfast"}`,
            created_by: user?.id ?? null,
          })
          .select()
          .single();
        if (ppErr) throw ppErr;

        // Determine which gateway to call — look up registry first
        const selectedGateway = igGateway || "payfast";

        // Gateway key → edge function name mapping
        const gatewayFnMap: Record<string, string> = {
          payfast: "payfast-api",
          paygate: "paygate-api",
          stripe: "stripe-gateway",
          paypal: "paypal-gateway",
          flutterwave: "flutterwave-gateway",
          peach: "peach-gateway",
          yoco: "yoco-gateway",
          ozow: "ozow-gateway",
          dpo: "dpo-gateway",
          addpay: "addpay-gateway",
          payflex: "payflex-gateway",
          stitch: "stitch-gateway",
          ikhokha: "ikhokha-gateway",
          snapscan: "snapscan-gateway",
          zapper: "zapper-gateway",
          klarna: "klarna-gateway",
          affirm: "affirm-gateway",
        };
        const gatewayFnName = gatewayFnMap[selectedGateway] || "payfast-api";

        // Build gateway request payload
        const gatewayPayload: Record<string, unknown> = {
          amount: igAmount,
          property_id: igPropId,
          guest_email: guest_email || "",
          guest_name: guest_name || "Guest",
          item_name: `Folio Payment — ${igFolioId.substring(0, 8)}`,
          return_url: return_url || `${supabaseUrl}/functions/v1/pms-financial`,
          payment_id: pendingPayment.id,
        };

        // Call the gateway edge function internally
        try {
          const gatewayRes = await fetch(`${supabaseUrl}/functions/v1/${gatewayFnName}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify(gatewayPayload),
          });

          const gatewayData = await gatewayRes.json();

          return new Response(JSON.stringify({
            success: true,
            payment: pendingPayment,
            gateway: selectedGateway,
            gateway_response: gatewayData,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (gwCallErr) {
          // Mark payment as failed
          await supabase.from("rolos_payments")
            .update({ status: "failed", notes: `Gateway call failed: ${String(gwCallErr)}` })
            .eq("id", pendingPayment.id);

          throw new Error(`Gateway ${selectedGateway} call failed: ${String(gwCallErr)}`);
        }
      }

      // ==================== PAYMENT WEBHOOK ====================
      case "payment_webhook": {
        const { payment_id: whPaymentId, gateway_transaction_id, status: whStatus } = body;

        const updateData: Record<string, unknown> = {
          gateway_transaction_id,
          status: whStatus === "success" ? "completed" : "failed",
        };
        if (whStatus === "success") {
          updateData.paid_at = new Date().toISOString();
        }

        const { data: updatedPayment, error: whErr } = await supabase
          .from("rolos_payments")
          .update(updateData)
          .eq("id", whPaymentId)
          .select()
          .single();
        if (whErr) throw whErr;

        if (whStatus === "success" && updatedPayment) {
          await supabase.from("rolos_folio_transactions").insert({
            folio_id: updatedPayment.folio_id,
            transaction_type: "payment",
            description: `Card payment (${gateway_transaction_id || "gateway"})`,
            amount: -Math.abs(Number(updatedPayment.amount)),
          });
          await updateFolioBalance(supabase, updatedPayment.folio_id);
        }

        return new Response(JSON.stringify({ success: true, payment: updatedPayment }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== RECONCILE ====================
      // Cross-checks folio balances against payment & transaction totals
      case "reconcile": {
        const { property_id: reconPropId } = body;

        const { data: folios } = await supabase
          .from("rolos_folios")
          .select("id, balance, booking_id, guest_name, status")
          .eq("property_id", reconPropId)
          .eq("status", "open");

        const discrepancies: Array<{ folio_id: string; guest_name: string; stored_balance: number; calculated_balance: number; diff: number }> = [];

        for (const folio of (folios || [])) {
          const { data: txs } = await supabase
            .from("rolos_folio_transactions")
            .select("amount")
            .eq("folio_id", folio.id);

          const calculatedBalance = (txs || []).reduce((sum: number, t: any) => sum + Number(t.amount), 0);
          const rounded = Math.round(calculatedBalance * 100) / 100;
          const stored = Number(folio.balance) || 0;

          if (Math.abs(rounded - stored) > 0.01) {
            discrepancies.push({
              folio_id: folio.id,
              guest_name: folio.guest_name || "Unknown",
              stored_balance: stored,
              calculated_balance: rounded,
              diff: Math.round((rounded - stored) * 100) / 100,
            });

            // Auto-fix
            await supabase.from("rolos_folios")
              .update({ balance: rounded })
              .eq("id", folio.id);
          }
        }

        // Also check: payments without folio transactions
        const { data: orphanPayments } = await supabase
          .from("rolos_payments")
          .select("id, folio_id, amount, status, method")
          .eq("property_id", reconPropId)
          .eq("status", "completed");

        let orphanCount = 0;
        for (const payment of (orphanPayments || [])) {
          if (!payment.folio_id) continue;
          const { data: matchingTx } = await supabase
            .from("rolos_folio_transactions")
            .select("id")
            .eq("folio_id", payment.folio_id)
            .eq("transaction_type", "payment")
            .limit(1);

          if (!matchingTx?.length) {
            // Create missing transaction
            await supabase.from("rolos_folio_transactions").insert({
              folio_id: payment.folio_id,
              transaction_type: "payment",
              description: `Reconciled payment via ${payment.method || "unknown"}`,
              amount: -Math.abs(Number(payment.amount)),
            });
            await updateFolioBalance(supabase, payment.folio_id);
            orphanCount++;
          }
        }

        return new Response(JSON.stringify({
          success: true,
          folios_checked: folios?.length || 0,
          discrepancies_found: discrepancies.length,
          discrepancies,
          orphan_payments_fixed: orphanCount,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== GET FOLIOS ====================
      case "get_folios": {
        const { property_id: fPropId } = body;
        const { data: folios, error: fErr } = await supabase
          .from("rolos_folios")
          .select("*, booking:bookings!booking_id(guest_name, check_in_date, check_out_date, status)")
          .eq("property_id", fPropId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (fErr) throw fErr;

        return new Response(JSON.stringify({ success: true, folios }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== GET FOLIO DETAIL ====================
      case "get_folio_detail": {
        const { folio_id: dFolioId } = body;

        const [folioRes, txRes, payRes, invRes] = await Promise.all([
          supabase.from("rolos_folios").select("*, booking:bookings!booking_id(guest_name, check_in_date, check_out_date, status, total_price)").eq("id", dFolioId).single(),
          supabase.from("rolos_folio_transactions").select("*").eq("folio_id", dFolioId).order("created_at"),
          supabase.from("rolos_payments").select("*").eq("folio_id", dFolioId).order("created_at", { ascending: false }),
          supabase.from("rolos_invoices").select("*").eq("folio_id", dFolioId).order("created_at", { ascending: false }),
        ]);

        return new Response(JSON.stringify({
          success: true,
          folio: folioRes.data,
          transactions: txRes.data || [],
          payments: payRes.data || [],
          invoices: invRes.data || [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ==================== DEPOSIT SCHEDULES ====================
      case "get_deposit_schedules": {
        const { property_id: dsPropId } = body;
        const { data, error } = await supabase
          .from("rolos_deposit_schedules")
          .select("*, rate_plan:rolos_rate_plans!rate_plan_id(name)")
          .eq("property_id", dsPropId)
          .order("name");
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, schedules: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    console.error("pms-financial error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper: recalculate folio balance from transactions
async function updateFolioBalance(supabase: any, folioId: string) {
  const { data: txs } = await supabase
    .from("rolos_folio_transactions")
    .select("amount")
    .eq("folio_id", folioId);

  const balance = (txs || []).reduce((sum: number, t: any) => sum + Number(t.amount), 0);
  await supabase.from("rolos_folios").update({ balance: Math.round(balance * 100) / 100 }).eq("id", folioId);
}
