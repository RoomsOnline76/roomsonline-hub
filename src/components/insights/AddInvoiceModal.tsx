import { useState, useEffect } from "react";
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

interface Invoice {
  id: string;
  description: string;
  cost_usd: number;
  cost_zar: number | null;
  billing_type: string;
  category: string | null;
  vendor: string | null;
  invoice_date: string;
  due_date: string | null;
  is_paid: boolean;
  notes: string | null;
}

interface AddInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingInvoice: Invoice | null;
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
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
  { value: "quarterly", label: "Quarterly" },
  { value: "once_off", label: "Once-off" },
];

export function AddInvoiceModal({
  open,
  onOpenChange,
  editingInvoice,
}: AddInvoiceModalProps) {
  const [formData, setFormData] = useState({
    description: "",
    cost_usd: "",
    cost_zar: "",
    billing_type: "monthly",
    category: "other",
    vendor: "",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: "",
    is_paid: false,
    notes: "",
  });

  const queryClient = useQueryClient();
  const isEditing = !!editingInvoice;

  useEffect(() => {
    if (editingInvoice) {
      setFormData({
        description: editingInvoice.description,
        cost_usd: String(editingInvoice.cost_usd),
        cost_zar: editingInvoice.cost_zar ? String(editingInvoice.cost_zar) : "",
        billing_type: editingInvoice.billing_type,
        category: editingInvoice.category || "other",
        vendor: editingInvoice.vendor || "",
        invoice_date: editingInvoice.invoice_date,
        due_date: editingInvoice.due_date || "",
        is_paid: editingInvoice.is_paid,
        notes: editingInvoice.notes || "",
      });
    } else {
      setFormData({
        description: "",
        cost_usd: "",
        cost_zar: "",
        billing_type: "monthly",
        category: "other",
        vendor: "",
        invoice_date: new Date().toISOString().split("T")[0],
        due_date: "",
        is_paid: false,
        notes: "",
      });
    }
  }, [editingInvoice, open]);

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: userData } = await supabase.auth.getUser();

      const parsedUsd = parseFloat(data.cost_usd);
      const parsedZar = parseFloat(data.cost_zar);

      const payload = {
        description: data.description,
        cost_usd: isNaN(parsedUsd) ? 0 : parsedUsd,
        cost_zar: data.cost_zar && !isNaN(parsedZar) ? parsedZar : null,
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
    if (!formData.cost_zar || isNaN(parseFloat(formData.cost_zar))) {
      toast.error("Valid ZAR amount is required");
      return;
    }
    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Invoice" : "Add Invoice"}
          </DialogTitle>
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
                <Label htmlFor="cost_zar">Amount (ZAR) *</Label>
                <Input
                  id="cost_zar"
                  type="number"
                  step="0.01"
                  value={formData.cost_zar}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, cost_zar: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cost_usd" className="text-muted-foreground">Amount (USD)</Label>
                <Input
                  id="cost_usd"
                  type="number"
                  step="0.01"
                  value={formData.cost_usd}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, cost_usd: e.target.value }))
                  }
                  placeholder="0.00"
                  className="border-muted"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="billing_type">Billing Type</Label>
                <Select
                  value={formData.billing_type}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, billing_type: value }))
                  }
                >
                  <SelectTrigger>
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
                  <SelectTrigger>
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
