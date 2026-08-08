import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  InvoiceDocumentField,
  emptyInvoiceDocument,
  type InvoiceDocument,
} from "./InvoiceDocumentField";
import { CONTRIBUTORS, type Contribution } from "@/lib/costSharing";
import { convertToZar, normaliseCurrency, type FxRates } from "@/lib/burnRate";

interface AddContributionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: (Contribution & InvoiceDocument) | null;
  fxRates: FxRates;
}

const emptyForm = {
  contributor_key: "carike",
  contribution_date: new Date().toISOString().slice(0, 10),
  amount: "",
  source_currency: "ZAR",
  method: "",
  reference: "",
  notes: "",
};

export function AddContributionModal({
  open,
  onOpenChange,
  editing,
  fxRates,
}: AddContributionModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [document, setDocument] = useState<InvoiceDocument>({ ...emptyInvoiceDocument });

  useEffect(() => {
    if (editing) {
      setForm({
        contributor_key: editing.contributor_key,
        contribution_date: editing.contribution_date,
        amount: String(editing.amount ?? ""),
        source_currency: editing.source_currency ?? "ZAR",
        method: editing.method ?? "",
        reference: editing.reference ?? "",
        notes: editing.notes ?? "",
      });
      setDocument({
        document_path: editing.document_path ?? null,
        document_name: editing.document_name ?? null,
        document_size: editing.document_size ?? null,
        document_type: editing.document_type ?? null,
      });
    } else {
      setForm(emptyForm);
      setDocument({ ...emptyInvoiceDocument });
    }
  }, [editing, open]);

  const save = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
      const currency = normaliseCurrency(form.source_currency);
      const contributor =
        CONTRIBUTORS[form.contributor_key as keyof typeof CONTRIBUTORS] ?? CONTRIBUTORS.carike;

      const payload = {
        contributor_key: contributor.key,
        contributor_name: contributor.name,
        contribution_date: form.contribution_date,
        amount,
        source_currency: currency,
        amount_zar: convertToZar(amount, currency, fxRates),
        method: form.method || null,
        reference: form.reference || null,
        notes: form.notes || null,
        ...document,
      };

      if (editing?.id) {
        const { error } = await supabase
          .from("rol_contributions")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("rol_contributions")
          .insert({ ...payload, created_by: userData.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rol-contributions"] });
      toast.success(editing ? "Contribution updated" : "Contribution captured");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit contribution" : "Capture contribution"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Contributor</Label>
            <Select
              value={form.contributor_key}
              onValueChange={(v) => setForm((f) => ({ ...f, contributor_key: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(CONTRIBUTORS).map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.name} ({c.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.contribution_date}
                onChange={(e) => setForm((f) => ({ ...f, contribution_date: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Currency</Label>
              <Select
                value={form.source_currency}
                onValueChange={(v) => setForm((f) => ({ ...f, source_currency: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZAR">ZAR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="15000.00"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Method</Label>
              <Input
                value={form.method}
                onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
                placeholder="EFT"
              />
            </div>
            <div className="grid gap-2">
              <Label>Reference</Label>
              <Input
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
          </div>

          <InvoiceDocumentField value={document} onChange={setDocument} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : editing ? "Save changes" : "Capture"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
