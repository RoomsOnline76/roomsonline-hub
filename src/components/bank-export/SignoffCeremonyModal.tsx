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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSubmitSignoff } from "@/hooks/useBankExport";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Fingerprint,
  FileCheck,
} from "lucide-react";

interface SignoffCeremonyModalProps {
  batch: {
    id: string;
    batch_reference: string;
    total_amount: number;
    total_records: number;
    bank_provider: string;
    status: string;
  } | null;
  hasDevSignoff: boolean;
  hasFLSignoff: boolean;
  signoffs: Array<{
    user_role: string;
    user_email: string;
    signed_at: string;
  }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SignoffCeremonyModal({
  batch,
  hasDevSignoff,
  hasFLSignoff,
  signoffs,
  open,
  onOpenChange,
  onSuccess,
}: SignoffCeremonyModalProps) {
  const { isDev, isFearlessLeader, user } = useAuth();
  const [acknowledgment, setAcknowledgment] = useState("");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [understandChecked, setUnderstandChecked] = useState(false);

  const submitSignoff = useSubmitSignoff();

  // Determine if current user can sign
  const userRole = isDev ? "dev" : isFearlessLeader ? "fearless_leader" : null;
  const hasAlreadySigned =
    (isDev && hasDevSignoff) || (isFearlessLeader && hasFLSignoff);
  const canSign = userRole && !hasAlreadySigned;

  const isFormValid =
    acknowledgment.trim().length >= 20 && confirmChecked && understandChecked;

  const handleSubmit = async () => {
    if (!batch || !isFormValid) return;

    try {
      await submitSignoff.mutateAsync({
        batchId: batch.id,
        acknowledgmentText: acknowledgment,
      });
      setAcknowledgment("");
      setConfirmChecked(false);
      setUnderstandChecked(false);
      onSuccess?.();
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (!batch) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Sign-off Ceremony
          </DialogTitle>
          <DialogDescription>
            Dual authorization required for batch {batch.batch_reference}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Batch Summary */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Reference</p>
                <p className="font-mono font-bold">{batch.batch_reference}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Bank</p>
                <p className="font-medium capitalize">
                  {batch.bank_provider.replace("_", " ")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Amount</p>
                <p className="text-xl font-bold text-primary">
                  {formatCurrency(batch.total_amount)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Records</p>
                <p className="text-xl font-bold">{batch.total_records}</p>
              </div>
            </div>
          </div>

          {/* Signoff Status */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Fingerprint className="h-4 w-4" />
              Authorization Status
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {/* Developer Signoff */}
              <div
                className={`rounded-lg border p-3 ${
                  hasDevSignoff
                    ? "border-green-500/50 bg-green-500/5"
                    : "border-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {hasDevSignoff ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">Developer</span>
                </div>
                {signoffs.find((s) => s.user_role === "dev") ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {signoffs.find((s) => s.user_role === "dev")?.user_email}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Awaiting</p>
                )}
              </div>

              {/* Fearless Leader Signoff */}
              <div
                className={`rounded-lg border p-3 ${
                  hasFLSignoff
                    ? "border-green-500/50 bg-green-500/5"
                    : "border-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {hasFLSignoff ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">Fearless Leader</span>
                </div>
                {signoffs.find((s) => s.user_role === "fearless_leader") ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {
                      signoffs.find((s) => s.user_role === "fearless_leader")
                        ?.user_email
                    }
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Awaiting</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Signoff Form or Status Message */}
          {hasAlreadySigned ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                You have already signed off on this batch. Awaiting the other
                signatory.
              </AlertDescription>
            </Alert>
          ) : !canSign ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You do not have permission to sign off on batches. Only
                developers and the fearless leader can authorize exports.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="acknowledgment">
                  Acknowledgment Statement{" "}
                  <span className="text-muted-foreground">(min 20 chars)</span>
                </Label>
                <Textarea
                  id="acknowledgment"
                  value={acknowledgment}
                  onChange={(e) => setAcknowledgment(e.target.value)}
                  placeholder="I have reviewed this batch thoroughly and confirm the total amount of R... to be paid to ... properties is correct..."
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {acknowledgment.length} / 20 minimum
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="confirm"
                    checked={confirmChecked}
                    onCheckedChange={(checked) =>
                      setConfirmChecked(checked === true)
                    }
                  />
                  <Label
                    htmlFor="confirm"
                    className="text-sm leading-relaxed cursor-pointer"
                  >
                    I confirm that I have reviewed all payout lines and verified
                    the amounts are correct.
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="understand"
                    checked={understandChecked}
                    onCheckedChange={(checked) =>
                      setUnderstandChecked(checked === true)
                    }
                  />
                  <Label
                    htmlFor="understand"
                    className="text-sm leading-relaxed cursor-pointer"
                  >
                    I understand this action is irreversible once the batch is
                    exported. This signature will be cryptographically logged.
                  </Label>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {canSign && (
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || submitSignoff.isPending}
              className="gap-2"
            >
              {submitSignoff.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileCheck className="h-4 w-4" />
              )}
              Submit Signoff
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
