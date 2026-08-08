import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  convertToZar,
  formatZar,
  normaliseCurrency,
  DEFAULT_FX,
  type BillCurrency,
  type FxRates,
} from "@/lib/burnRate";
import {
  InvoiceDocumentField,
  emptyInvoiceDocument,
  type InvoiceDocument,
} from "./InvoiceDocumentField";


interface Invoice {
  id: string;
  description: string;
  cost_usd: number;
  cost_zar: number | null;
  cost_eur?: number | null;
  source_currency?: string | null;
  billing_type: string;
  category: string | null;
  vendor: string | null;
  invoice_date: string;
  due_date: string | null;
  is_paid: boolean;
  notes: string | null;
  document_path?: string | null;
  document_name?: string | null;
  document_size?: number | null;
  document_type?: string | null;
}


interface AddInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingInvoice: Invoice | null;
  /** Exchange rates from the latest financial snapshot. */
  fxRates?: FxRates;
}

const CATEGORIES = [
  { value: "hosting", label: "Hosting / Infrastructure" },
  { value: "pms", label: "PMS / Channel Manager" },
  { value: "marketing", label: "Marketing" },
  { value: "salary", label: "Salary / Contractor" },
  { value: "software", label: "Software / SaaS" },
  { value: "legal", label: "Legal / Compliance" },
  { value: "other", label: "Other" },
];

const BILLING_TYPES = [
  { value: "monthly", label: "Monthly (recurring)" },
  { value: "quarterly", label: "Quarterly (recurring)" },
  { value: "annual", label: "Annual (recurring)" },
  { value: "once_off", label: "Once-off" },
];

const CURRENCIES: { value: BillCurrency; label: string }[] = [
  { value: "ZAR", label: "ZAR — Rand" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "USD", label: "USD — Dollar" },
];

const emptyForm = {
  description: "",
  currency: "ZAR" as BillCurrency,
  amount: "",
  billing_type: "monthly",
  category: "other",
  vendor: "",
  invoice_date: new Date().toISOString().split("T")[0],
  due_date: "",
  is_paid: false,
  notes: "",
  ...emptyInvoiceDocument,
};


export function AddInvoiceModal({
  open,
  onOpenChange,
  editingInvoice,
  fxRates = DEFAULT_FX,
}: AddInvoiceModalProps) {
  const [formData, setFormData] = useState(emptyForm);

  const queryClient = useQueryClient();
  const isEditing = !!editingInvoice;

  useEffect(() => {
    if (editingInvoice) {
      const currency = normaliseCurrency(editingInvoice.source_currency);
      const own =
        currency === "EUR"
          ? editingInvoice.cost_eur
          : currency === "USD"
            ? editingInvoice.cost_usd
            : editingInvoice.cost_zar;
      setFormData({
        description: editingInvoice.description,
        currency,
        amount: own !== null && own !== undefined ? String(own) : "",
        billing_type: editingInvoice.billing_type,
        category: editingInvoice.category || "other",
        vendor: editingInvoice.vendor || "",
        invoice_date: editingInvoice.invoice_date,
        due_date: editingInvoice.due_date || "",
        is_paid: editingInvoice.is_paid,
        notes: editingInvoice.notes || "",
        document_path: editingInvoice.document_path ?? null,
        document_name: editingInvoice.document_name ?? null,
        document_size: editingInvoice.document_size ?? null,
        document_type: editingInvoice.document_type ?? null,
      });

    } else {
      setFormData({ ...emptyForm, invoice_date: new Date().toISOString().split("T")[0] });
    }
  }, [editingInvoice, open]);

  const parsedAmount = parseFloat(formData.amount);
  const zarEquivalent = useMemo(() => {
    if (!Number.isFinite(parsedAmount)) return null;
    return convertToZar(parsedAmount, formData.currency, fxRates);
  }, [parsedAmount, formData.currency, fxRates]);

  const rateLabel =
    formData.currency === "EUR"
      ? `1 EUR = R${(fxRates.eurZar || DEFAULT_FX.eurZar).toFixed(2)}`
      : formData.currency === "USD"
        ? `1 USD = R${(fxRates.usdZar || DEFAULT_FX.usdZar).toFixed(2)}`
        : null;

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: userData } = await supabase.auth.getUser();

      const amount = parseFloat(data.amount);
      const zar = convertToZar(amount, data.currency, fxRates);

      const payload = {
        description: data.description,
        source_currency: data.currency,
        cost_zar: Math.round(zar * 100) / 100,
        cost_usd:
          data.currency === "USD"
            ? amount
            : Math.round((zar / (fxRates.usdZar || DEFAULT_FX.usdZar)) * 100) / 100,
        cost_eur: data.currency === "EUR" ? amount : null,
        billing_type: data.billing_type,
        category: data.category,
        vendor: data.vendor || null,
        invoice_date: data.invoice_date || new Date().toISOString().split("T")[0],
        due_date: data.due_date || null,
        is_paid: data.is_paid,
        notes: data.notes || null,
        created_by: userData.user?.id,
      };

      if (isEditing && editingInvoice) {
        const { error } = await supabase
          .from("invoices")
          .update(payload)
          .eq("id", editingInvoice.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("invoices").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(isEditing ? "Invoice updated" : "Invoice added");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to save: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description.trim()) {
      toast.error("Description is required");
      return;
    }
    if (!formData.amount || !Number.isFinite(parseFloat(formData.amount))) {
      toast.error(`Valid ${formData.currency} amount is required`);
      return;
    }
    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Invoice" : "Add Invoice"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="e.g., Supabase Pro Plan"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="currency">Bill Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, currency: value as BillCurrency }))
                  }
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency.value} value={currency.value}>
                        {currency.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount ({formData.currency}) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </div>
            </div>

            {formData.currency !== "ZAR" && (
              <p className="text-xs text-muted-foreground">
                {rateLabel}
                {zarEquivalent !== null && (
                  <>
                    {" · "}
                    <span className="font-medium text-foreground">
                      {formatZar(zarEquivalent)}
                    </span>{" "}
                    will be recorded in Rand
                  </>
                )}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="billing_type">Billing Type</Label>
                <Select
                  value={formData.billing_type}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, billing_type: value }))
                  }
                >
                  <SelectTrigger id="billing_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILLING_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, category: value }))
                  }
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.billing_type !== "once_off" && (
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                Recurring bill: this commitment counts once towards monthly burn.
                Loading later invoices for the same vendor and description updates the
                price rather than adding to the burn.
              </p>
            )}

            <div className="grid gap-2">
              <Label htmlFor="vendor">Vendor</Label>
              <Input
                id="vendor"
                value={formData.vendor}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, vendor: e.target.value }))
                }
                placeholder="e.g., Supabase"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="invoice_date">Invoice Date</Label>
                <Input
                  id="invoice_date"
                  type="date"
                  value={formData.invoice_date}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, invoice_date: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, due_date: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Additional notes..."
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_paid">Paid</Label>
              <Switch
                id="is_paid"
                checked={formData.is_paid}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_paid: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {isEditing ? "Update" : "Add Invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
