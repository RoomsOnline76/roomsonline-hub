import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Link2, RefreshCw, Ban } from "lucide-react";
import { callGroupsApi } from "@/lib/groupsApi";
import { PUBLIC_DOMAIN } from "@/lib/config";

const roomingUrl = (token: string) => `${PUBLIC_DOMAIN}/group-rooming/${token}`;

interface GroupPortalShareCardProps {
  propertyId: string;
  groupId: string;
  portalToken: string | null;
  portalEnabled: boolean;
  portalExpiresAt: string | null;
  readOnly: boolean;
  onChanged: () => void;
}

interface TokenResponse {
  portal_token: string | null;
  portal_enabled: boolean;
}

/**
 * Lets staff hand the group organiser a tokenised link so they can complete the
 * rooming list themselves, capped at the rooms still held for the group.
 */
export default function GroupPortalShareCard({
  propertyId,
  groupId,
  portalToken,
  portalEnabled,
  portalExpiresAt,
  readOnly,
  onChanged,
}: GroupPortalShareCardProps) {
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState(portalExpiresAt ? portalExpiresAt.slice(0, 10) : "");

  const link = portalToken && portalEnabled ? roomingUrl(portalToken) : null;

  const run = async (mode: "enable" | "rotate" | "disable") => {
    setBusy(true);
    try {
      const res = await callGroupsApi<TokenResponse>("group_portal_token", {
        property_id: propertyId,
        group_id: groupId,
        mode,
        expires_at: mode === "disable" || !expiresAt ? null : `${expiresAt}T23:59:59Z`,
      });
      toast.success(
        mode === "disable" ? "Rooming-list link disabled" : mode === "rotate" ? "New link generated" : "Rooming-list link ready",
      );
      if (res.portal_token && mode !== "disable") {
        await navigator.clipboard?.writeText(roomingUrl(res.portal_token)).catch(() => undefined);
      }
      onChanged();
    } catch (err) {
      toast.error("Link update failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Guest rooming-list link
        </CardTitle>
        <CardDescription>
          Share with the organiser so they can name guests without a login. Capped at rooms still held.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {link ? (
          <div className="flex gap-2">
            <Input readOnly value={link} className="text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                void navigator.clipboard?.writeText(link);
                toast.success("Link copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active link.</p>
        )}

        {!readOnly && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Expires (optional)</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={busy} onClick={() => run(portalEnabled && portalToken ? "enable" : "enable")}>
                {portalEnabled && portalToken ? "Update link" : "Create link"}
              </Button>
              {portalToken && (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run("rotate")}>
                  <RefreshCw className="h-4 w-4 mr-1" /> New link
                </Button>
              )}
              {portalEnabled && (
                <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => run("disable")}>
                  <Ban className="h-4 w-4 mr-1" /> Disable
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
