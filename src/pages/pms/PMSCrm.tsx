import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ExternalLink,
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Users,
  Briefcase,
  Link2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { HubSpotIntegrationCard } from "@/components/integrations/HubSpotIntegrationCard";
import {
  hubspotUrl,
  useHubspotActions,
  useHubspotMetrics,
  useHubspotStatus,
  useHubspotSyncLog,
} from "@/hooks/useHubspotCrm";

/**
 * ROL'OS CRM — the HubSpot add-on surface.
 *
 * Everything on this page is a read-only reflection of the connected portal
 * plus the add-on's own controls. It never writes bookings, guests, messages or
 * availability, and it degrades to a connect prompt when the add-on is off.
 */
export default function PMSCrm() {
  const { propertyId, properties } = usePmsPropertyId();
  const { data: status, isLoading } = useHubspotStatus();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const live = Boolean(status?.enabled && status?.connected);
  const { data: metrics, isFetching: metricsLoading } = useHubspotMetrics(live);
  const { data: log } = useHubspotSyncLog(live);
  const { forceSync, testConnection, setMessageLogging } = useHubspotActions();

  const propertyName = useMemo(
    () => properties?.find((p) => p.id === propertyId)?.name ?? null,
    [properties, propertyId],
  );
  const messageLoggingOn = Boolean(
    propertyId && status?.messageLogProperties.includes(propertyId),
  );

  const runSync = async () => {
    try {
      await forceSync.mutateAsync();
      toast.success("CRM sync completed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "CRM sync failed");
    }
  };

  const runTest = async () => {
    try {
      const res = await testConnection.mutateAsync();
      if (res.test_ok) toast.success("Connection is healthy");
      else toast.error(res.message || "The portal did not accept the token");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection test failed");
    }
  };

  const toggleLogging = async (next: boolean) => {
    if (!propertyId) return;
    try {
      await setMessageLogging.mutateAsync({ propertyId, enabled: next });
      toast.success(
        next
          ? "Guest messages for this property will also be logged to your CRM"
          : "CRM message logging switched off for this property",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update message logging");
    }
  };

  const statusBadge = () => {
    if (!status?.connected) return <Badge variant="outline">Not connected</Badge>;
    if (!status.enabled) return <Badge variant="secondary">Paused</Badge>;
    if (status.syncStatus === "error") return <Badge variant="destructive">Attention needed</Badge>;
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Healthy</Badge>;
  };

  const metric = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : value.toLocaleString();

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold md:text-2xl">
          <PlugZap className="h-5 w-5 text-primary" /> CRM
        </h1>
        <p className="text-sm text-muted-foreground">
          Your HubSpot portal, mirrored here. Guests, reservations and messages stay native in
          ROL'OS — the CRM only ever receives a copy.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Connection</CardTitle>
              <CardDescription className="text-xs">
                {status?.portalId ? `Portal ${status.portalId}` : "One portal covers your portfolio"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : statusBadge()}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              Last sync:{" "}
              {status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : "never"}
            </span>
            {status?.lastError && <span className="text-destructive">{status.lastError}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={runTest} disabled={!status?.connected || testConnection.isPending}>
              {testConnection.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test connection
            </Button>
            <Button size="sm" variant="outline" onClick={runSync} disabled={!live || forceSync.isPending}>
              {forceSync.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Sync now
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={hubspotUrl(status?.portalId)} target="_blank" rel="noreferrer">
                Open portal <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {live && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Contacts in CRM
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {metricsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : metric(metrics?.contacts_total)}
              </p>
              <a
                href={hubspotUrl(status?.portalId, "/objects/0-1/views/all/list")}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View contacts <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Briefcase className="h-3.5 w-3.5" /> Open deals
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {metricsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : metric(metrics?.open_deals)}
              </p>
              <a
                href={hubspotUrl(status?.portalId, "/objects/0-3/views/all/list")}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View deals <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" /> Guests matched
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {metricsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  metric(metrics?.linked_guests)
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                of {metric(metrics?.guests_with_email)} guests with an email
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {live && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Message logging</CardTitle>
            <CardDescription className="text-xs">
              Optional. Guest messages are always sent and stored natively in ROL'OS; switching
              this on additionally copies them to the CRM timeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label className="text-sm">
                  Log messages for {propertyName || "this property"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Off by default. Staff can also tick "Also log to CRM" per message.
                </p>
              </div>
              <Switch
                checked={messageLoggingOn}
                onCheckedChange={toggleLogging}
                disabled={!propertyId || setMessageLogging.isPending}
              />
            </div>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/pms/messaging">Go to Messaging</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {live && (log || []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent CRM activity</CardTitle>
            <CardDescription className="text-xs">
              What ROL'OS has sent to your portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(log || []).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium capitalize">{entry.event.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Separator />

      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    Add-on settings
                    <Badge variant={status?.connected ? "secondary" : "outline"} className="text-[10px]">
                      {status?.connected ? "Connected" : "Not connected"}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Connect, replace the token, pause or disconnect. Included free.
                  </CardDescription>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${settingsOpen ? "rotate-180" : ""}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <HubSpotIntegrationCard bare />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

    </div>
  );
}
