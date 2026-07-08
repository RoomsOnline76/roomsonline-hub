import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, Plus, Trash2, Wand2 } from "lucide-react";
import { usePolicies } from "@/hooks/usePolicies";
import { formatCancellationPolicy, type CancellationTier } from "@/lib/policyFormatter";
import {
  toLegacyAmenitiesShape,
  toHumanSummary,
  RECOMMENDED_POLICY,
  type ManualCancellationRule,
} from "@/lib/cancellationPolicy";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PoliciesTabProps {
  propertyId: string;
}

const DEFAULT_CANCELLATION: ManualCancellationRule = {
  mode: "standard",
  non_refundable: false,
  tiers: [
    { days_before: 60, forfeit_percent: 0 },
    { days_before: 30, forfeit_percent: 50 },
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

export const PoliciesTab: React.FC<PoliciesTabProps> = ({ propertyId }) => {
  const { policies, loading, upsertPolicy } = usePolicies(propertyId);
  const [rule, setRule] = useState<ManualCancellationRule>(DEFAULT_CANCELLATION);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const existing = policies.find((p) => p.policy_type === "cancellation");
    if (existing?.rule) {
      setRule({ ...DEFAULT_CANCELLATION, ...(existing.rule as ManualCancellationRule) });
    }
  }, [policies]);

  const updateField = <K extends keyof ManualCancellationRule>(key: K, value: ManualCancellationRule[K]) => {
    setRule((prev) => ({ ...prev, [key]: value }));
  };

  const addTier = () => {
    const tiers = [...(rule.tiers || [])];
    tiers.push({ days_before: 0, forfeit_percent: 100 });
    updateField("tiers", tiers);
  };
  const removeTier = (idx: number) => {
    updateField("tiers", (rule.tiers || []).filter((_, i) => i !== idx));
  };
  const updateTier = (idx: number, field: keyof CancellationTier, value: number) => {
    const tiers = [...(rule.tiers || [])];
    tiers[idx] = { ...tiers[idx], [field]: value };
    updateField("tiers", tiers);
  };

  const applyRecommended = () => setRule({ ...RECOMMENDED_POLICY });

  /** Save canonical rule to rolos_policies AND mirror into properties.amenities for channel adapters. */
  const handleSave = async () => {
    setSaving(true);
    try {
      const canonical: ManualCancellationRule = { ...rule, manual_override: true };
      await upsertPolicy("cancellation", canonical as unknown as Record<string, unknown>);

      // Mirror into amenities so RU push + showcase text see the same policy.
      const { data: prop, error: fetchErr } = await supabase
        .from("properties")
        .select("amenities")
        .eq("id", propertyId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;

      const amenities = (prop?.amenities as Record<string, unknown> | null) ?? {};
      const nextAmenities = {
        ...amenities,
        cancellation_policies: toLegacyAmenitiesShape(canonical),
        cancellation_policy: toHumanSummary(canonical),
      };

      const { error: updErr } = await supabase
        .from("properties")
        .update({ amenities: nextAmenities as never })
        .eq("id", propertyId);
      if (updErr) throw updErr;

      toast.success("Cancellation policy saved and pushed to channels on next sync");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to mirror policy to channels: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const preview = formatCancellationPolicy(rule);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sortedTiers = [...(rule.tiers || [])].sort((a, b) => b.days_before - a.days_before);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="cancellation" className="w-full">
        <TabsList>
          <TabsTrigger value="cancellation">Cancellation</TabsTrigger>
          <TabsTrigger value="deposit">Deposit &amp; Terms</TabsTrigger>
          <TabsTrigger value="no_show" disabled>No Show</TabsTrigger>
        </TabsList>

        <TabsContent value="cancellation" className="space-y-4 mt-4">
          {/* Preview Card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Policy Preview
              </CardTitle>
              <CardDescription className="text-xs">
                This preview is what guests see at checkout AND what is pushed to connected channels.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rule.non_refundable ? (
                <p className="text-sm text-muted-foreground">{preview.summaryText}</p>
              ) : (
                <div className="space-y-1">
                  {sortedTiers.map((tier, idx) => {
                    const refundPct = 100 - tier.forfeit_percent;
                    const prevDays = idx > 0 ? sortedTiers[idx - 1].days_before : null;
                    const label = tier.days_before > 0
                      ? `More than ${tier.days_before} days before check-in`
                      : prevDays
                        ? `Less than ${prevDays} days before check-in`
                        : "At any time";
                    return (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <Badge variant={refundPct === 100 ? "default" : refundPct > 0 ? "secondary" : "destructive"} className="text-xs">
                          {refundPct}% refunded
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Main Policy Card */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm">Cancellation Policy</CardTitle>
                <CardDescription className="text-xs">
                  Define when and how much guests are charged for cancellations
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={applyRecommended} className="h-7 text-xs shrink-0">
                <Wand2 className="h-3 w-3 mr-1" /> Use Recommended
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Non-Refundable</Label>
                  <p className="text-xs text-muted-foreground">No refunds for any cancellation</p>
                </div>
                <Switch
                  checked={rule.non_refundable || false}
                  onCheckedChange={(checked) => updateField("non_refundable", checked)}
                />
              </div>

              {!rule.non_refundable && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Cancellation Tiers</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addTier} className="h-7 text-xs">
                        <Plus className="h-3 w-3 mr-1" /> Add Tier
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Define forfeit percentages based on how far in advance the guest cancels
                    </p>
                    <div className="space-y-2">
                      {sortedTiers.map((tier) => {
                        const realIdx = (rule.tiers || []).indexOf(tier);
                        return (
                          <div key={realIdx} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                            <div className="flex items-center gap-1.5 flex-1">
                              <span className="text-xs text-muted-foreground whitespace-nowrap">≥</span>
                              <Input
                                type="number"
                                min={0}
                                max={365}
                                value={tier.days_before}
                                onChange={(e) => updateTier(realIdx, "days_before", parseInt(e.target.value) || 0)}
                                className="h-7 text-xs w-16"
                              />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">days before →</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground whitespace-nowrap">forfeit</span>
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

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                      <Label className="text-xs font-medium">Dynamic Mode</Label>
                      <p className="text-xs text-muted-foreground">
                        AI-assisted policy adjustments based on live data
                      </p>
                    </div>
                    <Switch
                      checked={rule.mode === "dynamic"}
                      onCheckedChange={(checked) => updateField("mode", checked ? "dynamic" : "standard")}
                    />
                  </div>

                  {rule.mode === "dynamic" && (
                    <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                      <div className="space-y-2">
                        <Label className="text-xs">Dynamic Factors</Label>
                        <div className="flex flex-wrap gap-3">
                          {["occupancy", "competitor_pricing", "season"].map((factor) => (
                            <label key={factor} className="flex items-center gap-1.5 text-xs">
                              <Checkbox
                                checked={(rule.dynamic_factors || []).includes(factor)}
                                onCheckedChange={(checked) => {
                                  const current = rule.dynamic_factors || [];
                                  updateField(
                                    "dynamic_factors",
                                    checked ? [...current, factor] : current.filter((f) => f !== factor),
                                  );
                                }}
                              />
                              {factor.replace("_", " ")}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">AI Prompt Override (optional)</Label>
                        <Textarea
                          value={rule.ai_prompt_override || ""}
                          onChange={(e) => updateField("ai_prompt_override", e.target.value || null)}
                          className="text-xs min-h-[60px]"
                          placeholder="Custom instructions for AI policy evaluation..."
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deposit" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Deposit &amp; Payment Terms</CardTitle>
              <CardDescription className="text-xs">
                These terms are shown to guests at checkout and included in confirmation emails.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Deposit percentage</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={rule.deposit_percent ?? 100}
                      onChange={(e) => updateField("deposit_percent", parseInt(e.target.value) || 0)}
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
                      onChange={(e) => updateField("full_payment_within_days", parseInt(e.target.value) || 0)}
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
                  onCheckedChange={(checked) => updateField("one_night_refundable", checked)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Additional terms shown to guests</Label>
                <Textarea
                  value={rule.additional_terms ?? ""}
                  onChange={(e) => updateField("additional_terms", e.target.value)}
                  className="text-xs min-h-[100px]"
                  placeholder="Any additional conditions or reservation instructions (e.g. arrival time, names of guests, bed requirements)..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="text-xs h-8">
          {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Save &amp; Push to Channels
        </Button>
      </div>
    </div>
  );
};
