import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, AlertTriangle, Plus, Trash2, Info } from "lucide-react";
import { usePolicies } from "@/hooks/usePolicies";
import { formatCancellationPolicy, type CancellationRule, type CancellationTier } from "@/lib/policyFormatter";

interface PoliciesTabProps {
  propertyId: string;
}

const DEFAULT_CANCELLATION: CancellationRule = {
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
};

export const PoliciesTab: React.FC<PoliciesTabProps> = ({ propertyId }) => {
  const { policies, loading, upsertPolicy } = usePolicies(propertyId);
  const [cancellationRule, setCancellationRule] = useState<CancellationRule>(DEFAULT_CANCELLATION);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const existing = policies.find((p) => p.policy_type === "cancellation");
    if (existing?.rule) {
      setCancellationRule({ ...DEFAULT_CANCELLATION, ...(existing.rule as CancellationRule) });
    }
  }, [policies]);

  const updateField = <K extends keyof CancellationRule>(key: K, value: CancellationRule[K]) => {
    setCancellationRule((prev) => ({ ...prev, [key]: value }));
  };

  // Tier management
  const addTier = () => {
    const tiers = [...(cancellationRule.tiers || [])];
    tiers.push({ days_before: 0, forfeit_percent: 100 });
    updateField("tiers", tiers);
  };

  const removeTier = (idx: number) => {
    updateField("tiers", (cancellationRule.tiers || []).filter((_, i) => i !== idx));
  };

  const updateTier = (idx: number, field: keyof CancellationTier, value: number) => {
    const tiers = [...(cancellationRule.tiers || [])];
    tiers[idx] = { ...tiers[idx], [field]: value };
    updateField("tiers", tiers);
  };

  const handleSave = async () => {
    setSaving(true);
    await upsertPolicy("cancellation", cancellationRule as Record<string, unknown>);
    setSaving(false);
  };

  const preview = formatCancellationPolicy(cancellationRule);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sortedTiers = [...(cancellationRule.tiers || [])].sort((a, b) => b.days_before - a.days_before);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="cancellation" className="w-full">
        <TabsList>
          <TabsTrigger value="cancellation">Cancellation</TabsTrigger>
          <TabsTrigger value="deposit" disabled>Deposit</TabsTrigger>
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
            </CardHeader>
            <CardContent>
              {cancellationRule.non_refundable ? (
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
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Cancellation Policy</CardTitle>
              <CardDescription className="text-xs">
                Define when and how much guests are charged for cancellations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Non-refundable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Non-Refundable</Label>
                  <p className="text-xs text-muted-foreground">No refunds for any cancellation</p>
                </div>
                <Switch
                  checked={cancellationRule.non_refundable || false}
                  onCheckedChange={(checked) => updateField("non_refundable", checked)}
                />
              </div>

              {!cancellationRule.non_refundable && (
                <>
                  {/* Cancellation Tiers */}
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
                      {sortedTiers.map((tier, sortedIdx) => {
                        const realIdx = (cancellationRule.tiers || []).indexOf(tier);
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
                              disabled={(cancellationRule.tiers || []).length <= 1}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dynamic mode */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                      <Label className="text-xs font-medium">Dynamic Mode</Label>
                      <p className="text-xs text-muted-foreground">
                        AI-assisted policy adjustments based on live data
                      </p>
                    </div>
                    <Switch
                      checked={cancellationRule.mode === "dynamic"}
                      onCheckedChange={(checked) =>
                        updateField("mode", checked ? "dynamic" : "standard")
                      }
                    />
                  </div>

                  {cancellationRule.mode === "dynamic" && (
                    <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                      <div className="space-y-2">
                        <Label className="text-xs">Dynamic Factors</Label>
                        <div className="flex flex-wrap gap-3">
                          {["occupancy", "competitor_pricing", "season"].map((factor) => (
                            <label key={factor} className="flex items-center gap-1.5 text-xs">
                              <Checkbox
                                checked={(cancellationRule.dynamic_factors || []).includes(factor)}
                                onCheckedChange={(checked) => {
                                  const current = cancellationRule.dynamic_factors || [];
                                  updateField(
                                    "dynamic_factors",
                                    checked
                                      ? [...current, factor]
                                      : current.filter((f) => f !== factor)
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
                          value={cancellationRule.ai_prompt_override || ""}
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

          {/* Save */}
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="text-xs h-8">
              {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Save Cancellation Policy
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
