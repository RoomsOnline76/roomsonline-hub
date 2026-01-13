import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBatchDetails,
  useValidateBatch,
  useSubmitSignoff,
  useGenerateCSV,
  useCancelBatch,
} from "@/hooks/useBankExport";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Shield,
  Clock,
  FileSpreadsheet,
} from "lucide-react";

interface BatchDetailsModalProps {
  batchId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BatchDetailsModal({ batchId, open, onOpenChange }: BatchDetailsModalProps) {
  const { isDev, isFearlessLeader, user } = useAuth();
  const [acknowledgment, setAcknowledgment] = useState("");
  const [showSignoffForm, setShowSignoffForm] = useState(false);

  const { data, isLoading, error } = useBatchDetails(batchId || undefined);
  const validateBatch = useValidateBatch();
  const submitSignoff = useSubmitSignoff();
  const generateCSV = useGenerateCSV();
  const cancelBatch = useCancelBatch();

  const batch = data?.batch;
  const lines = data?.lines || [];
  const signoffs = data?.signoffs || [];

  const canSignoff = 
    (batch?.status === 'draft' || batch?.status === 'awaiting_signoff') &&
    ((isDev && !data?.has_dev_signoff) || (isFearlessLeader && !data?.has_fl_signoff));

  const canExport = batch?.status === 'approved';
  const canCancel = batch?.status !== 'exported' && batch?.status !== 'cancelled';

  const handleValidate = async () => {
    if (!batchId) return;
    const result = await validateBatch.mutateAsync(batchId);
    if (result.is_valid) {
      setShowSignoffForm(true);
    }
  };

  const handleSignoff = async () => {
    if (!batchId || !acknowledgment.trim()) return;
    await submitSignoff.mutateAsync({
      batchId,
      acknowledgmentText: acknowledgment,
    });
    setAcknowledgment("");
    setShowSignoffForm(false);
  };

  const handleExport = async () => {
    if (!batchId) return;
    await generateCSV.mutateAsync(batchId);
  };

  const handleCancel = async () => {
    if (!batchId) return;
    if (confirm("Are you sure you want to cancel this batch? Entries will be unlocked.")) {
      await cancelBatch.mutateAsync({ batchId });
      onOpenChange(false);
    }
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <Skeleton className="h-6 w-48" />
          </DialogHeader>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error || !batch) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
          </DialogHeader>
          <p className="text-destructive">Failed to load batch details</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {batch.batch_reference}
          </DialogTitle>
          <DialogDescription>
            Created by {batch.profiles?.full_name || batch.profiles?.email || 'Unknown'} on {formatDate(batch.created_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Total Amount</p>
              <p className="text-xl font-bold">{formatCurrency(batch.total_amount)}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Records</p>
              <p className="text-xl font-bold">{batch.total_records}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Bank</p>
              <p className="text-lg font-medium capitalize">{batch.bank_provider.replace('_', ' ')}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={batch.status === 'exported' ? 'default' : 'outline'} className="mt-1">
                {batch.status.replace('_', ' ')}
              </Badge>
            </div>
          </div>

          {/* Signoff Status */}
          <div className="rounded-lg border p-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Dual Sign-off Status
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                {data?.has_dev_signoff ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Clock className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium">Developer</p>
                  {signoffs.find(s => s.user_role === 'dev') ? (
                    <p className="text-sm text-muted-foreground">
                      {signoffs.find(s => s.user_role === 'dev')?.user_email}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Pending</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {data?.has_fl_signoff ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Clock className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium">Fearless Leader</p>
                  {signoffs.find(s => s.user_role === 'fearless_leader') ? (
                    <p className="text-sm text-muted-foreground">
                      {signoffs.find(s => s.user_role === 'fearless_leader')?.user_email}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Pending</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Validation Result */}
          {validateBatch.data && (
            <div className={`rounded-lg border p-4 ${validateBatch.data.is_valid ? 'border-green-500/50 bg-green-500/5' : 'border-red-500/50 bg-red-500/5'}`}>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                {validateBatch.data.is_valid ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                Validation {validateBatch.data.is_valid ? 'Passed' : 'Failed'}
              </h4>
              {validateBatch.data.errors.length > 0 && (
                <ul className="text-sm text-red-600 list-disc list-inside">
                  {validateBatch.data.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
              {validateBatch.data.warnings.length > 0 && (
                <ul className="text-sm text-amber-600 list-disc list-inside mt-2">
                  {validateBatch.data.warnings.map((warn, i) => (
                    <li key={i}>{warn}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Signoff Form */}
          {showSignoffForm && canSignoff && (
            <div className="rounded-lg border border-primary/50 p-4 bg-primary/5">
              <h4 className="font-medium mb-3">Sign Off on This Batch</h4>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="acknowledgment">Acknowledgment Statement</Label>
                  <Textarea
                    id="acknowledgment"
                    value={acknowledgment}
                    onChange={(e) => setAcknowledgment(e.target.value)}
                    placeholder="I confirm that I have reviewed this batch and authorize the payment..."
                    rows={3}
                  />
                </div>
                <Button 
                  onClick={handleSignoff}
                  disabled={!acknowledgment.trim() || submitSignoff.isPending}
                >
                  {submitSignoff.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  Submit Signoff
                </Button>
              </div>
            </div>
          )}

          <Separator />

          {/* Lines Table */}
          <div>
            <h4 className="font-medium mb-3">Payout Lines</h4>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead>Beneficiary</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">
                        {line.properties?.name || 'Unknown'}
                      </TableCell>
                      <TableCell>{line.beneficiary_name}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {line.bank_name} • {line.account_number_masked}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(line.amount)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {line.payment_reference}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {canCancel && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelBatch.isPending}
            >
              {cancelBatch.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancel Batch
            </Button>
          )}
          
          <div className="flex-1" />
          
          {canSignoff && !showSignoffForm && (
            <Button
              variant="outline"
              onClick={handleValidate}
              disabled={validateBatch.isPending}
            >
              {validateBatch.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Validate & Sign Off
            </Button>
          )}
          
          {canExport && (
            <Button onClick={handleExport} disabled={generateCSV.isPending}>
              {generateCSV.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download CSV
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
