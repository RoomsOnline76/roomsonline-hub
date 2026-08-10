import { useEffect, useMemo, useState } from "react";
import { usePortfolioSiblings } from "@/hooks/usePortfolioSiblings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface CopyToPortfolioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The property the item currently belongs to. */
  propertyId: string;
  /** Short label of what is being copied, e.g. `SUMMER20` or "3 vouchers". */
  itemLabel: string;
  title?: string;
  description?: string;
  /** Performs the copy. Resolve with a per-property summary message. */
  onCopy: (targetPropertyIds: string[]) => Promise<void>;
}

/**
 * Shared "copy to the rest of the portfolio" picker.
 * Lists active sibling properties in the same portfolio(s) and hands the
 * selected ids back to the caller, which owns the actual write.
 */
export function CopyToPortfolioDialog({
  open,
  onOpenChange,
  propertyId,
  itemLabel,
  title = "Copy to portfolio",
  description,
  onCopy,
}: CopyToPortfolioDialogProps) {
  const { siblings, loading } = usePortfolioSiblings(propertyId);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSelected(siblings.map((s) => s.id));
  }, [open, siblings]);

  const allSelected = useMemo(
    () => siblings.length > 0 && selected.length === siblings.length,
    [siblings, selected],
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleCopy = async () => {
    setSaving(true);
    try {
      await onCopy(selected);
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
              `Copy ${itemLabel} to the other properties in this portfolio. Existing entries with the same identifier are updated instead of duplicated.`}
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
            <div className="flex items-center gap-2 border-b border-border/60 pb-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v ? siblings.map((s) => s.id) : [])}
              />
              <Label className="text-xs font-semibold">
                Select all ({siblings.length})
              </Label>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {siblings.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Checkbox checked={selected.includes(s.id)} onCheckedChange={() => toggle(s.id)} />
                  <Label className="text-xs">{s.name}</Label>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-xs"
            onClick={handleCopy}
            disabled={saving || selected.length === 0}
          >
            <Copy className="mr-1 h-3 w-3" />
            {saving ? "Copying…" : `Copy to ${selected.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CopyToPortfolioDialog;
