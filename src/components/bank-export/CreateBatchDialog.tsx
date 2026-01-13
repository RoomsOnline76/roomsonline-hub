import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateBatch, useLedgerSummary } from "@/hooks/useBankExport";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CreateBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const bankProviders = [
  { value: "standard_bank", label: "Standard Bank" },
  { value: "absa", label: "ABSA" },
  { value: "fnb", label: "FNB" },
  { value: "nedbank", label: "Nedbank" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function CreateBatchDialog({ open, onOpenChange }: CreateBatchDialogProps) {
  const [bankProvider, setBankProvider] = useState<string>("");
  const { data: summary, isLoading: summaryLoading } = useLedgerSummary();
  const createBatch = useCreateBatch();

  const eligibleAmount = summary?.total_eligible_amount || 0;
  const eligibleCount = summary?.total_eligible || 0;
  const propertiesWithEligible = summary?.by_property.filter(p => p.eligible_count > 0) || [];

  const handleCreate = async () => {
    if (!bankProvider) return;
    
    try {
      await createBatch.mutateAsync({ bankProvider });
      onOpenChange(false);
      setBankProvider("");
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Export Batch</DialogTitle>
          <DialogDescription>
            Create a new payout batch from all eligible entries. This will lock the entries until the batch is processed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className="rounded-lg border p-4 bg-muted/30">
            <h4 className="font-medium mb-2">Eligible for Payout</h4>
            {summaryLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : eligibleCount === 0 ? (
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                No eligible entries available
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="text-lg font-bold text-green-600">
                    {formatCurrency(eligibleAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Entries</span>
                  <span>{eligibleCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Properties</span>
                  <span>{propertiesWithEligible.length}</span>
                </div>
              </div>
            )}
          </div>

          {/* Properties breakdown */}
          {propertiesWithEligible.length > 0 && (
            <div className="rounded-lg border p-4">
              <h4 className="font-medium mb-2 text-sm">Properties Included</h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {propertiesWithEligible.map((prop) => (
                  <div key={prop.property_id} className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1">{prop.property_name}</span>
                    <Badge variant="outline" className="ml-2">
                      {formatCurrency(prop.eligible_amount)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bank Provider */}
          <div className="space-y-2">
            <Label htmlFor="bank-provider">Bank Provider</Label>
            <Select value={bankProvider} onValueChange={setBankProvider}>
              <SelectTrigger id="bank-provider">
                <SelectValue placeholder="Select bank for export" />
              </SelectTrigger>
              <SelectContent>
                {bankProviders.map((bank) => (
                  <SelectItem key={bank.value} value={bank.value}>
                    {bank.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Warning */}
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">This action locks entries</p>
                <p className="text-amber-700 mt-1">
                  Once a batch is created, the included ledger entries will be locked until the batch is completed or cancelled.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreate}
            disabled={!bankProvider || eligibleCount === 0 || createBatch.isPending}
          >
            {createBatch.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Create Batch
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
