import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Copy, RefreshCw, ExternalLink, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PORTAL_BASE = "https://sleepinafrica.roomsonline.co.za";

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function HyperGuestPortalAdminCard() {
  const { toast } = useToast();
  const [token, setToken] = useState<string>("");
  const [enabled, setEnabled] = useState<boolean>(true);
  const [rotatedAt, setRotatedAt] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("hyperguest_portal_config")
      .select("token, enabled, rotated_at")
      .eq("id", true)
      .maybeSingle();
    if (data) {
      setToken(data.token);
      setEnabled(!!data.enabled);
      setRotatedAt(data.rotated_at);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const portalUrl = `${PORTAL_BASE}/hyperguest/certification?token=${token}`;
  const reflectionUrl = `${PORTAL_BASE}/hyperguest/certification/reflection?token=${token}`;

  const copy = useCallback(
    (label: string, value: string) => {
      navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    },
    [toast]
  );

  const rotate = useCallback(async () => {
    setBusy(true);
    const next = randomToken();
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("hyperguest_portal_config")
      .update({
        token: next,
        rotated_at: new Date().toISOString(),
        rotated_by: userRes?.user?.id ?? null,
      })
      .eq("id", true);
    setBusy(false);
    if (error) {
      toast({ title: "Rotate failed", description: error.message, variant: "destructive" });
      return;
    }
    setToken(next);
    setRotatedAt(new Date().toISOString());
    toast({ title: "Token rotated", description: "Send the new URL to HyperGuest." });
  }, [toast]);

  const toggleEnabled = useCallback(
    async (next: boolean) => {
      const { error } = await supabase
        .from("hyperguest_portal_config")
        .update({ enabled: next })
        .eq("id", true);
      if (error) {
        toast({ title: "Failed to update", description: error.message, variant: "destructive" });
        return;
      }
      setEnabled(next);
    },
    [toast]
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">HyperGuest Certification Portal</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Token-gated URL you can send to HyperGuest QA to run the 12-step certification and
            inspect cancellation policies, board bases, taxes, remarks, photos and facilities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={toggleEnabled} />
          <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "Enabled" : "Disabled"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Bearer token</label>
          <div className="flex gap-2">
            <Input
              type={show ? "text" : "password"}
              value={token}
              readOnly
              className="font-mono text-xs"
            />
            <Button variant="outline" size="icon" onClick={() => setShow((v) => !v)}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={() => copy("Token", token)}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={rotate} disabled={busy}>
              <RefreshCw className={`h-4 w-4 mr-2 ${busy ? "animate-spin" : ""}`} /> Rotate
            </Button>
          </div>
          {rotatedAt && (
            <p className="text-[11px] text-muted-foreground">
              Rotated {new Date(rotatedAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Portal URL (send this to HyperGuest)</label>
          <div className="flex gap-2">
            <Input value={portalUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy("Portal URL", portalUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button asChild variant="outline" size="icon">
              <a href={portalUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Reflection inspector URL</label>
          <div className="flex gap-2">
            <Input value={reflectionUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy("Reflection URL", reflectionUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button asChild variant="outline" size="icon">
              <a href={reflectionUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
            </Button>
          </div>
        </div>

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Guidance document for the HyperGuest QA team:{" "}
            <code className="text-[11px]">docs/hyperguest-verification-guide.md</code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
