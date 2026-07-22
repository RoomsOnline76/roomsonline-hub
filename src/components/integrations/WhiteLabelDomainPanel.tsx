import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, Copy, ChevronDown, ChevronUp, CheckCircle2, Building2, AlertTriangle } from "lucide-react";
import { CodeSnippetBlock } from "./CodeSnippetBlock";

interface WhiteLabelDomainPanelProps {
  /** Either propertyId or portfolioId must be provided (portfolioId wins if both). */
  propertyId?: string;
  portfolioId?: string;
  currentDomain: string | null;
  currentStatus: "unconfigured" | "pending" | "active" | "failed" | "dns_ok_tls_pending";
  /** Scope label rendered in the header. */
  scopeLabel?: string;
  /** Shown as a small inheritance note under the header. */
  inheritedNote?: string;
  /** Disable editing (used when panel is showing inherited state). */
  readOnly?: boolean;
  /** Last verifier error message, when available. */
  lastError?: string | null;
}

const CNAME_TARGET = "sleepinafrica.roomsonline.co.za";

const STATUS_META = {
  unconfigured: { label: "Not configured", icon: ShieldQuestion, tone: "secondary" as const },
  pending: { label: "Pending DNS", icon: Loader2, tone: "outline" as const },
  dns_ok_tls_pending: { label: "DNS OK — HTTPS not reachable", icon: AlertTriangle, tone: "outline" as const },
  active: { label: "Active", icon: ShieldCheck, tone: "default" as const },
  failed: { label: "Failed", icon: ShieldAlert, tone: "destructive" as const },
};

