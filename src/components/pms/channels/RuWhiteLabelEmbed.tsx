import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Radio, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRuWhiteLabelTokens } from "@/hooks/useRuWhiteLabelTokens";
import { usePMSBrand } from "@/contexts/PMSBrandContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";


const EMBED_HEIGHT = "h-[calc(100vh-12rem)]";

/**
 * Rentals United White Label Channel Manager embed.
 *
 * Uses the documented "Option 2: One-Line Script" method — the RU client script is
 * injected into an empty `#ruApp` container and renders the whole channel manager UI
 * (connections, mappings, sync) inside it. The script is torn down whenever the token
 * pair or property changes, so a property switch never leaves two clients mounted.
 *
 * When the property has ROL'OS branding / white label enabled, the embed frame and the
 * brand custom properties handed to the client follow the property palette.
 */
export function RuWhiteLabelEmbed({ propertyId }: { propertyId: string | null | undefined }) {
  const { tokens, isLoading, isFetching, isUnavailable, reason, subUserVerified, message, refetch } =
    useRuWhiteLabelTokens(propertyId);
  const brand = usePMSBrand();
  const { isAdmin, isDev, isFearlessLeader } = useAuth();
  const isStaff = isAdmin || isDev || isFearlessLeader;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scriptFailed, setScriptFailed] = useState(false);

  /**
   * Manual retry: re-run the token request and tell the owner what came back, so the
   * button always visibly does something even when the answer is unchanged.
   */
  const handleRetry = async () => {
    setScriptFailed(false);
    const result = await refetch();
    const fresh = result.data;
    if (fresh?.available && fresh.access_token) {
      toast({ title: "Channel Manager connected", description: "Loading your channels now." });
    } else {
      toast({
        title: "Still finalising",
        description:
          "The Channel Manager session isn't ready yet. Your Rentals United connection is unaffected — please try again shortly.",
      });
    }
  };


  /**
   * Brand custom properties exposed on the embed container. They cover the naming
   * conventions the White Label client and our own chrome use, so a branded property
   * renders in its own colours; when branding is off, nothing is set and the ROL'OS
   * theme applies unchanged.
   */
  const brandStyle = useMemo(() => {
    if (!brand.brandEnabled) return undefined;
    const primary = brand.primaryColor || undefined;
    const secondary = brand.secondaryColor || primary;
    const text = brand.fontColor || undefined;
    const accent = brand.accentColor || secondary;
    return {
      "--ru-brand-primary": primary,
      "--ru-brand-secondary": secondary,
      "--ru-brand-accent": accent,
      "--ru-brand-text": text,
      "--primary-color": primary,
      "--secondary-color": secondary,
      "--accent-color": accent,
      "--text-color": text,
      borderColor: primary,
      color: text,
    } as React.CSSProperties;
  }, [brand.brandEnabled, brand.primaryColor, brand.secondaryColor, brand.accentColor, brand.fontColor]);

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
      <div
        style={brandStyle}
        className={`flex ${EMBED_HEIGHT} w-full items-center justify-center rounded-lg border bg-background`}
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm">Loading Channel Manager…</p>
        </div>
      </div>
    );
  }

  if (isUnavailable || scriptFailed) {
    let title = "Channel Manager is not available yet.";
    let body = "";

    if (scriptFailed) {
      title = "Channel Manager could not be loaded.";
      body = "The Rentals United White Label client did not load. Check your connection and try again.";
    } else if (reason === "no_owner_account") {
      title = "This property isn't linked to a Rentals United account yet.";
      body = "Once the account link is in place the Channel Manager appears here automatically.";
    } else if (reason === "awaiting_wl_token" || subUserVerified) {
      title = "Your Rentals United account is connected.";
      body =
        "The Channel Manager sign-in is being finalised — this is not a setup problem on your side. Nothing further is needed from you.";
    } else if (reason === "login_failed" || reason === "request_failed") {
      title = "Channel Manager sign-in did not complete.";
      body = "We could not establish a Channel Manager session just now. Please retry in a moment.";
    } else {
      body = "The Channel Manager session for this property is not established yet.";
    }

    return (
      <div
        style={brandStyle}
        className={`flex ${EMBED_HEIGHT} w-full items-center justify-center rounded-lg border bg-background`}
      >
        <div className="max-w-md space-y-3 px-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Radio className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          {body && <p className="text-sm text-muted-foreground">{body}</p>}
          {isStaff && message && <p className="text-xs text-muted-foreground">{message}</p>}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            {isStaff && propertyId && (
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/admin/properties/${propertyId}?tab=integrations`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Rentals United owner panel
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="ruApp"
      ref={containerRef}
      style={brandStyle}
      className={`w-full ${EMBED_HEIGHT} rounded-lg border bg-background overflow-hidden`}
    />
  );
}
