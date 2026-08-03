import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  copyIdentityToProperties,
  describeIdentityPayload,
  fetchPortfolioSiblings,
  type IdentityPayload,
  type PortfolioSibling,
} from "@/lib/portfolioIdentitySync";

interface Props {
  propertyId?: string;
  payload: IdentityPayload;
  /** Warn the user that unsaved edits are not included in the copy. */
  isDirty?: boolean;
}

/**
 * "Copy to portfolio" control for Company Information.
 *
 * Pushes the completed identity/company/banking/RU-profile fields of this
 * property onto its portfolio siblings. Blank source fields are skipped so a
 * partially-filled property can never wipe a sibling's data.
 */
export function PortfolioIdentityCopy({ propertyId, payload, isDirty }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [siblings, setSiblings] = useState<PortfolioSibling[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const fields = useMemo(() => describeIdentityPayload(payload), [payload]);

  useEffect(() => {
    if (!open || !propertyId) return;
    let cancelled = false;
    setLoading(true);
    fetchPortfolioSiblings(propertyId)
      .then((rows) => {
        if (cancelled) return;
        setSiblings(rows);
        setSelected(Object.fromEntries(rows.map((row) => [row.id, true])));
      })
      .catch((error: unknown) => {
        console.error("Portfolio sibling lookup failed:", error);
        if (!cancelled) {
          toast({
            title: "Could not load portfolio properties",
            description: error instanceof Error ? error.message : "Unknown error",
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, propertyId, toast]);

  const selectedIds = useMemo(
    () => siblings.filter((sibling) => selected[sibling.id]).map((sibling) => sibling.id),
    [siblings, selected],
  );

  const handleCopy = useCallback(async () => {
    setSaving(true);
    try {
      const count = await copyIdentityToProperties(payload, selectedIds);
      toast({
        title: `Identity copied to ${count} propert${count === 1 ? "y" : "ies"}`,
        description: "Blank fields on this property were skipped, so no sibling data was overwritten with empties.",
      });
      setOpen(false);
    } catch (error: unknown) {
      console.error("Portfolio identity copy failed:", error);
      toast({
        title: "Copy failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [payload, selectedIds, toast]);

  if (!propertyId) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Copy className="h-3 w-3" />
        Copy to portfolio
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Copy company information across the portfolio</DialogTitle>
            <DialogDescription className="text-xs">
              Completed fields on this property are applied to the selected properties. Empty fields are skipped.
            </DialogDescription>
          </DialogHeader>

          {isDirty && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700">
              You have unsaved changes. Save the property first so the latest values are copied.
            </p>
          )}

          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Fields to copy
            </p>
            {fields.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing to copy yet — complete the Company Information fields first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {fields.map((field) => (
                  <Badge key={field} variant="secondary" className="text-[10px]">
                    {field}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Portfolio properties
            </p>
            {loading ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading portfolio…
              </p>
            ) : siblings.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                This property is not part of a portfolio with other active properties.
              </p>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border px-2.5 py-2">
                {siblings.map((sibling) => (
                  <div key={sibling.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`identity-copy-${sibling.id}`}
                      checked={!!selected[sibling.id]}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => ({ ...prev, [sibling.id]: checked === true }))
                      }
                    />
                    <Label htmlFor={`identity-copy-${sibling.id}`} className="text-xs font-normal">
                      {sibling.name}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCopy}
              disabled={saving || selectedIds.length === 0 || fields.length === 0}
            >
              {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              Copy to {selectedIds.length || 0} propert{selectedIds.length === 1 ? "y" : "ies"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
