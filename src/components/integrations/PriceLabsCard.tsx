import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, Send, KeyRound, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pricelabs-api`;

type ActionResult = {
  success?: boolean;
  status?: number;
  data?: unknown;
  error?: string;
};

async function callPL(action: string, extra: Record<string, unknown> = {}): Promise<ActionResult> {
  const { data, error } = await supabase.functions.invoke("pricelabs-api", {
    body: { action, ...extra },
  });
  if (error) return { success: false, error: error.message };
  return data as ActionResult;
}

export function PriceLabsCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [lastResponse, setLastResponse] = useState<ActionResult | null>(null);
  const [syncUrl, setSyncUrl] = useState("");
  const [calendarTriggerUrl, setCalendarTriggerUrl] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [regenerate, setRegenerate] = useState(false);

  const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || "";
  const base = `https://${projectId}.functions.supabase.co`;

  useEffect(() => {
    setSyncUrl(`${base}/pricelabs-webhook/sync`);
    setCalendarTriggerUrl(`${base}/pricelabs-webhook/calendar-trigger`);
    setHookUrl(`${base}/pricelabs-webhook/hook`);
  }, [base]);

  const runHealth = async () => {
    setLoading(true);
    const r = await callPL("health_check");
    setLastResponse(r);
    setHealthOk(!!r.success);
    setLoading(false);
    toast({
      title: r.success ? "PriceLabs reachable" : "PriceLabs error",
      description: r.success ? `HTTP ${r.status}` : (r.error || `HTTP ${r.status}`),
      variant: r.success ? "default" : "destructive",
    });
  };

  const saveIntegration = async () => {
    setLoading(true);
    const r = await callPL("set_integration", {
      sync_url: syncUrl,
      calendar_trigger_url: calendarTriggerUrl,
      hook_url: hookUrl,
      regenerate_token: regenerate,
    });
    setLastResponse(r);
    setLoading(false);
    toast({
      title: r.success ? "PriceLabs configured" : "Configure failed",
      description: r.success
        ? regenerate ? "URLs saved · new token stored" : "URLs saved"
        : (r.error || `HTTP ${r.status}`),
      variant: r.success ? "default" : "destructive",
    });
    if (r.success) setRegenerate(false);
  };

  const fetchSyncStatus = async () => {
    setLoading(true);
    const r = await callPL("get_sync_status");
    setLastResponse(r);
    setLoading(false);
  };

  return (
    <AccordionItem value="pricelabs" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center justify-between w-full pr-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-purple-600" />
            <span className="font-semibold">PriceLabs</span>
          </div>
          <div className="flex items-center gap-2">
            {healthOk === true && (
              <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Reachable</Badge>
            )}
            {healthOk === false && (
              <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Error</Badge>
            )}
            <Badge variant="outline" className="gap-1"><KeyRound className="h-3 w-3" /> Token Auth</Badge>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="pt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Dynamic pricing engine (IAPI v2). Auth uses{" "}
            <code className="text-xs">X-Integration-Name</code> +{" "}
            <code className="text-xs">X-Integration-Token</code>. PriceLabs needs three callback URLs
            (sync, calendar trigger, hook) registered via the <code className="text-xs">/integration</code>{" "}
            endpoint. Endpoint: <code className="text-xs">{FN_URL}</code>
          </p>

          <div className="grid gap-3">
            <div>
              <Label htmlFor="pl-sync">Sync URL (mandatory)</Label>
              <Input id="pl-sync" value={syncUrl} onChange={(e) => setSyncUrl(e.target.value)} placeholder="https://.../pricelabs-webhook/sync" />
            </div>
            <div>
              <Label htmlFor="pl-cal">Calendar Trigger URL (mandatory)</Label>
              <Input id="pl-cal" value={calendarTriggerUrl} onChange={(e) => setCalendarTriggerUrl(e.target.value)} placeholder="https://.../pricelabs-webhook/calendar-trigger" />
            </div>
            <div>
              <Label htmlFor="pl-hook">Hook URL (mandatory)</Label>
              <Input id="pl-hook" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://.../pricelabs-webhook/hook" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Switch id="pl-regen" checked={regenerate} onCheckedChange={setRegenerate} />
              <Label htmlFor="pl-regen" className="text-sm cursor-pointer">
                Rotate integration token on save (new token will be stored automatically)
              </Label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runHealth} disabled={loading} variant="outline" size="sm">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Test connection
            </Button>
            <Button onClick={saveIntegration} disabled={loading} size="sm">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Save URLs to PriceLabs
            </Button>
            <Button onClick={fetchSyncStatus} disabled={loading} variant="ghost" size="sm">
              View sync status
            </Button>
          </div>

          {lastResponse && (
            <pre className="text-xs bg-muted/50 border rounded p-3 max-h-64 overflow-auto">
              {JSON.stringify(lastResponse, null, 2)}
            </pre>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
