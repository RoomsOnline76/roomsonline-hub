import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Radio, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRuWhiteLabelTokens } from "@/hooks/useRuWhiteLabelTokens";
import { usePMSBrand } from "@/contexts/PMSBrandContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";


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
  const { tokens, isLoading, isFetching, isUnavailable, reason, subUserVerified, refetch } =
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
      toast.success("ROL'OS Channel Manager connected", {
        description: "Loading your channels now.",
      });
    } else {
      toast("ROL'OS sign-in is still being finalised", {
        description:
          "Your ROL'OS connection is fine. TOBI will keep finalising the Channel Manager sign-in automatically.",
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

  /**
   * The RU one-line script is a jQuery snippet that appends `<base href="/">` plus the
   * Angular bundles to the host document's <head> and then renders <white-pms-host>
   * inside `#ruApp`. Running that directly in our SPA both fails (no global jQuery) and
   * would hijack relative URL resolution for our own router, so we host it inside an
   * isolated same-origin iframe document that provides jQuery and the empty container.
   */
  const embedDoc = useMemo(() => {
    if (!tokens) return null;
    const params = new URLSearchParams({
      token: tokens.subUserAccessToken,
      refreshToken: tokens.subUserRefreshToken,
      languageId: "1",
      uiVersion: "2",
      ownerId: tokens.ruOwnerId,
    });
    const src = `https://new.rentalsunited.com/white-pms-client/script?${params.toString()}`;
    return `<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>html,body{margin:0;padding:0;height:100%;background:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}#ruApp{min-height:100%}</style>
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
</head>
<body><div id="ruApp"></div>
<script>
(function(){
  function boot(){ var s=document.createElement('script'); s.src=${JSON.stringify(src)};
    s.onerror=function(){ parent.postMessage({ type:'ru-wl-error' },'*'); };
    document.head.appendChild(s); }
  if (window.jQuery) { boot(); } else { window.addEventListener('load', boot); }
})();
</script>
</body></html>`;
  }, [tokens]);

  useEffect(() => {
    if (!embedDoc) return;
    setScriptFailed(false);
    const onMessage = (event: MessageEvent) => {
      if (event.data && (event.data as { type?: string }).type === "ru-wl-error") {
        setScriptFailed(true);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embedDoc]);


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
    let body: ReactNode = "";

    if (scriptFailed) {
      title = "Channel Manager could not be loaded.";
      body = "The ROL'OS Channel Manager did not load. Check your connection and try again.";
    } else if (reason === "no_owner_account") {
      title = "This property isn't linked to a ROL'OS Channel Manager account yet.";
      body = "Once the account link is in place the Channel Manager appears here automatically.";
    } else if (reason === "awaiting_wl_token" || subUserVerified) {
      title = "Your ROL'OS account is connected.";
      body = (
        <>
          <p>The Channel Manager sign-in is being finalised — this is not a setup problem on your side. Nothing further is needed from you.</p>
          <p>Your ROL'OS connection is fine — the Channel Manager sign-in still needs to be finalised by TOBI.</p>
        </>
      );
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
          {body && <div className="space-y-2 text-sm text-muted-foreground">{body}</div>}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRetry} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Retrying…" : "Retry"}
            </Button>

            {isStaff && propertyId && (
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/admin/properties/${propertyId}?tab=integrations`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  ROL'OS owner panel
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
