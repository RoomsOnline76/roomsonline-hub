import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
      case "record_payment": {
        const { folio_id, property_id, amount, currency, method, reference, notes } = body;
        // Insert payment
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

        // Also create a folio transaction for the payment
        await supabase.from("rolos_folio_transactions").insert({
          folio_id,
          type: "payment",
          description: `Payment via ${method || "cash"}${reference ? ` (${reference})` : ""}`,
          amount: -Math.abs(amount), // Payments reduce balance
          created_by: user.id,
        });

        return new Response(JSON.stringify({ success: true, payment }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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

        // Update payment status
        await supabase
          .from("rolos_payments")
          .update({ status: "refunded" })
          .eq("id", payment_id);

        return new Response(JSON.stringify({ success: true, refund }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "generate_invoice": {
        const { folio_id: invFolioId, property_id: invPropId } = body;

        // Get folio transactions to calculate totals
        const { data: transactions } = await supabase
          .from("rolos_folio_transactions")
          .select("*")
          .eq("folio_id", invFolioId);

        const charges = (transactions || []).filter((t: any) => t.amount > 0);
        const subtotal = charges.reduce((sum: number, t: any) => sum + Number(t.amount), 0);

        // Get tax rules
        const { data: taxRules } = await supabase
          .from("rolos_tax_rules")
          .select("*")
          .eq("property_id", invPropId)
          .eq("is_active", true);

        const taxTotal = (taxRules || []).reduce((sum: number, rule: any) => {
          return sum + (subtotal * Number(rule.rate) / 100);
        }, 0);

        const total = subtotal + taxTotal;

        // Generate invoice number
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
            created_by: user.id,
          })
          .select()
          .single();
        if (invErr) throw invErr;

        return new Response(JSON.stringify({ success: true, invoice }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    console.error("pms-financial error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
