import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  RECOMMENDED_POLICY,
  type ManualCancellationRule,
} from "@/lib/cancellationPolicy";
import type { CancellationTier } from "@/lib/policyFormatter";
import type { ReservationPolicy, PolicyRateLink } from "@/hooks/useReservationPolicies";

interface RatePlan {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  policy: ReservationPolicy | null;
  existingLinks: PolicyRateLink[];
  onSave: (
    input: Omit<ReservationPolicy, "id" | "property_id" | "created_at" | "updated_at">,
    ratePlanIds: string[],
    channels: string[],
    policyId: string | null,
  ) => Promise<void>;
}

const DEFAULT_RULE: ManualCancellationRule = {
  mode: "standard",
  non_refundable: false,
  tiers: [
    { days_before: 30, forfeit_percent: 0 },
    { days_before: 0, forfeit_percent: 100 },
  ],
  date_ranges: [],
  dynamic_factors: [],
  ai_prompt_override: null,
  deposit_percent: 100,
  one_night_refundable: false,
  full_payment_within_days: 7,
  additional_terms: "",
  manual_override: true,
};

const AVAILABLE_CHANNELS = ["booking.com", "airbnb", "expedia", "hostfully", "rentals_united", "direct"];

export const ReservationPolicyDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  propertyId,
  policy,
  existingLinks,
  onSave,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ReservationPolicy["kind"]>("custom");
  const [isDefault, setIsDefault] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [rule, setRule] = useState<ManualCancellationRule>(DEFAULT_RULE);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [selectedRatePlans, setSelectedRatePlans] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (policy) {
      setName(policy.name);
      setDescription(policy.description ?? "");
      setKind(policy.kind);
      setIsDefault(policy.is_default);
      setIsMaster(policy.is_master ?? false);
      setRule({ ...DEFAULT_RULE, ...(policy.rule || {}) });
      const linksForPolicy = existingLinks.filter((l) => l.policy_id === policy.id);
      setSelectedRatePlans(linksForPolicy.filter((l) => l.rate_plan_id).map((l) => l.rate_plan_id!));
      setSelectedChannels(linksForPolicy.filter((l) => l.channel).map((l) => l.channel!));
    } else {
      setName("");
      setDescription("");
      setKind("custom");
      setIsDefault(false);
      setIsMaster(false);
      setRule(DEFAULT_RULE);
      setSelectedRatePlans([]);
      setSelectedChannels([]);
    }
  }, [open, policy, existingLinks]);

  useEffect(() => {
    if (!open || !propertyId) return;
    supabase
      .from("rolos_rate_plans")
      .select("id, name")
      .eq("property_id", propertyId)
      .then(({ data }) => setRatePlans((data ?? []) as RatePlan[]));
  }, [open, propertyId]);

  const updateRule = <K extends keyof ManualCancellationRule>(k: K, v: ManualCancellationRule[K]) =>
    setRule((prev) => ({ ...prev, [k]: v }));

  const addTier = () => updateRule("tiers", [...(rule.tiers || []), { days_before: 0, forfeit_percent: 100 }]);
  const removeTier = (idx: number) => updateRule("tiers", (rule.tiers || []).filter((_, i) => i !== idx));
  const updateTier = (idx: number, field: keyof CancellationTier, val: number) => {
    const tiers = [...(rule.tiers || [])];
    tiers[idx] = { ...tiers[idx], [field]: val };
    updateRule("tiers", tiers);
  };

  const applyRecommended = () => setRule({ ...RECOMMENDED_POLICY });

  const toggleChannel = (ch: string) => {
    setSelectedChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  };
  const toggleRatePlan = (id: string) => {
    setSelectedRatePlans((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const canSave = name.trim().length > 0 && (rule.non_refundable || (rule.tiers || []).length > 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(
        {
          name: name.trim(),
          description: description.trim() || null,
          kind,
          is_default: isDefault,
          is_master: isMaster,
          scope: policy?.scope ?? "property",
          linked_master_id: policy?.linked_master_id ?? null,
          rule: { ...rule, manual_override: true },
          source_policy_id: policy?.source_policy_id ?? null,
        },
        selectedRatePlans,
        selectedChannels,
        policy?.id ?? null,
      );
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const sortedTiers = [...(rule.tiers || [])].sort((a, b) => b.days_before - a.days_before);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {policy ? "Edit reservation policy" : "Create reservation policy"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Guests see this at checkout. When set as default, it's also pushed to connected channels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Policy name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Flexible – 30 days"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as ReservationPolicy["kind"])}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="non_refundable">Non-refundable</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Short description (internal)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Used for winter promo rates"
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-center justify-between p-2 rounded-md bg-muted/40">
            <div>
              <Label className="text-xs font-medium">Set as default</Label>
              <p className="text-xs text-muted-foreground">Used at checkout and pushed to channels</p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>

          <div className="flex items-center justify-between p-2 rounded-md bg-muted/40">
            <div>
              <Label className="text-xs font-medium">Master (global fallback)</Label>
              <p className="text-xs text-muted-foreground">
                Applies whenever no special or rate-plan policy matches. Only one per property.
              </p>
            </div>
            <Switch checked={isMaster} onCheckedChange={setIsMaster} />
          </div>


          <Tabs defaultValue="cancellation" className="w-full">
            <TabsList>
              <TabsTrigger value="cancellation">Cancellation</TabsTrigger>
              <TabsTrigger value="deposit">Deposit &amp; terms</TabsTrigger>
              <TabsTrigger value="linking">Rate plans / channels</TabsTrigger>
            </TabsList>

            <TabsContent value="cancellation" className="space-y-3 mt-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Non-refundable</Label>
                  <p className="text-xs text-muted-foreground">No refunds for any cancellation</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={applyRecommended} className="h-7 text-xs">
                    <Wand2 className="h-3 w-3 mr-1" /> Recommended
                  </Button>
                  <Switch
                    checked={rule.non_refundable || false}
                    onCheckedChange={(v) => updateRule("non_refundable", v)}
                  />
                </div>
              </div>

              {!rule.non_refundable && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Cancellation tiers</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addTier} className="h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1" /> Add tier
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {sortedTiers.map((tier) => {
                      const realIdx = (rule.tiers || []).indexOf(tier);
                      return (
                        <div key={realIdx} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                          <div className="flex items-center gap-1.5 flex-1">
                            <span className="text-xs text-muted-foreground">≥</span>
                            <Input
                              type="number"
                              min={0}
                              max={365}
                              value={tier.days_before}
                              onChange={(e) => updateTier(realIdx, "days_before", parseInt(e.target.value) || 0)}
                              className="h-7 text-xs w-16"
                            />
                            <span className="text-xs text-muted-foreground">days before →</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">forfeit</span>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={tier.forfeit_percent}
                              onChange={(e) => updateTier(realIdx, "forfeit_percent", parseInt(e.target.value) || 0)}
                              className="h-7 text-xs w-16"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTier(realIdx)}
                            className="h-7 w-7 p-0 text-destructive"
                            disabled={(rule.tiers || []).length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="deposit" className="space-y-3 mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Deposit percentage</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={rule.deposit_percent ?? 100}
                      onChange={(e) => updateRule("deposit_percent", parseInt(e.target.value) || 0)}
                      className="h-8 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Full payment if arrival within</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={rule.full_payment_within_days ?? 7}
                      onChange={(e) => updateRule("full_payment_within_days", parseInt(e.target.value) || 0)}
                      className="h-8 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">One-night stay refundable</Label>
                  <p className="text-xs text-muted-foreground">Allow refunds on single-night stays</p>
                </div>
                <Switch
                  checked={rule.one_night_refundable ?? false}
                  onCheckedChange={(v) => updateRule("one_night_refundable", v)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Additional terms shown to guests</Label>
                <Textarea
                  value={rule.additional_terms ?? ""}
                  onChange={(e) => updateRule("additional_terms", e.target.value)}
                  className="text-xs min-h-[80px]"
                  placeholder="Any additional conditions or reservation instructions..."
                />
              </div>
            </TabsContent>

            <TabsContent value="linking" className="space-y-4 mt-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Applies to rate plans</Label>
                {ratePlans.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No rate plans configured for this property.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {ratePlans.map((rp) => {
                      const active = selectedRatePlans.includes(rp.id);
                      return (
                        <button
                          key={rp.id}
                          type="button"
                          onClick={() => toggleRatePlan(rp.id)}
                          className="focus:outline-none"
                        >
                          <Badge variant={active ? "default" : "outline"} className="text-xs cursor-pointer">
                            {rp.name}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">Applies to channels</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AVAILABLE_CHANNELS.map((ch) => (
                    <label key={ch} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox checked={selectedChannels.includes(ch)} onCheckedChange={() => toggleChannel(ch)} />
                      <span>{ch}</span>
                    </label>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={!canSave || saving} className="h-8 text-xs">
            {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {policy ? "Save changes" : "Create policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
