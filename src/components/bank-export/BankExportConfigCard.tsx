import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Landmark,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Settings,
  FileSpreadsheet,
  Shield,
  ArrowRight,
} from "lucide-react";

interface BankConfig {
  bank_provider: string;
  is_active: boolean;
  min_payout_amount: number;
  escrow_days: number;
}

const BANK_PROVIDERS = [
  { id: "standard_bank", name: "Standard Bank" },
  { id: "absa", name: "Absa" },
  { id: "fnb", name: "FNB" },
  { id: "nedbank", name: "Nedbank" },
];

const DEFAULT_CONFIG: BankConfig = {
  bank_provider: "standard_bank",
  is_active: false,
  min_payout_amount: 500,
  escrow_days: 7,
};

export function BankExportConfigCard() {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [config, setConfig] = useState<BankConfig>(DEFAULT_CONFIG);

  // Load existing config from database on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const { data, error } = await supabase
          .from("api_keys")
          .select("key_name, key_value")
          .in("key_name", [
            "BANK_EXPORT_PROVIDER",
            "BANK_EXPORT_ACTIVE",
            "BANK_EXPORT_MIN_AMOUNT",
            "BANK_EXPORT_ESCROW_DAYS",
          ]);

        if (error) throw error;

        if (data && data.length > 0) {
          const configMap = data.reduce((acc, item) => {
            acc[item.key_name] = item.key_value;
            return acc;
          }, {} as Record<string, string>);

          setConfig({
            bank_provider: configMap["BANK_EXPORT_PROVIDER"] || DEFAULT_CONFIG.bank_provider,
            is_active: configMap["BANK_EXPORT_ACTIVE"] === "true",
            min_payout_amount: parseInt(configMap["BANK_EXPORT_MIN_AMOUNT"]) || DEFAULT_CONFIG.min_payout_amount,
            escrow_days: parseInt(configMap["BANK_EXPORT_ESCROW_DAYS"]) || DEFAULT_CONFIG.escrow_days,
          });
        }
      } catch (error) {
        console.error("Error loading bank config:", error);
      } finally {
        setIsLoadingConfig(false);
      }
    };

    loadConfig();
  }, []);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Save config to api_keys table
      const configItems = [
        { key_name: "BANK_EXPORT_PROVIDER", value: config.bank_provider },
        { key_name: "BANK_EXPORT_ACTIVE", value: String(config.is_active) },
        { key_name: "BANK_EXPORT_MIN_AMOUNT", value: String(config.min_payout_amount) },
        { key_name: "BANK_EXPORT_ESCROW_DAYS", value: String(config.escrow_days) },
      ];

      for (const item of configItems) {
        await supabase.from("api_keys").upsert(
          {
            key_name: item.key_name,
            name: item.key_name.replace(/_/g, " "),
            key_value: item.value,
            system_type: "bank_export",
          },
          { onConflict: "key_name" }
        );
      }

      toast({
        title: "Configuration saved",
        description: "Bank export settings have been updated.",
      });
      setIsEditing(false);
    } catch (error: any) {
      toast({
        title: "Error saving configuration",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-export-api", {
        body: { action: "health_check" },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Connection successful",
          description: "Bank export system is healthy and ready.",
        });
      } else {
        throw new Error(data?.error?.message || "Health check failed");
      }
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <>
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Landmark className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Bank Exports</CardTitle>
                <CardDescription>
                  Automated payout processing for property owners
                </CardDescription>
              </div>
            </div>
            <Badge variant={config.is_active ? "default" : "secondary"}>
              {config.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Overview */}
          <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-muted/50">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">
                {BANK_PROVIDERS.find((b) => b.id === config.bank_provider)?.name || "—"}
              </p>
              <p className="text-xs text-muted-foreground">Bank Provider</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">R{config.min_payout_amount}</p>
              <p className="text-xs text-muted-foreground">Min Payout</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{config.escrow_days}</p>
              <p className="text-xs text-muted-foreground">Escrow Days</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testingConnection}
            >
              {testingConnection ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Preview Format
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </Button>
          </div>

          {/* Security Notice */}
          <Alert className="border-amber-500/50 bg-amber-500/5">
            <Shield className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-600">Dual Sign-off Required</AlertTitle>
            <AlertDescription className="text-amber-600/80">
              All export batches require authorization from both a Developer and
              the Fearless Leader before processing.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Configuration Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bank Export Configuration</DialogTitle>
            <DialogDescription>
              Configure the bank export settings for property owner payouts
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Bank Provider</Label>
              <Select
                value={config.bank_provider}
                onValueChange={(value) =>
                  setConfig({ ...config, bank_provider: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANK_PROVIDERS.map((bank) => (
                    <SelectItem key={bank.id} value={bank.id}>
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Minimum Payout Amount (ZAR)</Label>
              <Input
                type="number"
                value={config.min_payout_amount}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    min_payout_amount: parseInt(e.target.value) || 500,
                  })
                }
                min={100}
                step={100}
              />
              <p className="text-xs text-muted-foreground">
                Ledger entries below this threshold will not be included in batches
              </p>
            </div>

            <div className="space-y-2">
              <Label>Escrow Period (Days)</Label>
              <Input
                type="number"
                value={config.escrow_days}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    escrow_days: parseInt(e.target.value) || 7,
                  })
                }
                min={1}
                max={30}
              />
              <p className="text-xs text-muted-foreground">
                Days after checkout before funds become eligible for payout
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label>Enable Bank Exports</Label>
                <p className="text-xs text-muted-foreground">
                  Allow batch creation and processing
                </p>
              </div>
              <Switch
                checked={config.is_active}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, is_active: checked })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>CSV Export Format Preview</DialogTitle>
            <DialogDescription>
              Standard Bank batch payment file format (UTF-8, comma-separated)
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/50 p-4 rounded-lg font-mono text-xs overflow-x-auto">
            <pre className="whitespace-pre">
{`record_type,beneficiary_name,bank_name,branch_code,account_number,amount,reference,internal_trace_id
P,John Smith Guesthouse,Standard Bank,051001,1234567890,15000.00,ROL-001-0001,led-abc123
P,Cape Villa Retreat,Standard Bank,051001,0987654321,8500.50,ROL-001-0002,led-def456
P,Garden Route Lodge,Nedbank,198765,5555555555,22750.00,ROL-001-0003,led-ghi789`}
            </pre>
          </div>

          <div className="space-y-2 text-sm">
            <h4 className="font-medium">Column Definitions:</h4>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>
                <strong>record_type:</strong> P = Payment
              </li>
              <li>
                <strong>beneficiary_name:</strong> Property owner/business name
              </li>
              <li>
                <strong>bank_name:</strong> Beneficiary's bank
              </li>
              <li>
                <strong>branch_code:</strong> Bank branch code
              </li>
              <li>
                <strong>account_number:</strong> Full account number
              </li>
              <li>
                <strong>amount:</strong> Payment amount (ZAR, 2 decimals)
              </li>
              <li>
                <strong>reference:</strong> Unique payment reference
              </li>
              <li>
                <strong>internal_trace_id:</strong> ROL ledger entry IDs
              </li>
            </ul>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowPreview(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
