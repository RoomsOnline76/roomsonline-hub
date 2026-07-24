import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, Send, KeyRound, TrendingUp, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pricelabs-api`;
const GOALS_STORAGE_KEY = "pricelabs_integration_goals_v1";
const METRICS_STORAGE_KEY = "pricelabs_integration_metrics_v1";

const DEFAULT_GOALS: { id: string; label: string; description?: string }[] = [
  { id: "credentials", label: "API credentials provisioned", description: "Integration name + token stored in secrets" },
  { id: "webhooks_registered", label: "Callback URLs registered with PriceLabs", description: "Sync, calendar trigger, and hook endpoints saved" },
  { id: "health_ok", label: "Health check passing", description: "PriceLabs IAPI v2 reachable" },
  { id: "listings_mapped", label: "Listings mapped to ROL'OS properties", description: "Every PriceLabs listing has a matching property" },
  { id: "calendar_sync", label: "Calendar sync verified", description: "Rates + availability pushed from PriceLabs" },
  { id: "hook_events", label: "Hook events received", description: "PriceLabs successfully calls our hook URL" },
  { id: "revenue_uplift", label: "Revenue uplift measured", description: "First month-on-month uplift report generated" },
];

type Goals = Record<string, boolean>;
type Metrics = { listingsTotal: string; listingsMapped: string; lastSyncAt: string; upliftTarget: string };
const DEFAULT_METRICS: Metrics = { listingsTotal: "", listingsMapped: "", lastSyncAt: "", upliftTarget: "10" };

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

export function PriceLabsCard({ propertyId }: { propertyId?: string } = {}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [lastResponse, setLastResponse] = useState<ActionResult | null>(null);
  const [syncUrl, setSyncUrl] = useState("");
  const [calendarTriggerUrl, setCalendarTriggerUrl] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [regenerate, setRegenerate] = useState(false);
  const [userToken, setUserToken] = useState("");

  // Goals + metrics (persisted locally — these are dev/admin tracking aids)
  const [goals, setGoals] = useState<Goals>(() => {
    try { return { ...(JSON.parse(localStorage.getItem(GOALS_STORAGE_KEY) || "{}")) }; } catch { return {}; }
  });
  const [metrics, setMetrics] = useState<Metrics>(() => {
    try { return { ...DEFAULT_METRICS, ...(JSON.parse(localStorage.getItem(METRICS_STORAGE_KEY) || "{}")) }; } catch { return DEFAULT_METRICS; }
  });

  useEffect(() => { localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals)); }, [goals]);
  useEffect(() => { localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(metrics)); }, [metrics]);

  const goalProgress = useMemo(() => {
    const done = DEFAULT_GOALS.filter(g => goals[g.id]).length;
    return { done, total: DEFAULT_GOALS.length, pct: Math.round((done / DEFAULT_GOALS.length) * 100) };
  }, [goals]);

  const mappingPct = useMemo(() => {
    const total = parseInt(metrics.listingsTotal) || 0;
    const mapped = parseInt(metrics.listingsMapped) || 0;
    if (!total) return 0;
    return Math.min(100, Math.round((mapped / total) * 100));
  }, [metrics]);

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
    if (r.success) setGoals(g => ({ ...g, health_ok: true }));
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
    if (r.success) {
      setRegenerate(false);
      setGoals(g => ({ ...g, webhooks_registered: true, credentials: true }));
    }
  };

  const fetchSyncStatus = async () => {
    setLoading(true);
    const r = await callPL("get_sync_status", {
      ...(propertyId ? { property_id: propertyId } : {}),
      ...(userToken ? { user_token: userToken } : {}),
    });
    setLastResponse(r);
    setLoading(false);
    if (r.success) setMetrics(m => ({ ...m, lastSyncAt: new Date().toISOString() }));
  };

  const saveUserToken = async () => {
    if (!propertyId) {
      toast({ title: "Property required", description: "Open a property to save its PriceLabs user_token.", variant: "destructive" });
      return;
    }
    if (!userToken.trim()) {
      toast({ title: "Enter user_token", description: "Paste the customer's PriceLabs user_token first.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const r = await callPL("save_user_token", { property_id: propertyId, user_token: userToken.trim() });
    setLastResponse(r);
    setLoading(false);
    toast({
      title: r.success ? "user_token saved" : "Save failed",
      description: r.success ? "Stored on this property." : (r.error || `HTTP ${r.status}`),
      variant: r.success ? "default" : "destructive",
    });
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
            <Badge variant="outline" className="gap-1"><Target className="h-3 w-3" /> {goalProgress.done}/{goalProgress.total} goals</Badge>
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

          <div className="border-t pt-4">
            <Label htmlFor="pl-user-token">Customer user_token (per-property)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="pl-user-token"
                value={userToken}
                onChange={(e) => setUserToken(e.target.value)}
                placeholder="Paste PriceLabs user_token issued to this customer"
              />
              <Button onClick={saveUserToken} disabled={loading || !propertyId} variant="outline" size="sm">
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Required for <code>get_sync_status</code>. Found in the customer's PriceLabs account under API access.
              {!propertyId && " Open a property to persist this token."}
            </p>
          </div>

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

          {/* Goals & Metrics tracker */}
          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-purple-600" />
                <h4 className="font-semibold text-sm">Integration Goals</h4>
              </div>
              <span className="text-xs text-muted-foreground">{goalProgress.done} of {goalProgress.total} complete</span>
            </div>
            <Progress value={goalProgress.pct} className="h-2" />

            <div className="grid gap-2">
              {DEFAULT_GOALS.map(g => (
                <label key={g.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/40 cursor-pointer">
                  <Checkbox
                    checked={!!goals[g.id]}
                    onCheckedChange={(v) => setGoals(prev => ({ ...prev, [g.id]: !!v }))}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${goals[g.id] ? "line-through text-muted-foreground" : ""}`}>{g.label}</div>
                    {g.description && (
                      <div className="text-xs text-muted-foreground">{g.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 pt-2">
              <div>
                <Label htmlFor="pl-listings-total" className="text-xs">Total PriceLabs listings</Label>
                <Input
                  id="pl-listings-total"
                  type="number"
                  min={0}
                  value={metrics.listingsTotal}
                  onChange={e => setMetrics(m => ({ ...m, listingsTotal: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="pl-listings-mapped" className="text-xs">Mapped to ROL'OS properties</Label>
                <Input
                  id="pl-listings-mapped"
                  type="number"
                  min={0}
                  value={metrics.listingsMapped}
                  onChange={e => {
                    const val = e.target.value;
                    setMetrics(m => ({ ...m, listingsMapped: val }));
                    const total = parseInt(metrics.listingsTotal) || 0;
                    const mapped = parseInt(val) || 0;
                    if (total > 0 && mapped >= total) setGoals(g => ({ ...g, listings_mapped: true }));
                  }}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="pl-uplift" className="text-xs">Revenue uplift target (%)</Label>
                <Input
                  id="pl-uplift"
                  type="number"
                  min={0}
                  value={metrics.upliftTarget}
                  onChange={e => setMetrics(m => ({ ...m, upliftTarget: e.target.value }))}
                  placeholder="10"
                />
              </div>
              <div>
                <Label className="text-xs">Last sync verified</Label>
                <div className="text-sm h-10 flex items-center px-3 border rounded-md bg-muted/30 text-muted-foreground">
                  {metrics.lastSyncAt ? new Date(metrics.lastSyncAt).toLocaleString() : "Not yet"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="rounded-md border p-2 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Listing coverage</div>
                <div className="text-lg font-semibold">{mappingPct}%</div>
              </div>
              <div className="rounded-md border p-2 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Goal progress</div>
                <div className="text-lg font-semibold">{goalProgress.pct}%</div>
              </div>
              <div className="rounded-md border p-2 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Uplift target</div>
                <div className="text-lg font-semibold">{metrics.upliftTarget || 0}%</div>
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
