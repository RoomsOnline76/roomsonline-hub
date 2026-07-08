import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ReservationPolicy } from "@/hooks/useReservationPolicies";

interface PropertyOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourcePolicy: ReservationPolicy;
  onApplied: () => void;
}

export const ApplyPolicyToPropertiesDialog: React.FC<Props> = ({ open, onOpenChange, sourcePolicy, onApplied }) => {
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"copy" | "link">("copy");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setLoading(true);
    supabase
      .from("properties")
      .select("id, name")
      .eq("is_active", true)
      .neq("id", sourcePolicy.property_id)
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setProperties((data ?? []) as PropertyOption[]);
      })
      .then(() => setLoading(false));
  }, [open, sourcePolicy.property_id]);

  const filtered = properties.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    if (selected.size === 0) return;
    setApplying(true);
    const targets = Array.from(selected);
    let ok = 0;
    let fail = 0;
    for (const pid of targets) {
      try {
        if (mode === "copy") {
          const { error } = await supabase.from("rolos_reservation_policies").insert({
            property_id: pid,
            name: sourcePolicy.name,
            kind: sourcePolicy.kind,
            rule: sourcePolicy.rule as never,
            is_default: false,
            source_policy_id: sourcePolicy.id,
          } as never);
          if (error) throw error;
        } else {
          // "Link" — create a linked reference row pointing back to source.
          // Since our schema keeps policies per-property, we implement "link" as an
          // insert with source_policy_id set and a channel marker so future edits
          // can propagate. For now we insert a copy tagged as linked.
          const { error } = await supabase.from("rolos_reservation_policies").insert({
            property_id: pid,
            name: `${sourcePolicy.name} (linked)`,
            kind: sourcePolicy.kind,
            rule: sourcePolicy.rule as never,
            is_default: false,
            source_policy_id: sourcePolicy.id,
          } as never);
          if (error) throw error;
        }
        ok++;
      } catch (e) {
        console.error("apply policy failed for", pid, e);
        fail++;
      }
    }
    setApplying(false);
    if (ok) toast.success(`Applied to ${ok} propert${ok === 1 ? "y" : "ies"}${fail ? ` (${fail} failed)` : ""}`);
    if (fail && !ok) toast.error(`Failed to apply to ${fail} properties`);
    onApplied();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Apply "{sourcePolicy.name}" to other properties</DialogTitle>
          <DialogDescription className="text-xs">
            Choose how to share this policy and which properties should receive it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Sharing mode</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "copy" | "link")} className="space-y-1.5">
              <label className="flex items-start gap-2 cursor-pointer">
                <RadioGroupItem value="copy" className="mt-0.5" />
                <div>
                  <div className="text-xs font-medium">Copy (independent)</div>
                  <p className="text-xs text-muted-foreground">
                    Each property gets its own editable copy. Future edits don't propagate.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <RadioGroupItem value="link" className="mt-0.5" />
                <div>
                  <div className="text-xs font-medium">Link (tagged as linked)</div>
                  <p className="text-xs text-muted-foreground">
                    Copy is tagged as linked to the source for audit; still editable per property.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
            <Label className="text-xs font-medium">Target properties</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search properties..."
              className="h-8 text-xs"
            />
            <div className="flex-1 overflow-y-auto border rounded-md p-2 space-y-1">
              {loading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No properties</p>
              ) : (
                filtered.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer p-1 hover:bg-muted/50 rounded">
                    <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                    <span>{p.name}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">{selected.size} selected</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={selected.size === 0 || applying}
            className="h-8 text-xs"
          >
            {applying && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
