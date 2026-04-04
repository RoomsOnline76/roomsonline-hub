// ============================================================================
// PMS FINANCIAL ENGINE v3.0
// Payments, refunds, invoices, tax, deposits, gateway hooks, reconciliation
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateInvoiceHTML(invoice: any, transactions: any[], property: any, branding: any): string {
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

  const chargeRows = charges.map((t: any) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${t.description || "Charge"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${Number(t.amount).toFixed(2)}</td>
    </tr>
  `).join("");

  const paymentRows = payments.map((t: any) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#16a34a;">${t.description || "Payment"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#16a34a;">(${Math.abs(Number(t.amount)).toFixed(2)})</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${invoice.invoice_number}</title></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:40px;color:#1a1a2e;max-width:800px;margin:0 auto;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;">
    <div>
      ${logoUrl ? `<img src="${logoUrl}" alt="${businessName}" style="max-height:60px;margin-bottom:8px;" />` : ""}
      <h1 style="margin:0;font-size:28px;color:${primaryColor};">${businessName}</h1>
      ${businessAddress ? `<p style="margin:4px 0;color:#666;font-size:13px;">${businessAddress}</p>` : ""}
      ${isVatRegistered && vatNumber ? `<p style="margin:4px 0;color:#666;font-size:13px;">VAT: ${vatNumber}</p>` : ""}
    </div>
    <div style="text-align:right;">
      <h2 style="margin:0;font-size:24px;color:${primaryColor};">INVOICE</h2>
      <p style="margin:4px 0;font-size:14px;color:#666;">${invoice.invoice_number}</p>
      <p style="margin:4px 0;font-size:13px;color:#666;">Issued: ${invoice.issued_date || new Date().toISOString().split("T")[0]}</p>
      ${invoice.due_date ? `<p style="margin:4px 0;font-size:13px;color:#666;">Due: ${invoice.due_date}</p>` : ""}
    </div>
  </div>

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
            created_by: user.id,
          })
          .select()
          .single();
        if (payErr) throw payErr;

        await supabase.from("rolos_folio_transactions").insert({
          folio_id,
          transaction_type: "payment",
          description: `Payment via ${method || "cash"}${reference ? ` (${reference})` : ""}`,
          amount: -Math.abs(amount),
          created_by: user.id,
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

      // ==================== GENERATE INVOICE WITH PDF ====================
      case "generate_invoice": {
        const { folio_id: invFolioId, property_id: invPropId, notes: invNotes } = body;

        const { data: transactions } = await supabase
          .from("rolos_folio_transactions")
          .select("*")
          .eq("folio_id", invFolioId)
          .order("created_at");

        const charges = (transactions || []).filter((t: any) => (t.amount || 0) > 0);
        const subtotal = charges.reduce((sum: number, t: any) => sum + Number(t.amount), 0);

        const { data: taxRules } = await supabase
          .from("rolos_tax_rules")
          .select("*")
          .eq("property_id", invPropId)
          .eq("is_active", true);

        const taxTotal = (taxRules || []).reduce((sum: number, rule: any) => {
          return sum + (subtotal * Number(rule.rate) / 100);
        }, 0);

        const total = subtotal + taxTotal;
        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

        const { data: invoice, error: invErr } = await supabase
          .from("rolos_invoices")
          .insert({
            folio_id: invFolioId,
            property_id: invPropId,
            invoice_number: invoiceNumber,
            subtotal,
            tax_total: Math.round(taxTotal * 100) / 100,
            total: Math.round(total * 100) / 100,
            status: "issued",
            notes: invNotes || null,
            created_by: user.id,
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

        const html = generateInvoiceHTML(invoice, transactions || [], property, branding);

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
          const { data: publicUrl } = supabase.storage
            .from("invoices")
            .getPublicUrl(filePath);

          if (publicUrl?.publicUrl) {
            await supabase.from("rolos_invoices")
              .update({ pdf_url: publicUrl.publicUrl })
              .eq("id", invoice.id);
            invoice.pdf_url = publicUrl.publicUrl;
          }
        }

        return new Response(JSON.stringify({ success: true, invoice }), {
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
            created_by: user.id,
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
            created_by: user.id,
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
