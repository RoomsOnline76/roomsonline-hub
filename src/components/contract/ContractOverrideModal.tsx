import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

interface ContractOverrideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  propertyName?: string;
  isLoading?: boolean;
}

export function ContractOverrideModal({
  open,
  onOpenChange,
  onConfirm,
  propertyName,
  isLoading = false,
}: ContractOverrideModalProps) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const MIN_REASON = 10;
  const trimmedReason = reason.trim();
  const missing: string[] = [];
  if (trimmedReason.length < MIN_REASON) {
    missing.push(`a reason of at least ${MIN_REASON} characters`);
  }
  if (!confirmed) missing.push("the acknowledgement tick below");
  const isValid = missing.length === 0;


  const handleConfirm = () => {
    if (isValid) {
      onConfirm(reason.trim());
      setReason("");
      setConfirmed(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setReason("");
      setConfirmed(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
            <AlertTriangle className="h-5 w-5" />
            Override Contract Requirement
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                You are about to allow{" "}
                <strong>{propertyName || "this property"}</strong> to go live
                without a signed contract.
              </p>
              <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                <p className="text-sm text-orange-800">
                  <strong>Warning:</strong> This poses legal and financial risks.
                  Override should only be used in exceptional circumstances.
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="override-reason" className="text-sm font-medium">
              Reason for override <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why the contract requirement is being bypassed (minimum 20 characters)..."
              className="mt-1.5 min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {reason.length}/20 characters minimum
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="confirm-override"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <Label
              htmlFor="confirm-override"
              className="text-sm font-normal leading-tight cursor-pointer"
            >
              I understand this property will be visible on the website without a
              signed contract and accept the associated risks.
            </Label>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!isValid || isLoading}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isLoading ? "Processing..." : "Override & Allow"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
