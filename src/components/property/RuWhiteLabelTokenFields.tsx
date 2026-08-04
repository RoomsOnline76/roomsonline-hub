import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractFunctionError } from "@/lib/functionError";

/**
 * White Label Channel Manager token pair (admin only).
 *
 * The ROL'OS Channels page boots the Rentals United White Label client with an
 * access/refresh token pair for the owner's sub-user. The backend mints these from the
 * owner's stored portal login where Rentals United allows it; when it does not, an
 * admin pastes the pair from the RU portal here.
 */
export function RuWhiteLabelTokenFields({
  propertyId,
  readOnly,
}: {
  propertyId: string;
  readOnly?: boolean;
}) {
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [busy, setBusy] = useState(false);

  const call = async (action: "set_tokens" | "clear_tokens") => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-whitelabel-token", {
        body: {
          action,
          property_id: propertyId,
          ...(action === "set_tokens"
            ? { access_token: accessToken.trim(), refresh_token: refreshToken.trim() }
            : {}),
        },
      });
      if (error) throw new Error(await extractFunctionError(error));
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
      toast.success(action === "set_tokens" ? "White Label tokens saved" : "White Label tokens cleared");
      setAccessToken("");
      setRefreshToken("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update White Label tokens");
    } finally {
      setBusy(false);
    }
  };

  if (readOnly) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">White Label Channel Manager tokens</p>
      <p className="text-xs text-muted-foreground">
        Paste the sub-user token pair from Rentals United to activate the embedded Channel Manager on the
        ROL'OS Channels page. Leave blank if the tokens are minted from the stored portal login.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ru_wl_token" className="text-xs">Access token</Label>
          <Input
            id="ru_wl_token"
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="token"
            className="h-7 text-xs"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ru_wl_refresh" className="text-xs">Refresh token</Label>
          <Input
            id="ru_wl_refresh"
            type="password"
            value={refreshToken}
            onChange={(e) => setRefreshToken(e.target.value)}
            placeholder="refreshToken"
            className="h-7 text-xs"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={busy || !accessToken.trim() || !refreshToken.trim()}
          onClick={() => void call("set_tokens")}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          Save tokens
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5" disabled={busy} onClick={() => void call("clear_tokens")}>
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}
