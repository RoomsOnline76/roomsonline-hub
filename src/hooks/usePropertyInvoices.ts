/**
 * ROL property invoices — data access for the admin invoicing run.
 *
 * Amounts are read straight off the persisted invoice; nothing is recomputed in
 * the browser so what an admin sends is exactly what was stored.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  balanceDue,
  isOverdue,
  type PropertyInvoice,
  type PropertyInvoiceDetail,
  type PropertyInvoiceLine,
} from "@/lib/propertyInvoice";

export interface InvoicePeriodRange {
  /** Inclusive ISO date (YYYY-MM-DD). */
  start: string;
  /** Inclusive ISO date (YYYY-MM-DD). */
  end: string;
}

export function usePropertyInvoices(period: InvoicePeriodRange) {
  const [invoices, setInvoices] = useState<PropertyInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { start, end } = period;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("rol_property_invoices")
        .select("*")
        .eq("period_start", start)
        .eq("period_end", end)
        .neq("status", "void")
        .order("total", { ascending: false });
      if (error) throw error;
      setInvoices((data || []) as unknown as PropertyInvoice[]);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[property-invoices] load failed", err);
      toast.error("Could not load property invoices");
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    load();
  }, [load]);

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("generate-property-invoices", { body });
    if (error) {
      const details =
        "context" in error && error.context instanceof Response ? await error.context.text() : error.message;
      throw new Error(details);
    }
    const payload = data as { success: boolean; error?: string; data?: unknown };
    if (!payload?.success) throw new Error(payload?.error || "Invoice run failed");
    return payload.data;
  }, []);

  const run = useCallback(
    async (fn: () => Promise<unknown>, success: string) => {
      setRunning(true);
      try {
        await fn();
        toast.success(success);
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setRunning(false);
      }
    },
    [load],
  );

  const generate = useCallback(async () => {
    setRunning(true);
    try {
      const result = (await invoke({ action: "generate", period_start: start, period_end: end })) as {
        invoices?: unknown[];
      };
      const count = result?.invoices?.length ?? 0;
      toast.success(count ? `${count} invoice${count === 1 ? "" : "s"} prepared` : "Nothing to invoice this period");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invoice run failed");
    } finally {
      setRunning(false);
    }
  }, [invoke, start, end, load]);

  const issueInvoice = useCallback(
    (invoiceId: string) => run(() => invoke({ action: "issue", invoice_id: invoiceId }), "Invoice issued"),
    [invoke, run],
  );

  const sendInvoice = useCallback(
    (invoiceId: string, email?: string) =>
      run(() => invoke({ action: "send", invoice_id: invoiceId, email }), "Invoice emailed"),
    [invoke, run],
  );

  const markPaid = useCallback(
    (invoiceId: string, paymentReference?: string) =>
      run(
        () => invoke({ action: "mark_paid", invoice_id: invoiceId, payment_reference: paymentReference }),
        "Invoice marked paid",
      ),
    [invoke, run],
  );

  const voidInvoice = useCallback(
    (invoiceId: string, reason?: string) =>
      run(() => invoke({ action: "void", invoice_id: invoiceId, reason }), "Invoice voided"),
    [invoke, run],
  );

  const addAdjustment = useCallback(
    (invoiceId: string, description: string, amount: number) =>
      run(
        () => invoke({ action: "adjust", invoice_id: invoiceId, description, amount }),
        "Adjustment added",
      ),
    [invoke, run],
  );

  const totals = useMemo(
    () => ({
      count: invoices.length,
      total: invoices.reduce((s, i) => s + i.total, 0),
      outstanding: invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + balanceDue(i), 0),
      commission: invoices.reduce((s, i) => s + i.commission_total, 0),
      recurring: invoices.reduce((s, i) => s + i.recurring_total + i.charge_total, 0),
      drafts: invoices.filter((i) => i.status === "draft").length,
      issued: invoices.filter((i) => i.status === "issued").length,
      overdue: invoices.filter((i) => isOverdue(i)).length,
    }),
    [invoices],
  );

  return {
    invoices,
    loading,
    running,
    lastUpdated,
    totals,
    refresh: load,
    generate,
    issueInvoice,
    sendInvoice,
    markPaid,
    voidInvoice,
    addAdjustment,
  };
}

/** Full detail (lines) for one invoice. */
export function usePropertyInvoiceDetail(invoiceId: string | null) {
  const [detail, setDetail] = useState<PropertyInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!invoiceId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      const [{ data: invoice, error }, { data: lines }] = await Promise.all([
        supabase.from("rol_property_invoices").select("*").eq("id", invoiceId).single(),
        supabase
          .from("rol_property_invoice_lines")
          .select("*")
          .eq("invoice_id", invoiceId)
          .order("line_kind", { ascending: true })
          .order("line_date", { ascending: true }),
      ]);
      if (error) throw error;
      setDetail({
        ...(invoice as unknown as PropertyInvoice),
        lines: (lines || []) as unknown as PropertyInvoiceLine[],
      });
    } catch (err) {
      console.error("[property-invoices] detail failed", err);
      toast.error("Could not load invoice detail");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  return { detail, loading, refresh: load };
}
