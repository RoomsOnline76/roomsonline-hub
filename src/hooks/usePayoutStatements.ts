/**
 * Payout statements — data access for the admin payout run.
 *
 * All amounts are read straight off the persisted statement; nothing is
 * recomputed client-side, so what an admin sees is what was signed off.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DEFAULT_VAT_SETTINGS,
  type PayoutStatement,
  type PayoutStatementDetail,
  type PayoutStatementLine,
  type PayoutStatementPayment,
  type UnassignedPayment,
  type VatSettings,
} from "@/lib/payoutStatement";

export interface PayoutPeriodRange {
  /** Inclusive ISO date (YYYY-MM-DD). */
  start: string;
  /** Inclusive ISO date (YYYY-MM-DD). */
  end: string;
}

const SETTLED_TX_STATUSES = ["paid", "completed", "succeeded", "success"];
const PENDING_SESSION_MS = 2 * 60 * 60 * 1000;

export function usePayoutStatements(period: PayoutPeriodRange) {
  const [statements, setStatements] = useState<PayoutStatement[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedPayment[]>([]);
  const [vat, setVat] = useState<VatSettings>(DEFAULT_VAT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { start, end } = period;

  const loadStatements = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("property_payout_statements")
        .select("*")
        .eq("period_start", start)
        .eq("period_end", end)
        .neq("status", "void")
        .order("net_payable", { ascending: false });
      if (error) throw error;
      setStatements((data || []) as unknown as PayoutStatement[]);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[payout-statements] load failed", err);
      toast.error("Could not load payout statements");
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  const loadVatSettings = useCallback(async () => {
    const { data } = await supabase
      .from("billing_global_defaults")
      .select("vat_enabled, vat_rate, vat_number, company_legal_name, company_address");
    const rows = (data || []) as unknown as VatSettings[];
    const active = rows.find((r) => r.vat_enabled) || rows[0];
    if (active) setVat({ ...DEFAULT_VAT_SETTINGS, ...active });
  }, []);

  /** Settled payments in the period that no live statement has claimed, plus failures. */
  const loadUnassigned = useCallback(async () => {
    try {
      const fromIso = new Date(`${start}T00:00:00Z`).toISOString();
      const toIso = new Date(new Date(`${end}T00:00:00Z`).getTime() + 86400000).toISOString();

      const [{ data: txs }, { data: claimedLines }] = await Promise.all([
        supabase
          .from("payment_transactions")
          .select(
            `id, booking_id, amount, currency, status, created_at,
             bookings(guest_name, rol_reference, property_id, properties!bookings_property_id_fkey(name))`,
          )
          .gte("created_at", fromIso)
          .lt("created_at", toIso)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("property_payout_statement_lines")
          .select("payment_transaction_id, property_payout_statements!inner(status)")
          .not("payment_transaction_id", "is", null),
      ]);

      const claimed = new Set(
        ((claimedLines || []) as unknown as {
          payment_transaction_id: string | null;
          property_payout_statements: { status: string } | null;
        }[])
          .filter((l) => l.property_payout_statements?.status !== "void")
          .map((l) => l.payment_transaction_id)
          .filter((v): v is string => !!v),
      );

      const rows: UnassignedPayment[] = ((txs || []) as unknown as Record<string, never>[])
        .map((tx) => {
          const t = tx as unknown as {
            id: string;
            booking_id: string | null;
            amount: number;
            currency: string | null;
            status: string;
            created_at: string;
            bookings?: {
              guest_name: string | null;
              rol_reference: string | null;
              property_id: string | null;
              properties?: { name: string | null } | null;
            } | null;
          };
          const status = String(t.status || "").toLowerCase();
          const settled = SETTLED_TX_STATUSES.includes(status);
          const expired =
            status === "pending" && Date.now() - new Date(t.created_at).getTime() > PENDING_SESSION_MS;

          let reason: UnassignedPayment["reason"] | null = null;
          if (settled && !claimed.has(t.id)) reason = "unassigned";
          else if (status === "failed") reason = "failed";
          else if (expired) reason = "expired";
          if (!reason) return null;

          return {
            id: t.id,
            booking_id: t.booking_id,
            property_id: t.bookings?.property_id ?? null,
            property_name: t.bookings?.properties?.name ?? null,
            guest_name: t.bookings?.guest_name ?? null,
            rol_reference: t.bookings?.rol_reference ?? null,
            amount: Number(t.amount) || 0,
            currency: t.currency || "ZAR",
            status,
            created_at: t.created_at,
            reason,
          } satisfies UnassignedPayment;
        })
        .filter((r): r is UnassignedPayment => r !== null);

      setUnassigned(rows);
    } catch (err) {
      console.error("[payout-statements] unassigned load failed", err);
    }
  }, [start, end]);

  useEffect(() => {
    loadStatements();
    loadUnassigned();
    loadVatSettings();
  }, [loadStatements, loadUnassigned, loadVatSettings]);

  const invoke = useCallback(
    async (body: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("generate-payout-statements", { body });
      if (error) {
        const details =
          "context" in error && error.context instanceof Response
            ? await error.context.text()
            : error.message;
        throw new Error(details);
      }
      const payload = data as { success: boolean; error?: string; data?: unknown };
      if (!payload?.success) throw new Error(payload?.error || "Statement run failed");
      return payload.data;
    },
    [],
  );

  const generate = useCallback(async () => {
    setRunning(true);
    try {
      const result = (await invoke({
        action: "generate",
        period_start: start,
        period_end: end,
      })) as { statements?: unknown[] };
      const count = result?.statements?.length ?? 0;
      toast.success(count ? `${count} statement${count === 1 ? "" : "s"} prepared` : "Nothing to statement for this period");
      await Promise.all([loadStatements(), loadUnassigned()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Statement run failed");
    } finally {
      setRunning(false);
    }
  }, [invoke, start, end, loadStatements, loadUnassigned]);

  const finalise = useCallback(
    async (statementId: string) => {
      setRunning(true);
      try {
        await invoke({ action: "finalise", statement_id: statementId });
        toast.success("Statement finalised — references issued");
        await Promise.all([loadStatements(), loadUnassigned()]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not finalise statement");
      } finally {
        setRunning(false);
      }
    },
    [invoke, loadStatements, loadUnassigned],
  );

  const markPaid = useCallback(
    async (statementId: string, bankReference?: string) => {
      setRunning(true);
      try {
        await invoke({
          action: "mark_paid",
          statement_id: statementId,
          bank_payment_reference: bankReference,
        });
        toast.success("Statement marked paid");
        await loadStatements();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not mark statement paid");
      } finally {
        setRunning(false);
      }
    },
    [invoke, loadStatements],
  );

  const voidStatement = useCallback(
    async (statementId: string, reason?: string) => {
      setRunning(true);
      try {
        await invoke({ action: "void", statement_id: statementId, reason });
        toast.success("Statement voided");
        await Promise.all([loadStatements(), loadUnassigned()]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not void statement");
      } finally {
        setRunning(false);
      }
    },
    [invoke, loadStatements, loadUnassigned],
  );

  const totals = useMemo(
    () => ({
      netPayable: statements.reduce((s, x) => s + x.net_payable, 0),
      invoiced: statements.reduce((s, x) => s + x.invoice_total, 0),
      recoveries: statements.reduce((s, x) => s + x.byo_commission + x.recurring_fees, 0),
      gross: statements.reduce((s, x) => s + x.gross_amount, 0),
      commission: statements.reduce((s, x) => s + x.rol_commission + x.byo_commission, 0),
      drafts: statements.filter((x) => x.status === "draft").length,
      unpaid: statements.filter((x) => x.status === "finalised").length,
      count: statements.length,
    }),
    [statements],
  );

  return {
    statements,
    unassigned,
    vat,
    loading,
    running,
    lastUpdated,
    totals,
    refresh: loadStatements,
    generate,
    finalise,
    markPaid,
    voidStatement,
  };
}

/** Full detail (lines + payments) for one statement. */
export function usePayoutStatementDetail(statementId: string | null) {
  const [detail, setDetail] = useState<PayoutStatementDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!statementId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      const [{ data: statement, error }, { data: lines }, { data: payments }] = await Promise.all([
        supabase.from("property_payout_statements").select("*").eq("id", statementId).single(),
        supabase
          .from("property_payout_statement_lines")
          .select("*")
          .eq("statement_id", statementId)
          .order("line_date", { ascending: true }),
        supabase
          .from("property_payout_statement_payments")
          .select("*")
          .eq("statement_id", statementId),
      ]);
      if (error) throw error;
      setDetail({
        ...(statement as unknown as PayoutStatement),
        lines: (lines || []) as unknown as PayoutStatementLine[],
        payments: (payments || []) as unknown as PayoutStatementPayment[],
      });
    } catch (err) {
      console.error("[payout-statements] detail failed", err);
      toast.error("Could not load statement detail");
    } finally {
      setLoading(false);
    }
  }, [statementId]);

  useEffect(() => {
    load();
  }, [load]);

  return { detail, loading, refresh: load };
}
