import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, AlertTriangle, Play } from "lucide-react";
import { toast } from "sonner";

const FEATURE_TARGETS = [
  { id: "booking_flow", label: "Booking Flow", description: "End-to-end booking creation" },
  { id: "benson_api", label: "Benson PMS API", description: "Benson adapter compliance" },
  { id: "hostfully_api", label: "Hostfully PMS API", description: "Hostfully OAuth and sync" },
  { id: "rls_validation", label: "RLS Validation", description: "Row-level security enforcement" },
  { id: "contract_signing", label: "Contract Signing", description: "Contract workflow validation" },
  { id: "pms_sync", label: "PMS Sync", description: "Rate and availability sync" },
  { id: "guest_encryption", label: "Guest Encryption", description: "PII encryption triggers" },
];

const INVARIANTS = [
  { id: "rule_1", label: "RULE #1: PMS Availability Before Booking", critical: true },
  { id: "rls_enforcement", label: "RLS Policy Enforcement", critical: true },
  { id: "pii_encryption", label: "Guest PII Encryption", critical: true },
  { id: "adapter_contract", label: "PMS Adapter Contract Compliance", critical: false },
  { id: "auth_boundaries", label: "Authentication Boundaries", critical: false },
];

interface ScenarioGeneratorProps {
  onRunCreated: (runId: string) => void;
}

export function ScenarioGenerator({ onRunCreated }: ScenarioGeneratorProps) {
  const [name, setName] = useState("");
  const [featureTarget, setFeatureTarget] = useState("");
  const [description, setDescription] = useState("");
  const [selectedInvariants, setSelectedInvariants] = useState<string[]>(
    INVARIANTS.filter((i) => i.critical).map((i) => i.id)
  );
  const [generatedScenarios, setGeneratedScenarios] = useState<any[]>([]);

  // Generate scenarios mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-test-scenarios", {
        body: {
          featureTarget,
          invariants: selectedInvariants,
          context: description,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setGeneratedScenarios(data.scenarios || []);
      toast.success(`Generated ${data.scenarios?.length || 0} test scenarios`);
    },
    onError: (error) => {
      toast.error(`Failed to generate scenarios: ${error.message}`);
    },
  });

  // Create run mutation
  const createRunMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("test_runs")
        .insert({
          name: name || `${featureTarget} test run`,
          description,
          feature_target: featureTarget,
          scenarios: generatedScenarios,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Test run created");
      onRunCreated(data.id);
      // Reset form
      setName("");
      setDescription("");
      setGeneratedScenarios([]);
    },
    onError: (error) => {
      toast.error(`Failed to create test run: ${error.message}`);
    },
  });

  const toggleInvariant = (id: string) => {
    setSelectedInvariants((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectedFeature = FEATURE_TARGETS.find((f) => f.id === featureTarget);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Configuration Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Scenario Configuration
          </CardTitle>
          <CardDescription>
            Configure what to test and which invariants to enforce
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Run Name (optional)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Booking flow regression test"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feature">Feature Target</Label>
            <Select value={featureTarget} onValueChange={setFeatureTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Select feature to test" />
              </SelectTrigger>
              <SelectContent>
                {FEATURE_TARGETS.map((feature) => (
                  <SelectItem key={feature.id} value={feature.id}>
                    <div className="flex flex-col">
                      <span>{feature.label}</span>
                      <span className="text-xs text-muted-foreground">{feature.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Additional Context</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any specific scenarios or edge cases to focus on..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Invariants to Enforce</Label>
            <div className="space-y-2 border rounded-md p-3">
              {INVARIANTS.map((invariant) => (
                <div key={invariant.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={invariant.id}
                    checked={selectedInvariants.includes(invariant.id)}
                    onCheckedChange={() => toggleInvariant(invariant.id)}
                  />
                  <label
                    htmlFor={invariant.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2"
                  >
                    {invariant.label}
                    {invariant.critical && (
                      <Badge variant="destructive" className="text-xs">
                        Critical
                      </Badge>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={!featureTarget || generateMutation.isPending}
            className="w-full"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Scenarios with TOBI
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Scenarios Panel */}
      <Card>
        <CardHeader>
          <CardTitle>Generated Scenarios</CardTitle>
          <CardDescription>
            {generatedScenarios.length > 0
              ? `${generatedScenarios.length} scenarios generated`
              : "Scenarios will appear here after generation"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {generatedScenarios.length > 0 ? (
            <div className="space-y-4">
              <div className="max-h-96 overflow-y-auto space-y-3">
                {generatedScenarios.map((scenario, idx) => (
                  <div key={scenario.id || idx} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{scenario.name}</p>
                        <p className="text-xs text-muted-foreground">{scenario.description}</p>
                      </div>
                      <Badge
                        variant={
                          scenario.category === "security"
                            ? "destructive"
                            : scenario.category === "invariant"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {scenario.category}
                      </Badge>
                    </div>
                    {scenario.assertions && (
                      <div className="text-xs text-muted-foreground">
                        {scenario.assertions.length} assertions
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <Button
                onClick={() => createRunMutation.mutate()}
                disabled={createRunMutation.isPending}
                className="w-full"
              >
                {createRunMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Create Test Run
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mb-2 opacity-50" />
              <p>No scenarios generated yet</p>
              <p className="text-xs">Select a feature and click Generate</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
