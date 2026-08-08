import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, MoreHorizontal, Paperclip, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { normaliseCurrency } from "@/lib/burnRate";
import { openInvoiceDocument } from "./InvoiceDocumentField";

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
  is_paid: boolean;
  document_path?: string | null;
  document_name?: string | null;
}


interface InvoiceTableProps {
  invoices: Invoice[];
  isLoading: boolean;
  onEdit: (invoice: Invoice) => void;
}

const BILLING_COLORS: Record<string, string> = {
  monthly: "bg-blue-500/10 text-blue-500",
  annual: "bg-purple-500/10 text-purple-500",
  quarterly: "bg-cyan-500/10 text-cyan-500",
  once_off: "bg-green-500/10 text-green-500",
};

export function InvoiceTable({ invoices, isLoading, onEdit }: InvoiceTableProps) {
  const [billingFilter, setBillingFilter] = useState<string>("all");
  const [paidFilter, setPaidFilter] = useState<string>("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const queryClient = useQueryClient();

  const togglePaidMutation = useMutation({
    mutationFn: async ({ id, is_paid }: { id: string; is_paid: boolean }) => {
      const { error } = await supabase
        .from("invoices")
        .update({ is_paid, paid_at: is_paid ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    },
  });

  const filteredInvoices = invoices.filter((inv) => {
    if (billingFilter !== "all" && inv.billing_type !== billingFilter) return false;
    if (paidFilter === "paid" && !inv.is_paid) return false;
    if (paidFilter === "unpaid" && inv.is_paid) return false;
    if (currencyFilter !== "all" && normaliseCurrency(inv.source_currency) !== currencyFilter)
      return false;
    return true;
  });

  const formatMoney = (value: number, currency: string) =>
    new Intl.NumberFormat(currency === "ZAR" ? "en-ZA" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <Select value={billingFilter} onValueChange={setBillingFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Billing type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="annual">Annual</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="once_off">Once-off</SelectItem>
          </SelectContent>
        </Select>

        <Select value={paidFilter} onValueChange={setPaidFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Payment status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>

        <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Currencies</SelectItem>
            <SelectItem value="ZAR">ZAR</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Paid</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Billed in</TableHead>
              <TableHead className="text-right">ZAR</TableHead>
              <TableHead className="text-right text-muted-foreground">EUR</TableHead>
              <TableHead className="text-right text-muted-foreground">USD</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  No invoices found
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((invoice) => {
                const currency = normaliseCurrency(invoice.source_currency);
                return (
                  <TableRow key={invoice.id} className={invoice.is_paid ? "opacity-60" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={invoice.is_paid}
                        onCheckedChange={(checked) =>
                          togglePaidMutation.mutate({
                            id: invoice.id,
                            is_paid: checked as boolean,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">{invoice.description}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoice.vendor || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={BILLING_COLORS[invoice.billing_type]}
                      >
                        {invoice.billing_type.replace("_", "-")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{currency}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {invoice.cost_zar ? formatMoney(Number(invoice.cost_zar), "ZAR") : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground text-sm">
                      {invoice.cost_eur ? formatMoney(Number(invoice.cost_eur), "EUR") : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground text-sm">
                      {invoice.cost_usd ? formatMoney(Number(invoice.cost_usd), "USD") : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(invoice.invoice_date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(invoice)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => deleteMutation.mutate(invoice.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
