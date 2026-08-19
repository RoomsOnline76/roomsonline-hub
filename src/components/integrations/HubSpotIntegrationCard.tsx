import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlugZap, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { useOwnerIntegration } from "@/hooks/useOwnerIntegration";

interface HubSpotIntegrationCardProps {
  /** Renders without the outer border when embedded in an existing card. */
  bare?: boolean;
}

/**
 * HubSpot CRM — an owner-level add-on, included free and opt-in only.
 * One portal per owner covers the whole portfolio. Nothing here affects
 * availability, rates, the calendar or any booking flow.
 */
export function HubSpotIntegrationCard({ bare = false }: HubSpotIntegrationCardProps) {
  const { status, loading, busy, call, refresh } = useOwnerIntegration("hubspot");
  const [portalId, setPortalId] = useState("");
  const [token, setToken] = useState("");

  const saveCredentials = async () => {
    if (!token.trim()) {
      toast.error("Paste the Private App access token first");
      return;
    }
    try {
      const result = (await call("save_credentials", {
        portal_id: portalId.trim() || undefined,
        access_token: token.trim(),
      })) as { test_ok?: boolean; message?: string };
      if (result.test_ok === false) {
        toast.error(result.message || "HubSpot rejected that token");
        return;
      }
      setToken("");
      toast.success("HubSpot connected — your CRM will receive new companies, guests and reservations");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the HubSpot token");
    }
  };

  const testConnection = async () => {
    try {
      const result = (await call("test_connection")) as { test_ok?: boolean; message?: string };
      if (result.test_ok) toast.success("HubSpot connection is healthy");
      else toast.error(result.message || "HubSpot did not accept the token");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection test failed");
    }
  };

  const forceSync = async () => {
    try {
      await call("sync_owner");
      toast.success("HubSpot sync completed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    }
  };

  const toggleEnabled = async (next: boolean) => {
    try {
      await call("set_enabled", { enabled: next });
      toast.success(next ? "HubSpot sync enabled" : "HubSpot sync paused");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update HubSpot");
    }
  };

  const disconnect = async () => {
    try {
      await call("disconnect");
      toast.success("HubSpot disconnected — no further data is sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect HubSpot");
    }
  };

  const spinner = (action: string) =>
    busy === action ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null;

  return (
    <div className={bare ? "space-y-3" : "space-y-3 rounded-lg border p-4"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <PlugZap className="h-4 w-4" /> HubSpot CRM
            <Badge variant="secondary" className="text-[10px]">Included free</Badge>
          </p>
          <p className="text-xs text-muted-foreground">
            Optional. Send your company details, guests and reservations to your own HubSpot portal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Label className="text-xs text-muted-foreground">
                {status.enabled ? "Enabled" : "Disabled"}
              </Label>
              <Switch
                checked={status.enabled}
                onCheckedChange={toggleEnabled}
                disabled={busy !== null || (!status.connected && !status.enabled)}
              />
            </>
          )}
        </div>
      </div>

      {status.connected ? (
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            Connected{status.portalId ? ` · portal ${status.portalId}` : ""} ·{" "}
            {status.syncStatus === "ok"
              ? "healthy"
              : status.syncStatus === "error"
                ? "last sync failed"
                : "not synced yet"}
            {status.lastSyncAt ? ` · ${new Date(status.lastSyncAt).toLocaleString()}` : ""}
          </p>
          {status.lastError ? <p className="text-destructive">{status.lastError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={testConnection} disabled={busy !== null}>
              {spinner("test_connection")}Test connection
            </Button>
            <Button size="sm" variant="outline" onClick={forceSync} disabled={busy !== null || !status.enabled}>
              {spinner("sync_owner") || <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}Force sync
            </Button>
            <Button size="sm" variant="ghost" onClick={disconnect} disabled={busy !== null}>
              {spinner("disconnect") || <Unplug className="mr-1.5 h-3.5 w-3.5" />}Disconnect
            </Button>
          </div>
          <p className="text-muted-foreground">
            The token is stored encrypted and is never shown again. Paste a new one below to replace it.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Not connected. Create a Private App in HubSpot with CRM read and write scopes, then paste its token
          below. You can skip this and set it up later in settings.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <div>
          <Label className="text-xs text-muted-foreground">Portal ID (optional)</Label>
          <Input
            className="h-9"
            value={portalId}
            onChange={(e) => setPortalId(e.target.value)}
            placeholder="12345678"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Private App access token</Label>
          <Input
            className="h-9"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="pat-eu1-…"
          />
        </div>
        <Button size="sm" onClick={saveCredentials} disabled={busy !== null}>
          {spinner("save_credentials")}
          {status.connected ? "Replace & test" : "Save & test"}
        </Button>
      </div>
    </div>
  );
}
