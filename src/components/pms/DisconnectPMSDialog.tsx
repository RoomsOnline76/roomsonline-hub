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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

export type DisconnectAction = 'keep_inactive' | 'convert_native' | 'delete';

interface DisconnectPMSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemName: string;
  affectedPropertyCount: number;
  onConfirm: (action: DisconnectAction) => Promise<void>;
}

export function DisconnectPMSDialog({
  open,
  onOpenChange,
  systemName,
  affectedPropertyCount,
  onConfirm,
}: DisconnectPMSDialogProps) {
  const [selectedAction, setSelectedAction] = useState<DisconnectAction>('keep_inactive');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm(selectedAction);
      onOpenChange(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Disconnect {systemName} Integration
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will affect <strong>{affectedPropertyCount} {affectedPropertyCount === 1 ? 'property' : 'properties'}</strong> currently managed by {systemName}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <p className="text-sm font-medium mb-3">Choose what happens to these properties:</p>
          <RadioGroup
            value={selectedAction}
            onValueChange={(value) => setSelectedAction(value as DisconnectAction)}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="keep_inactive" id="keep_inactive" className="mt-0.5" />
              <div>
                <Label htmlFor="keep_inactive" className="font-medium cursor-pointer">
                  Keep as inactive
                </Label>
                <p className="text-sm text-muted-foreground">
                  Preserve data, disable booking. Properties remain but won't accept bookings.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <RadioGroupItem value="convert_native" id="convert_native" className="mt-0.5" />
              <div>
                <Label htmlFor="convert_native" className="font-medium cursor-pointer">
                  Convert to ROL-managed
                </Label>
                <p className="text-sm text-muted-foreground">
                  You'll need to set up availability & rates manually. All data preserved.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <RadioGroupItem value="delete" id="delete" className="mt-0.5" />
              <div>
                <Label htmlFor="delete" className="font-medium cursor-pointer text-destructive">
                  Delete properties
                </Label>
                <p className="text-sm text-muted-foreground">
                  Permanently remove all properties and associated data. This cannot be undone.
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isProcessing}
            className={selectedAction === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''}
          >
            {isProcessing ? 'Processing...' : 'Disconnect'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
