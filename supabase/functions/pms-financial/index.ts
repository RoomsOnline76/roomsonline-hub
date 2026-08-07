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

function generateInvoiceHTML(invoice: any, transactions: any[], property: any, branding: any): string {
  const isProForma = invoice?.document_kind === "pro_forma";
  const businessName = branding?.business_name || property?.name || "Property";
  const businessAddress = branding?.business_address || "";
  const amenities = property?.amenities || {};
  const amenityVatNumber = amenities?.vat_number || "";
  const vatNumber = branding?.vat_number || amenityVatNumber || "";
  const isVatRegistered = branding?.is_vat_registered || !!amenityVatNumber;
  const logoUrl = property?.brand_logo_url || "";
  const primaryColor = property?.brand_primary_color || "#1a1a2e";

  const charges = transactions.filter((t: any) => (t.amount || 0) > 0);
  const payments = transactions.filter((t: any) => (t.amount || 0) < 0);

  // Guest-facing line clarity: group charges by revenue stream so the guest (or
  // their accounts team) can see accommodation separately from food & beverage.
  const streamOf = (t: any): "accommodation" | "fnb" | "other" => {
    const raw = String(t.revenue_stream || "").toLowerCase();
    if (raw === "fnb" || raw === "other" || raw === "accommodation") return raw as any;
    const text = `${t.transaction_type || ""} ${t.description || ""}`.toLowerCase();
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
      const items = charges.filter((t: any) => streamOf(t) === s.key);
      return { ...s, items, total: items.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0) };
    })
    .filter((s) => s.items.length > 0);
  const showSections = grouped.length > 1;

  const lineRow = (t: any) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;${showSections ? "padding-left:24px;" : ""}">${t.description || "Charge"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${Number(t.amount).toFixed(2)}</td>
    </tr>
  `;

  const chargeRows = showSections
    ? grouped.map((s) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.6px;color:#666;">${s.label}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;"></td>
    </tr>
    ${s.items.map(lineRow).join("")}
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:12px;color:#666;">${s.label} subtotal</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-size:12px;font-weight:600;color:#666;">${s.total.toFixed(2)}</td>
    </tr>
  `).join("")
    : charges.map(lineRow).join("");

  const streamSummaryRows = showSections
    ? grouped.map((s) => `
      <tr>
        <td style="padding:4px 16px;font-size:12px;color:#666;">${s.label}</td>
        <td style="padding:4px 16px;text-align:right;font-size:12px;color:#666;">${s.total.toFixed(2)}</td>
      </tr>
    `).join("")
    : "";

  const paymentRows = payments.map((t: any) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#16a34a;">${t.description || "Payment"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#16a34a;">(${Math.abs(Number(t.amount)).toFixed(2)})</td>
    </tr>
  `).join("");

  const docTitle = isProForma ? "PRO FORMA INVOICE" : (isVatRegistered ? "TAX INVOICE" : "INVOICE");

  // Who is being billed — printed next to the name so an accounts team can file it.
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
        <td style="padding:6px 16px;font-size:12px;color:#666;">Commission${commissionRate > 0 ? ` (${commissionRate.toFixed(2)}%)` : ""}</td>
        <td style="padding:6px 16px;text-align:right;font-size:12px;color:#666;">(${commissionAmount.toFixed(2)})</td>
      </tr>
      ${netPayable != null ? `<tr>
        <td style="padding:6px 16px;font-weight:600;">Net payable</td>
        <td style="padding:6px 16px;text-align:right;font-weight:600;">${netPayable.toFixed(2)}</td>
      </tr>` : ""}
  ` : "";


  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${docTitle} ${invoice.invoice_number}</title></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:40px;color:#1a1a2e;max-width:800px;margin:0 auto;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;">
    <div>
      ${logoUrl ? `<img src="${logoUrl}" alt="${businessName}" style="max-height:60px;margin-bottom:8px;" />` : ""}
      <h1 style="margin:0;font-size:28px;color:${primaryColor};">${businessName}</h1>
      ${businessAddress ? `<p style="margin:4px 0;color:#666;font-size:13px;">${businessAddress}</p>` : ""}
      ${isVatRegistered && vatNumber && !isProForma ? `<p style="margin:4px 0;color:#666;font-size:13px;">VAT: ${vatNumber}</p>` : ""}
    </div>
    <div style="text-align:right;">
      <h2 style="margin:0;font-size:24px;color:${primaryColor};">${docTitle}</h2>
      <p style="margin:4px 0;font-size:14px;color:#666;">${invoice.invoice_number}</p>
      <p style="margin:4px 0;font-size:13px;color:#666;">Issued: ${invoice.issued_date || new Date().toISOString().split("T")[0]}</p>
      ${invoice.due_date ? `<p style="margin:4px 0;font-size:13px;color:#666;">Due: ${invoice.due_date}</p>` : ""}
    </div>
  </div>

  ${isProForma ? `<p style="margin:0 0 24px;padding:10px 14px;background:#fff7ed;border:1px solid #fdba74;border-radius:6px;font-size:12px;color:#9a3412;">This is a <strong>pro forma invoice</strong> — a quotation of charges for your upcoming stay. It is not a tax invoice and cannot be used for VAT purposes. A final invoice will be issued after your stay.</p>` : ""}

  ${invoice.invoice_to || invoice.stay ? `
  <div style="display:flex;gap:32px;margin-bottom:24px;font-size:13px;color:#444;">
    ${invoice.invoice_to ? `<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;">Invoice To${billToKindLabel ? ` &middot; ${billToKindLabel}` : ""}</div><div style="font-weight:600;">${invoice.invoice_to}</div>${invoice.bill_to?.address ? `<div style="font-size:12px;color:#666;">${invoice.bill_to.address}</div>` : ""}${invoice.bill_to?.vat_number ? `<div style="font-size:12px;color:#666;">VAT No: ${invoice.bill_to.vat_number}</div>` : ""}${invoice.bill_to?.terms_days ? `<div style="font-size:12px;color:#666;">Payment terms: ${invoice.bill_to.terms_days} days</div>` : ""}</div>` : ""}
    ${invoice.stay ? `<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;">Stay</div><div>${invoice.stay.check_in} &rarr; ${invoice.stay.check_out}</div>${invoice.stay.guest ? `<div style="font-size:12px;color:#666;">Guest: ${invoice.stay.guest}</div>` : ""}</div>` : ""}
    ${invoice.channel_label ? `<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;">Channel</div><div>${invoice.channel_label}</div></div>` : ""}
    ${invoice.reference ? `<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;">Reference</div><div>${invoice.reference}</div></div>` : ""}
  </div>` : ""}



  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <thead>
      <tr style="background:${primaryColor};color:white;">
        <th style="padding:10px 12px;text-align:left;">Description</th>
        <th style="padding:10px 12px;text-align:right;width:120px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${chargeRows}
    </tbody>
  </table>

  <div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
    <table style="border-collapse:collapse;min-width:280px;">
      ${streamSummaryRows}
      <tr>
        <td style="padding:6px 16px;font-weight:600;">Subtotal</td>
        <td style="padding:6px 16px;text-align:right;">${Number(invoice.subtotal).toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px;font-weight:600;">Tax</td>
        <td style="padding:6px 16px;text-align:right;">${Number(invoice.tax_total).toFixed(2)}</td>
      </tr>
      <tr style="border-top:2px solid ${primaryColor};">
        <td style="padding:10px 16px;font-weight:700;font-size:16px;">Total</td>
        <td style="padding:10px 16px;text-align:right;font-weight:700;font-size:16px;">${invoice.currency || "ZAR"} ${Number(invoice.total).toFixed(2)}</td>
      </tr>
    </table>
  </div>

  ${payments.length > 0 ? `
  <h3 style="font-size:16px;margin-bottom:8px;color:${primaryColor};">Payments Received</h3>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tbody>${paymentRows}</tbody>
  </table>
  ` : ""}

  ${invoice.notes ? `<p style="margin-top:24px;padding:12px;background:#f8f8f8;border-radius:4px;font-size:13px;color:#666;">${invoice.notes}</p>` : ""}
  
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #eee;text-align:center;color:#999;font-size:11px;">
    Generated by ROL'OS Property Management System
  </div>
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
        } = body;
        const documentKind: string = body.document_kind === "pro_forma" ? "pro_forma" : "tax_invoice";
        let invFolioId: string | null = body.folio_id || null;

        // Resolve booking + folio (creating the folio if the booking has none yet)
        let bookingRow: any = null;
        if (invBookingId) {
          const { data: bk } = await supabase
            .from("bookings")
            .select("id, guest_name, guest_email, check_in_date, check_out_date, total_price, status, property_id, company_account_id, invoice_to_name, invoice_to_vat, invoice_to_address")
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

        // If no explicit tax rules but property has VAT enabled, apply VAT
        if (taxTotal === 0) {
          const { data: brandCfg } = await supabase
            .from("rolos_brand_config")
            .select("is_vat_registered, vat_rate, vat_number")
            .eq("property_id", invPropId)
            .maybeSingle();
          const { data: propData } = await supabase
            .from("properties")
            .select("amenities")
            .eq("id", invPropId)
            .single();
          const propAmenities = (propData?.amenities as any) || {};
          const hasVat = brandCfg?.is_vat_registered || !!propAmenities?.vat_number;
          if (hasVat) {
            const vatRate = brandCfg?.vat_rate ?? 15;
            // VAT is inclusive on vatable amount only
            taxTotal = vatableSubtotal - (vatableSubtotal / (1 + vatRate / 100));
          }
        }

        // Resolve the invoice identity: explicit override, then the booking's
        // invoice-to fields, then the linked company profile, then the guest.
        let billTo: { name: string | null; vat_number: string | null; address: string | null } = {
          name: bookingRow?.invoice_to_name || null,
          vat_number: bookingRow?.invoice_to_vat || null,
          address: bookingRow?.invoice_to_address || null,
        };
        if (bookingRow?.company_account_id && (!billTo.name || !billTo.address)) {
          const { data: companyAccount } = await supabase
            .from("crm_accounts")
            .select("name, vat_number, address_line1, address_line2, city, postal_code, country")
            .eq("id", bookingRow.company_account_id)
            .maybeSingle();
          if (companyAccount) {
            const composed = [
              companyAccount.address_line1,
              companyAccount.address_line2,
              companyAccount.city,
              companyAccount.postal_code,
              companyAccount.country,
            ].filter(Boolean).join(", ");
            billTo = {
              name: billTo.name || companyAccount.name || null,
              vat_number: billTo.vat_number || companyAccount.vat_number || null,
              address: billTo.address || composed || null,
            };
          }
        }

        const total = subtotal + taxTotal;
        const prefix = documentKind === "pro_forma" ? "PF" : "INV";
        const invoiceNumber = `${prefix}-${Date.now().toString(36).toUpperCase()}`;

        // Only one live document of each kind per booking — supersede the previous one
        if (invBookingId) {
          await supabase
            .from("rolos_invoices")
            .update({ status: "cancelled" })
            .eq("booking_id", invBookingId)
            .eq("document_kind", documentKind)
            .neq("status", "cancelled");
        }

        const { data: invoice, error: invErr } = await supabase
          .from("rolos_invoices")
          .insert({
            folio_id: invFolioId,
            property_id: invPropId,
            booking_id: invBookingId || null,
            document_kind: documentKind,
            invoice_to: invInvoiceTo || billTo.name || bookingRow?.guest_name || null,
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
          .select("name, brand_logo_url, brand_primary_color, amenities")
          .eq("id", invPropId)
          .single();

        const { data: branding } = await supabase
          .from("rolos_brand_config")
          .select("*")
          .eq("property_id", invPropId)
          .maybeSingle();

        const html = generateInvoiceHTML(
          { ...invoice, bill_to: billTo, stay: bookingRow ? { check_in: bookingRow.check_in_date, check_out: bookingRow.check_out_date, guest: bookingRow.guest_name } : null },
          transactions || [],
          property,
          branding,
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
