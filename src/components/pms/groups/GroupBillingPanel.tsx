import { useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Save } from "lucide-react";
import { callGroupsApi } from "@/lib/groupsApi";

export interface GroupRecord {
  id: string;
  property_id: string;
  name: string;
  status: string;
  billing_mode: string | null;
  deposit_amount: number | null;
  contract_ref: string | null;
  cutoff_date: string | null;
  master_folio_id: string | null;
  attrition_rate: number | null;
}

interface GroupBillingPanelProps {
  group: GroupRecord;
  readOnly: boolean;
  onSaved: () => void;
}

const BILLING_MODES = [
  { value: "individual", label: "Individual — each guest settles their own folio" },
  { value: "master", label: "Master — everything bills to the group folio" },
  { value: "hybrid", label: "Hybrid — room to master, extras to the guest" },
];

export default function GroupBillingPanel({ group, readOnly, onSaved }: GroupBillingPanelProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    billing_mode: group.billing_mode || "individual",
    deposit_amount: group.deposit_amount != null ? String(group.deposit_amount) : "",
    contract_ref: group.contract_ref || "",
    cutoff_date: group.cutoff_date || "",
  });

  const needsMasterFolio = form.billing_mode !== "individual";

  const { data: folio, refetch: refetchFolio } = useQuery({
    queryKey: ["group-master-folio", group.id],
    enabled: !!group.master_folio_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolos_folios")
        .select("id, balance, currency, status")
        .eq("id", group.master_folio_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["group-master-folio-txns", group.master_folio_id],
    enabled: !!group.master_folio_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolos_folio_transactions")
        .select("id, description, amount, revenue_stream, created_at")
        .eq("folio_id", group.master_folio_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("rolos_groups" as never)
        .update({
          billing_mode: form.billing_mode,
          deposit_amount: form.deposit_amount ? parseFloat(form.deposit_amount) : null,
          contract_ref: form.contract_ref.trim() || null,
          cutoff_date: form.cutoff_date || null,
        } as never)
        .eq("id", group.id);
      if (error) throw error;

      if (needsMasterFolio && !group.master_folio_id) {
        await callGroupsApi("group_ensure_master_folio", { property_id: group.property_id, group_id: group.id });
      }
      toast.success("Billing settings saved");
      onSaved();
      refetchFolio();
    } catch (err) {
      toast.error("Save failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const openMasterFolio = async () => {
    try {
      await callGroupsApi("group_ensure_master_folio", { property_id: group.property_id, group_id: group.id });
      toast.success("Master folio ready");
      onSaved();
      refetchFolio();
    } catch (err) {
      toast.error("Could not open master folio", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Billing Mode</Label>
        <Select
          value={form.billing_mode}
          disabled={readOnly}
          onValueChange={(v) => setForm((f) => ({ ...f, billing_mode: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BILLING_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Deposit Amount</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            disabled={readOnly}
            value={form.deposit_amount}
            onChange={(e) => setForm((f) => ({ ...f, deposit_amount: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Cut-off Date</Label>
          <Input
            type="date"
            disabled={readOnly}
            value={form.cutoff_date}
            onChange={(e) => setForm((f) => ({ ...f, cutoff_date: e.target.value }))}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Contract Reference</Label>
          <Input
            disabled={readOnly}
            placeholder="Signed contract / PO number"
            value={form.contract_ref}
            onChange={(e) => setForm((f) => ({ ...f, contract_ref: e.target.value }))}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Rooms released after the cut-off date are charged attrition at {Number(group.attrition_rate || 0)}% to the master folio.
      </p>

      {!readOnly && (
        <Button size="sm" onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save billing settings"}
        </Button>
      )}

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Receipt className="h-4 w-4 text-muted-foreground" /> Master Folio
            </p>
            {folio ? (
              <Badge variant="outline" className="text-[10px] capitalize">
                {folio.status}
              </Badge>
            ) : (
              !readOnly && (
                <Button size="sm" variant="outline" onClick={openMasterFolio}>
                  Open master folio
                </Button>
              )
            )}
          </div>

          {folio ? (
            <>
              <p className="text-2xl font-semibold text-foreground">
                {folio.currency || "ZAR"} {Number(folio.balance || 0).toFixed(2)}
              </p>
              {transactions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No transactions posted yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {transactions.map((t) => (
                    <div key={t.id} className="flex items-start justify-between gap-2 text-xs border-b pb-1 last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate">{t.description}</p>
                        <p className="text-muted-foreground">
                          {format(new Date(t.created_at as string), "MMM d, HH:mm")} · {String(t.revenue_stream)}
                        </p>
                      </div>
                      <span className={Number(t.amount) < 0 ? "text-primary" : "text-foreground"}>
                        {Number(t.amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Master and hybrid groups bill to a single group folio. Attrition and group extras post here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
