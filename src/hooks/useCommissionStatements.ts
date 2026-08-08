/**
 * Referral commission statements — data access for the admin surface.
 *
 * Everything that changes money goes through the `calculate-rep-commissions`
 * edge function so the rules live in one place; the browser only reads.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DEFAULT_VAT_SETTINGS,
  type VatSettings,
} from "@/lib/payoutStatement";
import type {
  CommissionLine,
  CommissionStatement,
  CommissionStatementDetail,
} from "@/lib/commissionStatement";

/** What a run would produce, before anything is written. */
export interface CommissionPreviewLine {
  property_id: string | null;
  property_name: string;
  referral_started_on: string | null;
  line_kind: "commission" | "clawback";
  commission_type: string;
  rate_applied: number;
  rate_source: string;
  base_revenue: number;
  amount: number;
  revenue_breakdown: Record<string, number | string>;
  description: string | null;
}

export interface CommissionPreviewStatement {
  rep_id: string;
  rep_name: string;
  rep_code: string | null;
  rep_email: string | null;
  rep_tier: string;
  terms: Record<string, unknown>;
  bank: Record<string, unknown>;
  lines: CommissionPreviewLine[];
  total_revenue: number;
  gross_commission: number;
  adjustments_total: number;
  net_payable: number;
  property_count: number;
}

// deno-lint-ignore-file
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function toStatement(row: Row): CommissionStatement {
  return {
    id: row.id,
    rep_id: row.rep_id,
    period_month: row.period_month,
    period_start: row.period_start ?? null,
    period_end: row.period_end ?? null,
    statement_reference: row.statement_reference ?? null,
    total_entries: Number(row.total_entries) || 0,
    property_count: Number(row.property_count) || 0,
    total_revenue: Number(row.total_revenue) || 0,
    gross_commission: Number(row.gross_commission) || 0,
    adjustments_total: Number(row.adjustments_total) || 0,
    net_payable: Number(row.net_payable ?? row.total_amount) || 0,
    total_amount: Number(row.total_amount) || 0,
    status: row.status,
    bank_snapshot: row.bank_snapshot || {},
    terms_snapshot: row.terms_snapshot || {},
    tax_snapshot: row.tax_snapshot || {},
    vat_amount: Number(row.vat_amount) || 0,

    generated_at: row.generated_at,
    approved_by: row.approved_by ?? null,
    approved_at: row.approved_at ?? null,
    finalized_at: row.finalized_at ?? null,
    finalized_by: row.finalized_by ?? null,
    paid_at: row.paid_at ?? null,
    paid_reference: row.paid_reference ?? null,
    void_reason: row.void_reason ?? null,
    emailed_at: row.emailed_at ?? null,
    emailed_to: row.emailed_to ?? null,
    notes: row.notes ?? null,
    rep_name: row.sales_reps?.display_name ?? null,
    rep_code: row.sales_reps?.rep_code ?? null,
    rep_email: row.sales_reps?.email ?? null,
    rep_tier: row.sales_reps?.commission_tier ?? null,
  };
}

function toLine(row: Row): CommissionLine {
  return {
    id: row.id,
    report_id: row.report_id ?? null,
    rep_id: row.rep_id,
    property_id: row.property_id ?? null,
    referral_id: row.referral_id ?? null,
    period_start: row.period_start,
    period_end: row.period_end,
    base_revenue: Number(row.base_revenue) || 0,
    commission_type: row.commission_type,
    rate_applied: Number(row.rate_applied) || 0,
    amount: Number(row.amount) || 0,
    status: row.status,
    line_kind: row.line_kind || "commission",
    rate_source: row.rate_source ?? null,
    revenue_breakdown: row.revenue_breakdown || {},
    description: row.description ?? null,
    notes: row.notes ?? null,
    clawback_reason: row.clawback_reason ?? null,
    referral_started_on: row.referral_started_on ?? null,
    created_at: row.created_at,
    property_name: row.properties?.name ?? null,
  };
}

