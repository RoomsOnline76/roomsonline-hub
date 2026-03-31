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
import { formatCancellationPolicy, type CancellationRule } from "@/lib/policyFormatter";

interface PoliciesTabProps {
  propertyId: string;
}

interface DateRangeOverride {
  start: string;
  end: string;
  days_before?: number;
  forfeit_percent?: number;
}

const DEFAULT_CANCELLATION: CancellationRule = {
  mode: "standard",
  days_before: 14,
  forfeit_percent: 50,
  non_refundable: false,
  date_ranges: [],
  dynamic_factors: [],
  ai_prompt_override: null,
};

export const PoliciesTab: React.FC<PoliciesTabProps> = ({ propertyId }) => {
  const { policies, loading, upsertPolicy } = usePolicies(propertyId);
  const [cancellationRule, setCancellationRule] = useState<CancellationRule>(DEFAULT_CANCELLATION);
  const [saving, setSaving] = useState(false);

  // Load existing policy
  useEffect(() => {
    const existing = policies.find((p) => p.policy_type === "cancellation");
    if (existing?.rule) {
      setCancellationRule({ ...DEFAULT_CANCELLATION, ...(existing.rule as CancellationRule) });
    }
  }, [policies]);

  const updateField = <K extends keyof CancellationRule>(key: K, value: CancellationRule[K]) => {
    setCancellationRule((prev) => ({ ...prev, [key]: value }));
  };

  const addDateRange = () => {
    updateField("date_ranges", [
      ...(cancellationRule.date_ranges || []),
      { start: "", end: "", days_before: 30, forfeit_percent: 100 },
    ]);
  };

  const removeDateRange = (idx: number) => {
    updateField(
      "date_ranges",
      (cancellationRule.date_ranges || []).filter((_, i) => i !== idx)
    );
  };

  const updateDateRange = (idx: number, field: keyof DateRangeOverride, value: string | number) => {
    const ranges = [...(cancellationRule.date_ranges || [])];
    ranges[idx] = { ...ranges[idx], [field]: value };
    updateField("date_ranges", ranges);
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
              <p className="text-sm text-muted-foreground">{preview.summaryText}</p>
            </CardContent>
          </Card>

          {/* Mode & Non-refundable */}
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
                  {/* Days before */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Free Cancellation Window (days before check-in)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={cancellationRule.days_before ?? 14}
                      onChange={(e) => updateField("days_before", parseInt(e.target.value) || 0)}
                      className="h-8 text-xs w-32"
                    />
                  </div>

                  {/* Forfeit percentage */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Forfeit Percentage</Label>
                      <Badge variant="secondary" className="text-xs">
                        {cancellationRule.forfeit_percent ?? 50}%
                      </Badge>
                    </div>
                    <Slider
                      value={[cancellationRule.forfeit_percent ?? 50]}
                      onValueChange={([v]) => updateField("forfeit_percent", v)}
                      min={0}
                      max={100}
                      step={5}
                    />
                    <p className="text-xs text-muted-foreground">
                      Charged when cancelled within the window
                    </p>
                  </div>

                  {/* Mode selector */}
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

          {/* Peak Season Overrides */}
          {!cancellationRule.non_refundable && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Peak Season Overrides</CardTitle>
                    <CardDescription className="text-xs">
                      Stricter policies for high-demand periods
                    </CardDescription>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addDateRange} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Add Range
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(!cancellationRule.date_ranges || cancellationRule.date_ranges.length === 0) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5" />
                    No peak season overrides — default policy applies year-round
                  </p>
                )}
                {(cancellationRule.date_ranges || []).map((range, idx) => (
                  <div key={idx} className="flex items-end gap-2 p-2 rounded-md bg-muted/50">
                    <div className="space-y-1 flex-1">
                      <Label className="text-xs">From</Label>
                      <Input
                        type="date"
                        value={range.start}
                        onChange={(e) => updateDateRange(idx, "start", e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1 flex-1">
                      <Label className="text-xs">To</Label>
                      <Input
                        type="date"
                        value={range.end}
                        onChange={(e) => updateDateRange(idx, "end", e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1 w-20">
                      <Label className="text-xs">Days</Label>
                      <Input
                        type="number"
                        value={range.days_before ?? 30}
                        onChange={(e) => updateDateRange(idx, "days_before", parseInt(e.target.value) || 0)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1 w-20">
                      <Label className="text-xs">Forfeit %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={range.forfeit_percent ?? 100}
                        onChange={(e) => updateDateRange(idx, "forfeit_percent", parseInt(e.target.value) || 0)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDateRange(idx)}
                      className="h-7 w-7 p-0 text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

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
