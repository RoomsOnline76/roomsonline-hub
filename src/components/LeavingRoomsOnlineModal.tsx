import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface LeavingRoomsOnlineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  externalUrl: string;
  propertyName?: string;
}

export default function LeavingRoomsOnlineModal({
  open,
  onOpenChange,
  externalUrl,
  propertyName,
}: LeavingRoomsOnlineModalProps) {
  const handleContinue = () => {
    window.open(externalUrl, '_blank');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5 text-primary" />
            Leaving RoomsOnline
          </DialogTitle>
          <DialogDescription className="pt-2">
            You are about to be redirected to an external booking page
            {propertyName ? ` for ${propertyName}` : ''}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            This property uses a third-party booking system. You will complete your reservation on their secure booking platform.
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleContinue}
            className="w-full sm:w-auto"
          >
            Continue to Booking
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