export function useCommissionStatements() {
  const [statements, setStatements] = useState<CommissionStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [vat, setVat] = useState<VatSettings>(DEFAULT_VAT_SETTINGS);
  const [busy, setBusy] = useState<string | null>(null);

  const loadVat = useCallback(async () => {
    const { data } = await supabase
      .from("billing_global_defaults")
      .select("vat_enabled, vat_rate, vat_number, company_legal_name, company_address");
    const rows = (data || []) as Row[];
    const active = rows.find((r) => r.vat_enabled) || rows[0];
    if (active) setVat({ ...DEFAULT_VAT_SETTINGS, ...active });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("rep_commission_reports")
        .select("*, sales_reps(display_name, rep_code, email, commission_tier)")
        .order("period_month", { ascending: false })
        .order("generated_at", { ascending: false });

      if (error) throw error;
      setStatements((data || []).map(toStatement));
    } catch (error) {
      console.error("[commission-statements] load failed", error);
      toast.error("Could not load commission statements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadVat();
  }, [load, loadVat]);

  const invoke = useCallback(
    async (body: Record<string, unknown>, busyKey: string, successMessage?: string) => {
      setBusy(busyKey);
      try {
        const { data, error } = await supabase.functions.invoke("calculate-rep-commissions", { body });
        if (error) throw error;
        if (data && data.success === false) throw new Error(data.error || "Request failed");
        if (successMessage) toast.success(successMessage);
        return data as Row;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Request failed";
        toast.error(message);
        return null;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const preview = useCallback(
    async (periodMonth: string): Promise<CommissionPreviewStatement[] | null> => {
      const data = await invoke({ action: "preview", period_month: periodMonth }, "preview");
      return data ? ((data.statements || []) as CommissionPreviewStatement[]) : null;
    },
    [invoke],
  );

  const generate = useCallback(
    async (periodMonth: string) => {
      const data = await invoke({ action: "generate", period_month: periodMonth }, "generate");
      if (data) {
        toast.success(
          data.statements > 0
            ? `${data.statements} statement${data.statements === 1 ? "" : "s"} generated`
            : "Nothing commissionable in this period",
        );
        await load();
      }
      return data;
    },
    [invoke, load],
  );

  const approve = useCallback(
    async (statementId: string) => {
      const data = await invoke({ action: "approve", statement_id: statementId }, statementId);
      if (data) {
        toast.success(`Approved — ${data.statement_reference}`);
        await load();
      }
      return data;
    },
    [invoke, load],
  );

  const markPaid = useCallback(
    async (statementId: string, paidReference?: string) => {
      const data = await invoke(
        { action: "mark_paid", statement_id: statementId, paid_reference: paidReference },
        statementId,
        "Marked as paid",
      );
      if (data) await load();
      return data;
    },
    [invoke, load],
  );

  const voidStatement = useCallback(
    async (statementId: string, reason: string) => {
      const data = await invoke(
        { action: "void", statement_id: statementId, void_reason: reason },
        statementId,
        "Statement voided",
      );
      if (data) await load();
      return data;
    },
    [invoke, load],
  );

  const stats = useMemo(() => {
    const live = statements.filter((s) => s.status !== "void");
    const sum = (status: string) =>
      live.filter((s) => s.status === status).reduce((t, s) => t + s.net_payable, 0);
    return {
      awaitingApproval: sum("pending_approval") + sum("draft"),
      approvedUnpaid: sum("approved"),
      paidToDate: sum("paid"),
      statementCount: live.length,
    };
  }, [statements]);

  return { statements, loading, vat, busy, stats, reload: load, preview, generate, approve, markPaid, voidStatement };
}

/** Full statement with its lines — loaded when a statement is opened. */
export function useCommissionStatementDetail(statement: CommissionStatement | null) {
  const [detail, setDetail] = useState<CommissionStatementDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!statement) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("rep_commission_entries")
        .select("*, properties(name)")
        .eq("report_id", statement.id)
        .order("amount", { ascending: false });
      if (error) throw error;
      setDetail({ ...statement, lines: (data || []).map(toLine) });
    } catch (error) {
      console.error("[commission-statements] detail failed", error);
      toast.error("Could not load statement lines");
      setDetail({ ...statement, lines: [] });
    } finally {
      setLoading(false);
    }
  }, [statement]);

  useEffect(() => {
    load();
  }, [load]);

  return { detail, loading, reload: load };
}

/** Manual adjustment / clawback capture on a draft statement. */
export async function addCommissionAdjustment(input: {
  statement: CommissionStatement;
  description: string;
  amount: number;
  kind: "adjustment" | "clawback";
}): Promise<boolean> {
  const { statement, description, amount, kind } = input;
  const { error } = await supabase.from("rep_commission_entries").insert({
    report_id: statement.id,
    rep_id: statement.rep_id,
    period_start: statement.period_start,
    period_end: statement.period_end,
    base_revenue: 0,
    commission_type: "residual",
    rate_applied: 0,
    amount,
    line_kind: kind,
    status: "pending",
    description,
    clawback_reason: kind === "clawback" ? description : null,
  } as never);
  if (error) {
    toast.error(error.message);
    return false;
  }
  toast.success("Adjustment captured");
  return true;
}

/** Email the paysheet to the referrer. */
export async function emailCommissionStatement(statementId: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("send-commission-statement", {
    body: { statement_id: statementId },
  });
  if (error || (data && data.success === false)) {
    toast.error(error?.message || data?.error || "Could not send the statement");
    return false;
  }
  toast.success(`Statement emailed to ${data?.sent_to || "the referral partner"}`);
  return true;
}
