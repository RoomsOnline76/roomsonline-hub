import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Copy } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ratePlanId: string;
  ratePlanName: string;
  sourcePropertyId: string;
  properties: { id: string; name: string }[];
  onCopied: () => void;
}

/**
 * "Sync to Others" — copies a plan's basics, season pricing, restrictions and unit links
 * to sibling properties. Units are matched by name; when nothing matches, every active
 * unit of the target property is linked.
 */
export function RatePlanSyncToOthersDialog({
  open,
  onOpenChange,
  ratePlanId,
  ratePlanName,
  sourcePropertyId,
  properties,
  onCopied,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const targets = useMemo(() => properties.filter((p) => p.id !== sourcePropertyId), [properties, sourcePropertyId]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const handleCopy = useCallback(async () => {
    if (selected.length === 0) {
      toast.error("Choose at least one property");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("rolos-rate-plans", {
      body: { action: "copy_plan", rate_plan_id: ratePlanId, target_property_ids: selected },
    });
    setBusy(false);
    const failure = (data as { error?: string } | null)?.error || error?.message;
    if (failure) {
      toast.error(failure);
      return;
    }
    const results = (data as { results?: { error?: string }[] } | null)?.results ?? [];
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      toast.warning(`Copied to ${results.length - failed.length} of ${results.length} properties`);
    } else {
      toast.success(`"${ratePlanName}" copied to ${results.length} propert${results.length === 1 ? "y" : "ies"}`);
    }
    setSelected([]);
    onOpenChange(false);
    onCopied();
  }, [selected, ratePlanId, ratePlanName, onOpenChange, onCopied]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sync "{ratePlanName}" to other properties</DialogTitle>
          <DialogDescription>
            Pricing, seasons, restrictions and unit links are copied. A plan with the same name on the target property is
            updated instead of duplicated.
          </DialogDescription>
        </DialogHeader>

        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">There are no other properties in this portfolio.</p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
            {targets.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={selected.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
                <span className="text-sm">{p.name}</span>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleCopy} disabled={busy || targets.length === 0}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
            Copy to {selected.length || 0} propert{selected.length === 1 ? "y" : "ies"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
