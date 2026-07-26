import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Puzzle, AlertCircle, Download, RefreshCw, Rocket, CheckCircle2, XCircle, Webhook, Send, Eye, Copy, Loader2, ShieldCheck } from "lucide-react";
import { PUBLIC_DOMAIN } from "@/lib/config";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import JSZip from "jszip";
import { useState } from "react";
import { useWhitelabel } from "@/hooks/useWhitelabel";
import { WordPressVisualWalkthrough } from "./WordPressVisualWalkthrough";

interface WordPressTabProps {
  property: { id: string; name: string; slug: string; brand_primary_color: string | null };
  showPushUpdate?: boolean;
}

const WEBHOOK_EVENTS = [
  { value: "booking.created", label: "Booking Created" },
  { value: "booking.modified", label: "Booking Modified" },
  { value: "booking.cancelled", label: "Booking Cancelled" },
  { value: "room.status.changed", label: "Room Status Changed" },
  { value: "inventory.updated", label: "Inventory Updated" },
  { value: "checkout.completed", label: "Checkout Completed" },
];

export function WordPressTab({ property, showPushUpdate = false }: WordPressTabProps) {
  const queryClient = useQueryClient();
  const [pushing, setPushing] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "ok" | "error">("idle");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const brandColor = property.brand_primary_color || "#e91e63";

  const { data: integrationConfig } = useQuery({
    queryKey: ["wordpress-config", property.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("integration_configs")
        .select("id, config")
        .eq("property_id", property.id)
        .eq("integration_type", "wordpress")
        .maybeSingle();
      return data;
    },
  });

  const { data: webhookSub } = useQuery({
    queryKey: ["webhook-sub", property.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("rolos_webhook_subscriptions")
        .select("*")
        .eq("property_id", property.id)
        .eq("is_active", true)
        .maybeSingle();
      return data;
    },
  });

  const { data: webhookLogs } = useQuery({
    queryKey: ["webhook-logs", property.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("rolos_webhook_logs")
        .select("*")
        .eq("property_id", property.id)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  const currentVersion = (integrationConfig?.config as Record<string, unknown>)?.plugin_version as string || "2.1.0";
  const updateUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wordpress-plugin-update`;

  const wl = useWhitelabel(property.id);
  const verifiedWlHost = wl.enabled && wl.domainStatus === "active" && wl.domain ? ` host="https://${wl.domain}"` : "";
  // Canonical shortcode — no brand params. Plugin renders in ROL'OS pink.
  const canonicalShortcode = `[rolos_booking property="${property.slug}"]`;
  // White-label shortcode — plugin inherits the property's brand server-side.
  // We deliberately omit `color=`; the plugin resolves brand from the property
  // config, which prevents stale colours in old shortcodes.
  const wlShortcode = wl.enabled
    ? `[rolos_booking property="${property.slug}" whitelabel="1"${verifiedWlHost}]`
    : null;
  // Legacy variable kept for downstream consumers (walkthrough preview) — always
  // show the canonical form there; WL callers should surface `wlShortcode` too.
  const shortcode = canonicalShortcode;
  const gridShortcode = `[rolos_property_grid limit="12" columns="3"]`;

  // Portfolio membership → surface a portfolio-level shortcode when applicable
  const { data: portfolio } = useQuery({
    queryKey: ["wp-portfolio-for-property", property.id],
    queryFn: async () => {
      const { data: mem } = await supabase
        .from("property_portfolio_members")
        .select("portfolio_id")
        .eq("property_id", property.id)
        .limit(1)
        .maybeSingle();
      if (!mem?.portfolio_id) return null;
      const { data: p } = await supabase
        .from("property_portfolios")
        .select("id, name, slug")
        .eq("id", mem.portfolio_id)
        .maybeSingle();
      return (p as { id: string; name: string; slug: string | null } | null) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
  const portfolioShortcode = portfolio?.slug
    ? `[rolos_portfolio_booking portfolio="${portfolio.slug}"]`
    : null;
  const portfolioWlShortcode = portfolio?.slug && wl.enabled
    ? `[rolos_portfolio_booking portfolio="${portfolio.slug}" whitelabel="1" color="${brandColor}"${verifiedWlHost}]`
    : null;

  // White-label-aware webhook URL suggestion
  const webhookPlaceholder = wl.enabled && wl.domainStatus === "active" && wl.domain
    ? `https://${wl.domain}/wp-json/rolos/v1/webhook`
    : "https://yoursite.com/wp-json/rolos/v1/webhook";

  const handleDownloadZip = async () => {
    // Download from edge function for multi-file plugin
    const downloadUrl = `${updateUrl}?download=${property.id}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = "rolos-plugin.zip";
    a.click();
    toast({ title: "Download started", description: "Your plugin ZIP is being generated." });
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus("idle");
    try {
      const { data, error } = await supabase.functions.invoke("roomsonline-pms-api", {
        body: { action: "health_check" },
      });
      if (error) throw error;
      setConnectionStatus(data?.success ? "ok" : "error");
    } catch {
      setConnectionStatus("error");
    } finally {
      setTestingConnection(false);
    }
  };

  const handlePushUpdate = async () => {
    setPushing(true);
    try {
      const parts = currentVersion.split(".").map(Number);
      parts[2] = (parts[2] || 0) + 1;
      const newVersion = parts.join(".");

      if (integrationConfig?.id) {
        const existingConfig = (integrationConfig.config as Record<string, unknown>) || {};
        const { error } = await supabase
          .from("integration_configs")
          .update({ config: { ...existingConfig, plugin_version: newVersion } })
          .eq("id", integrationConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("integration_configs")
          .insert({
            property_id: property.id,
            integration_type: "wordpress",
            is_active: true,
            config: { plugin_version: newVersion },
          });
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["wordpress-config", property.id] });
      toast({
        title: "Update pushed!",
        description: `Version ${newVersion} will be available to all WordPress sites within 12 hours.`,
      });
    } catch {
      toast({ title: "Error", description: "Failed to push update.", variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  const handleSaveWebhook = async () => {
    if (!webhookUrl || !selectedEvents.length) {
      toast({ title: "Missing fields", description: "Enter a URL and select at least one event.", variant: "destructive" });
      return;
    }

    const secret = crypto.randomUUID().replace(/-/g, "");

    try {
      const { error } = await supabase.from("rolos_webhook_subscriptions").upsert({
        id: webhookSub?.id || undefined,
        property_id: property.id,
        url: webhookUrl,
        secret,
        events: selectedEvents,
        is_active: true,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["webhook-sub", property.id] });
      toast({ title: "Webhook saved", description: `Secret: ${secret} — copy it now, it won't be shown again.` });
    } catch {
      toast({ title: "Error", description: "Failed to save webhook.", variant: "destructive" });
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookSub?.id) return;

    try {
      const { data, error } = await supabase.functions.invoke("rolos-webhook-receiver", {
        body: { action: "test_ping", subscription_id: webhookSub.id },
      });
      if (error) throw error;

      toast({
        title: data?.success ? "Ping delivered!" : "Ping failed",
        description: data?.message || "Check your webhook endpoint.",
        variant: data?.success ? "default" : "destructive",
      });
    } catch {
      toast({ title: "Error", description: "Failed to send test ping.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Main Plugin Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Puzzle className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">ROL'OS Plugin</CardTitle>
              <Badge variant="outline" className="text-xs font-mono">v{currentVersion}</Badge>
              <Badge variant="secondary" className="text-xs">Multi-file</Badge>
            </div>
            <IntegrationToggle propertyId={property.id} integrationType="wordpress" />
          </div>
          <CardDescription>
            Full-featured WordPress plugin with <strong>booking engine, property sync, Gutenberg blocks,
            Elementor widget, and auto-updates</strong>. Includes PHP SDK, settings wizard, and CPT registration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testingConnection} className="gap-1.5">
              {testingConnection ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : connectionStatus === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : connectionStatus === "error" ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Test API
            </Button>
            <span className="text-sm text-muted-foreground">
              {connectionStatus === "ok" && "API is healthy — plugin will connect successfully."}
              {connectionStatus === "error" && "API unreachable. Check edge function deployment."}
              {connectionStatus === "idle" && "Verify the PMS API is reachable before distributing the plugin."}
            </span>
          </div>

          {/* Commission info */}
          <div className="flex items-start gap-2.5 rounded-lg border border-muted bg-muted/30 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <span className="text-muted-foreground">
              Bookings through this plugin use the ROL'OS platform. The platform fee is as per your property agreement.
            </span>
          </div>

          {/* Action buttons */}
          <div className={showPushUpdate ? "grid grid-cols-2 gap-3" : ""}>
            <Button onClick={handleDownloadZip} variant="default" className="gap-2 w-full">
              <Download className="h-4 w-4" />
              Download Full Plugin (.zip)
            </Button>
            {showPushUpdate && (
              <Button onClick={handlePushUpdate} variant="outline" className="gap-2" disabled={pushing}>
                {pushing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Push Update to All Sites
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center -mt-2">
            <strong>Download</strong> generates a multi-file ZIP with API client, sync engine, blocks, and settings wizard.
          </p>

          {/* Plugin Structure */}
          <details className="group">
            <summary className="text-sm font-medium cursor-pointer select-none list-none flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <span className="transition-transform group-open:rotate-90">▶</span>
              Plugin Structure (10 files)
            </summary>
            <div className="mt-2 bg-muted/50 rounded-lg p-3 text-xs font-mono text-muted-foreground space-y-0.5">
              <p>rolos-plugin/</p>
              <p className="ml-4">├── rolos-plugin.php <span className="text-foreground">(bootstrap)</span></p>
              <p className="ml-4">├── readme.txt</p>
              <p className="ml-4">├── includes/</p>
              <p className="ml-8">├── class-rolos-api-client.php <span className="text-foreground">(PHP SDK)</span></p>
              <p className="ml-8">├── class-rolos-sync-engine.php <span className="text-foreground">(CPT + sync)</span></p>
              <p className="ml-8">├── class-rolos-settings.php <span className="text-foreground">(wizard + settings)</span></p>
              <p className="ml-8">├── class-rolos-shortcodes.php <span className="text-foreground">(3 shortcodes)</span></p>
              <p className="ml-8">├── class-rolos-updater.php <span className="text-foreground">(auto-update)</span></p>
              <p className="ml-8">├── class-rolos-blocks.php <span className="text-foreground">(Gutenberg + Elementor)</span></p>
              <p className="ml-8">└── class-rolos-elementor-booking.php</p>
              <p className="ml-4">└── assets/</p>
              <p className="ml-8">├── rolos-widget.css</p>
              <p className="ml-8">└── rolos-admin.css</p>
            </div>
          </details>

          {/* Visual walkthrough — install steps + usage tabs */}
          <WordPressVisualWalkthrough
            apiEndpoint={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wordpress-plugin-api`}
            shortcode={shortcode}
            gridShortcode={gridShortcode}
            portfolioShortcode={portfolioShortcode}
            brandColor={brandColor}
            compact
          />

          {/* Canonical vs White-label shortcode split */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <h5 className="text-sm font-medium">Shortcodes — Canonical vs White-label</h5>
              {wl.enabled && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <ShieldCheck className="h-3 w-3" /> WL enabled
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>Canonical</strong> ships no brand params — renders in ROL'OS pink (<code>#E91E8C</code>).{" "}
              <strong>White-label</strong> tells the plugin to render in the property's brand colour.
            </p>
            <div>
              <div className="text-xs font-medium mb-1 text-muted-foreground">A. Canonical — ROL'OS pink</div>
              <CodeSnippetBlock code={canonicalShortcode} language="html" title="Canonical shortcode" />
            </div>
            {wlShortcode ? (
              <div>
                <div className="text-xs font-medium mb-1 text-muted-foreground">B. White-label — property brand (auto-inherited)</div>
                <CodeSnippetBlock code={wlShortcode} language="html" title="White-label shortcode" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Enable White-label on this property to reveal the branded shortcode variant.
              </p>
            )}
            {portfolioShortcode && (
              <div className="pt-2 border-t">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Portfolio — Canonical</div>
                <CodeSnippetBlock code={portfolioShortcode} language="html" title="Portfolio canonical shortcode" />
                {portfolioWlShortcode && (
                  <div className="mt-2">
                    <div className="text-xs font-medium mb-1 text-muted-foreground">Portfolio — White-label</div>
                    <CodeSnippetBlock code={portfolioWlShortcode} language="html" title="Portfolio white-label shortcode" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Configuration checklist */}
          <div className="rounded-lg border p-3 space-y-1.5">
            <h5 className="text-sm font-medium mb-1">Configuration checklist</h5>
            {[
              { ok: !!integrationConfig, label: "Plugin downloaded & version registered" },
              { ok: connectionStatus === "ok", label: "API health check passed" },
              { ok: !!webhookSub, label: "Webhook subscription active (optional)" },
              { ok: wl.enabled && wl.domainStatus === "active", label: "White-label host verified (optional)" },
            ].map((c) => (
              <div key={c.label} className="flex items-center gap-2 text-xs">
                {c.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 inline-block" />
                )}
                <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
              </div>
            ))}
            {showPushUpdate && (
              <p className="text-xs text-muted-foreground pt-2">
                <strong>Auto-Updates:</strong> plugin checks every 12 hours. <strong>Push Update</strong> bumps version globally.
              </p>
            )}
          </div>

        </CardContent>
      </Card>

      {/* Webhook Configuration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Webhook Configuration</CardTitle>
            {webhookSub && <Badge variant="default" className="text-xs">Active</Badge>}
          </div>
          <CardDescription>
            Receive real-time event notifications when bookings, inventory, or room statuses change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Webhook URL</Label>
              <Input
                placeholder={webhookPlaceholder}
                value={webhookUrl || webhookSub?.url || ""}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Events</Label>
              <div className="grid grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((evt) => (
                  <label key={evt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedEvents.includes(evt.value) || (webhookSub?.events as string[] || []).includes(evt.value)}
                      onCheckedChange={(checked) => {
                        setSelectedEvents((prev) =>
                          checked ? [...prev, evt.value] : prev.filter((e) => e !== evt.value)
                        );
                      }}
                    />
                    {evt.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveWebhook} size="sm" className="gap-1.5">
                <Webhook className="h-3.5 w-3.5" />
                Save Webhook
              </Button>
              {webhookSub && (
                <Button onClick={handleTestWebhook} variant="outline" size="sm" className="gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                  Send Test Ping
                </Button>
              )}
            </div>
          </div>

          {/* Delivery Logs */}
          {webhookLogs && webhookLogs.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Recent Deliveries
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {webhookLogs.map((log: any) => (
                    <div key={log.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        {log.status === "delivered" ? (
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                        ) : log.status === "failed" ? (
                          <XCircle className="h-3 w-3 text-destructive" />
                        ) : (
                          <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
                        )}
                        <span className="font-mono">{log.event}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {log.response_status && <span>HTTP {log.response_status}</span>}
                        <span>{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
