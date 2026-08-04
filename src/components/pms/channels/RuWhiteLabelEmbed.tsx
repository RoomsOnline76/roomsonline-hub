import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRuWhiteLabelTokens } from "@/hooks/useRuWhiteLabelTokens";

const EMBED_HEIGHT = "h-[calc(100vh-12rem)]";

/**
 * Rentals United White Label Channel Manager embed.
 *
 * Uses the documented "Option 2: One-Line Script" method — the RU client script is
 * injected into an empty `#ruApp` container and renders the whole channel manager UI
 * (connections, mappings, sync) inside it. The script is torn down whenever the token
 * pair or property changes, so a property switch never leaves two clients mounted.
 */
export function RuWhiteLabelEmbed({ propertyId }: { propertyId: string | null | undefined }) {
  const { tokens, isLoading, isUnavailable, message, refetch } = useRuWhiteLabelTokens(propertyId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scriptFailed, setScriptFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !tokens) return;

    setScriptFailed(false);
    container.innerHTML = "";

    const params = new URLSearchParams({
      token: tokens.subUserAccessToken,
      refreshToken: tokens.subUserRefreshToken,
      languageId: "1",
      uiVersion: "2",
      ownerId: tokens.ruOwnerId,
    });

    const script = document.createElement("script");
    script.src = `https://new.rentalsunited.com/white-pms-client/script?${params.toString()}`;
    script.async = true;
    script.onerror = () => setScriptFailed(true);
    container.appendChild(script);

    return () => {
      script.onerror = null;
      script.remove();
      container.innerHTML = "";
    };
  }, [tokens]);

  if (isLoading) {
    return (
      <div className={`flex ${EMBED_HEIGHT} w-full items-center justify-center rounded-lg border bg-background`}>
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Loading Channel Manager…</p>
        </div>
      </div>
    );
  }

  if (isUnavailable || scriptFailed) {
    return (
      <div className={`flex ${EMBED_HEIGHT} w-full items-center justify-center rounded-lg border bg-background`}>
        <div className="max-w-md space-y-3 px-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Radio className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">
            {scriptFailed
              ? "Channel Manager could not be loaded."
              : "Channel Manager is not activated for this owner yet."}
          </p>
          <p className="text-sm text-muted-foreground">
            {scriptFailed
              ? "The Rentals United White Label client did not load. Check your connection and try again."
              : "Complete the Rentals United sub-user setup first."}
          </p>
          {message && !scriptFailed && <p className="text-xs text-muted-foreground">{message}</p>}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      id="ruApp"
      ref={containerRef}
      className={`w-full ${EMBED_HEIGHT} rounded-lg border bg-background overflow-hidden`}
    />
  );
}
