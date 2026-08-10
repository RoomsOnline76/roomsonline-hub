import { useEffect, useState } from "react";
import { usePortfolioSiblings } from "@/hooks/usePortfolioSiblings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { toast } from "sonner";

interface CopyFromPortfolioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The property that will receive the copied data. */
  propertyId: string;
  title?: string;
  description?: string;
  /** Pulls the data from the chosen source property. */
  onCopy: (sourcePropertyId: string) => Promise<void>;
}

/**
 * Shared "copy from another property in the portfolio" picker.
 * Single-select source; the caller owns the actual read/write.
 */
export function CopyFromPortfolioDialog({
  open,
  onOpenChange,
  propertyId,
  title = "Copy from portfolio",
  description,
  onCopy,
}: CopyFromPortfolioDialogProps) {
  const { siblings, loading } = usePortfolioSiblings(propertyId);
  const [source, setSource] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSource("");
  }, [open]);

  const handleCopy = async () => {
    if (!source) return;
    setSaving(true);
    try {
      await onCopy(source);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copy failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            {description ??
              "Pull the details from another active property in this portfolio into this property."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Loading portfolio…</p>
        ) : siblings.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            This property has no other active properties in its portfolio.
          </p>
        ) : (
          <div className="space-y-2">
            <Label className="text-xs">Source property</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select a property" />
              </SelectTrigger>
              <SelectContent>
                {siblings.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="text-xs" onClick={handleCopy} disabled={saving || !source}>
            <Download className="mr-1 h-3 w-3" />
            {saving ? "Copying…" : "Copy in"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CopyFromPortfolioDialog;