export function WhiteLabelDomainPanel({
  propertyId,
  portfolioId,
  currentDomain,
  currentStatus,
  scopeLabel,
  inheritedNote,
  readOnly = false,
  lastError,
}: WhiteLabelDomainPanelProps) {
  const [domain, setDomain] = useState(currentDomain || "");
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDns, setShowDns] = useState(currentStatus !== "active");
  const [liveError, setLiveError] = useState<string | null>(lastError ?? null);
  const qc = useQueryClient();
  const status = STATUS_META[currentStatus] || STATUS_META.unconfigured;
  const StatusIcon = status.icon;
  const isActive = currentStatus === "active";
  const isTlsPending = currentStatus === "dns_ok_tls_pending";
  const isPortfolioScope = !!portfolioId;

  useEffect(() => {
    setDomain(currentDomain || "");
    setShowDns(currentStatus !== "active");
    setLiveError(lastError ?? null);
  }, [currentDomain, currentStatus, lastError]);

  function invalidate() {
    if (portfolioId) qc.invalidateQueries({ queryKey: ["whitelabel-portfolio", portfolioId] });
    if (propertyId) qc.invalidateQueries({ queryKey: ["whitelabel", propertyId] });
    qc.invalidateQueries({ queryKey: ["whitelabel"] });
  }

  async function save() {
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!clean) {
      toast.error("Enter a domain like book.yourhotel.com");
      return;
    }
    setSaving(true);
    let error;
    if (portfolioId) {
      ({ error } = await supabase
        .from("property_portfolios")
        .update({ white_label_domain: clean, white_label_domain_status: "pending" } as any)
        .eq("id", portfolioId));
    } else if (propertyId) {
      ({ error } = await supabase
        .from("property_billing_configs")
        .update({ white_label_domain: clean, white_label_domain_status: "pending" } as any)
        .eq("property_id", propertyId));
    }
    setSaving(false);
    if (error) return toast.error("Could not save", { description: error.message });
    toast.success("Domain saved — now click Verify");
    invalidate();
  }

  async function verify() {
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!clean) return toast.error("Save a domain first");
    setVerifying(true);
    const body: Record<string, string> = { domain: clean };
    if (portfolioId) body.portfolio_id = portfolioId;
    else if (propertyId) body.property_id = propertyId;
    const { data, error } = await supabase.functions.invoke("verify-whitelabel-domain", { body });
    setVerifying(false);
    if (error) return toast.error("Verification failed", { description: error.message });
    setLiveError((data as any)?.last_error ?? null);
    invalidate();
    const s = (data as any)?.status;
    if (s === "active") toast.success("Domain verified — HTTPS live");
    else if (s === "dns_ok_tls_pending") toast.warning("DNS OK, but HTTPS not reachable", { description: (data as any)?.last_error });
    else if (s === "pending") toast.info("No DNS records found yet — try again in a few minutes");
    else toast.warning("DNS points elsewhere", { description: (data as any)?.last_error });
  }

  const dnsHost = (() => {
    const d = (domain || "").trim().toLowerCase();
    if (!d) return "book";
    const parts = d.split(".");
    return parts.length > 2 ? parts[0] : d;
  })();
  const dnsSnippet = `Type: CNAME\nName: ${dnsHost}\nValue: ${CNAME_TARGET}`;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPortfolioScope ? <Building2 className="h-5 w-5 text-primary" /> : <Globe className="h-5 w-5 text-primary" />}
            <CardTitle className="text-lg">
              {scopeLabel || (isPortfolioScope ? "Portfolio booking subdomain" : "Your own booking subdomain")}
            </CardTitle>
          </div>
          <Badge variant={status.tone} className={`gap-1 ${isActive ? "bg-green-600 hover:bg-green-600 text-white" : ""} ${isTlsPending ? "border-amber-500 text-amber-700" : ""}`}>
            <StatusIcon className={`h-3 w-3 ${currentStatus === "pending" ? "animate-spin" : ""}`} />
            {status.label}
          </Badge>
        </div>
        <CardDescription>
          {isPortfolioScope
            ? <>Point a subdomain (for example <code>book.yourbrand.com</code>) at our canonical host and terminate TLS on your side. Every property in this portfolio will use it automatically for Smart Buttons, widgets and embeds.</>
            : <>Point a subdomain of your own site (for example <code>book.yourhotel.com</code>) at our canonical host and terminate TLS on your side. Once verified, every integration snippet below automatically uses this domain.</>}
        </CardDescription>
        {inheritedNote && (
          <p className="text-xs text-muted-foreground mt-1">{inheritedNote}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,auto] gap-2 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Booking subdomain</Label>
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="book.yourhotel.com"
              className="h-9"
              disabled={readOnly}
            />
          </div>
          <Button size="sm" variant="outline" onClick={save} disabled={saving || readOnly}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
          <Button size="sm" onClick={verify} disabled={verifying || !domain || readOnly}>
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Verify
          </Button>
        </div>

        {isActive && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Domain verified — <code className="font-mono text-xs">{domain}</code> is live over HTTPS.</span>
            </div>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setShowDns((v) => !v)}>
              {showDns ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showDns ? "Hide DNS record" : "Show DNS record"}
            </Button>
          </div>
        )}

        {isTlsPending && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm space-y-1">
            <div className="flex items-center gap-2 font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              DNS is pointing at us, but HTTPS is not reachable at <code className="font-mono text-xs">{domain}</code>.
            </div>
            {liveError && <p className="text-xs text-amber-900/80">{liveError}</p>}
            <p className="text-xs text-amber-900/80">
              We don't host TLS certificates for customer domains — you need to terminate SSL on your side. See the two supported options below. Until this is fixed, integration snippets fall back to the canonical host so guests can still book.
            </p>
          </div>
        )}

        {currentStatus === "failed" && liveError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {liveError}
          </div>
        )}

        {showDns && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs">1. Add this DNS record at your registrar</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 text-xs"
                  onClick={() => { navigator.clipboard.writeText(CNAME_TARGET); toast.success("CNAME target copied"); }}
                >
                  <Copy className="h-3 w-3" /> Copy target
                </Button>
              </div>
              <CodeSnippetBlock code={dnsSnippet} language="text" title="DNS record" />
            </div>

            <div className="space-y-2 rounded-md border bg-background/60 p-3">
              <Label className="text-xs">2. Terminate TLS on your side (pick one)</Label>

              <div className="text-xs space-y-1">
                <div className="font-medium">Option A · Cloudflare proxy (recommended)</div>
                <ol className="list-decimal ml-4 space-y-0.5 text-muted-foreground">
                  <li>Create the CNAME above in Cloudflare with the <b>orange cloud on</b> (proxied).</li>
                  <li>SSL/TLS → Overview → set mode to <b>Full</b>.</li>
                  <li>Cloudflare will issue an edge certificate for <code className="font-mono">{domain || "book.yourhotel.com"}</code> automatically and forward requests to us.</li>
                </ol>
              </div>

              <div className="text-xs space-y-1">
                <div className="font-medium">Option B · Your own CDN / reverse proxy</div>
                <ol className="list-decimal ml-4 space-y-0.5 text-muted-foreground">
                  <li>Point the origin at <code className="font-mono">{CNAME_TARGET}</code>.</li>
                  <li>Manage your own TLS certificate for the branded host.</li>
                  <li>Forward the <code className="font-mono">Host</code> header as <code className="font-mono">{CNAME_TARGET}</code>.</li>
                </ol>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              The widget always loads from our canonical host — your branded domain is only what customers see in the URL bar. No registration on our hosting is required, but a valid TLS certificate served for the branded host is.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
