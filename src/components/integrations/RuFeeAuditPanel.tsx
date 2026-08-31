/**
 * Fee audit panel (Coverage tab).
 *
 * The channel's single-listing read-back (`Pull_ListSpecProp_RS`) omits the
 * `<AdditionalFees>` collection, so no read-back can prove which fees a listing
 * carries. Until the channel returns the block, the authoritative evidence is the
 * newest ACCEPTED outbound property push: this panel parses that payload server-side
 * and reconciles it against the authored charges, so compliance still has a provable
 * fee state per listing.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { RefreshCw, Receipt } from "lucide-react";

interface PublishedFee {
  name: string;
  value: number;
  discriminator_id: number;
  fee_tax_type: number;
}

interface FeeAuditRow {
  property_id: string;
  property_name: string;
  ru_property_id: string | null;
  verdict: "in_sync" | "drift" | "no_evidence" | "not_published";
  evidence_source: string;
  evidence_at: string | null;
  evidence_trace_id: string | null;
  published: { additional_fees: PublishedFee[]; cleaning_price: number; security_deposit: number } | null;
  authored: { fees: Array<{ name: string; amount: number; calculation_method: string | null }>; security_deposit: number };
  drift: { missing_at_channel: string[]; unexpected_at_channel: string[]; deposit_drift: boolean };
}

const VERDICT: Record<FeeAuditRow["verdict"], { label: string; className: string }> = {
  in_sync: { label: "Fees proven in sync", className: "bg-success/10 text-success border-success/30" },
  drift: { label: "Fee drift", className: "bg-destructive/10 text-destructive border-destructive/30" },
  no_evidence: { label: "No accepted push logged", className: "bg-warning/10 text-warning border-warning/30" },
  not_published: { label: "Not published", className: "bg-muted text-muted-foreground border-border" },
};

const money = (n: number) => n.toFixed(2);

export function RuFeeAuditPanel({ propertyId }: { propertyId?: string | null }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FeeAuditRow[]>([]);
  const [note, setNote] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "fee_audit", ...(propertyId ? { property_id: propertyId } : {}) },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error?.message ?? "Fee audit failed");
      setRows((data.properties ?? []) as FeeAuditRow[]);
      setNote(String(data.note ?? ""));
    } catch (e) {
      toast.error("Could not run the fee audit", { description: e instanceof Error ? e.message : String(e) });
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Receipt className="h-4 w-4" /> Fee &amp; deposit audit (outbound evidence)
            </CardTitle>
            <CardDescription className="text-xs">
              {note ||
                "Fee state is audited against the newest accepted outbound property push, because the channel's listing read-back does not return the additional-fees block."}
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Re-audit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No published listings to audit.</p>
        ) : (
          rows.map((r) => (
            <div key={r.property_id} className="rounded-md border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{r.property_name}</span>
                  {r.ru_property_id && (
                    <code className="ml-2 text-[11px] text-muted-foreground">listing {r.ru_property_id}</code>
                  )}
                </div>
                <Badge variant="outline" className={`text-[10px] ${VERDICT[r.verdict].className}`}>
                  {VERDICT[r.verdict].label}
                </Badge>
              </div>

              <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <div className="text-foreground">Published (last accepted push)</div>
                  {r.published ? (
                    <>
                      {r.published.additional_fees.length === 0 && r.published.cleaning_price === 0 ? (
                        <div>No fees on the listing</div>
                      ) : (
                        <ul className="space-y-0.5">
                          {r.published.additional_fees.map((f) => (
                            <li key={`${f.name}-${f.fee_tax_type}`}>
                              {f.name || "(unnamed)"} · {money(f.value)}{" "}
                              <span className="text-[10px]">
                                (type {f.fee_tax_type}, basis {f.discriminator_id})
                              </span>
                            </li>
                          ))}
                          {r.published.cleaning_price > 0 && (
                            <li>Cleaning slot · {money(r.published.cleaning_price)}</li>
                          )}
                        </ul>
                      )}
                      <div>Security deposit · {money(r.published.security_deposit)}</div>
                      <div className="text-[11px]">
                        Evidence {r.evidence_at ? new Date(r.evidence_at).toLocaleString() : "—"}
                        {r.evidence_trace_id ? ` · trace ${r.evidence_trace_id}` : ""}
                      </div>
                    </>
                  ) : (
                    <div>No accepted property push in the wire log yet.</div>
                  )}
                </div>
                <div>
                  <div className="text-foreground">Authored in ROL&apos;OS</div>
                  {r.authored.fees.length === 0 ? (
                    <div>No active fee charges</div>
                  ) : (
                    <ul className="space-y-0.5">
                      {r.authored.fees.map((c) => (
                        <li key={c.name}>
                          {c.name} · {money(c.amount)}
                          {c.calculation_method ? ` (${c.calculation_method})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div>Security deposit · {money(r.authored.security_deposit)}</div>
                </div>
              </div>

              {(r.drift.missing_at_channel.length > 0 ||
                r.drift.unexpected_at_channel.length > 0 ||
                r.drift.deposit_drift) && (
                <p className="text-[11px] text-destructive">
                  {r.drift.missing_at_channel.length > 0 &&
                    `Authored but not in the last accepted push: ${r.drift.missing_at_channel.join(", ")}. `}
                  {r.drift.unexpected_at_channel.length > 0 &&
                    `Published but no longer authored: ${r.drift.unexpected_at_channel.join(", ")}. `}
                  {r.drift.deposit_drift && "Security deposit differs from the authored deposit charges. "}
                  Save the property to fire a fresh fee delta.
                </p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
