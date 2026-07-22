import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, Copy, ChevronDown, ChevronUp, CheckCircle2, Building2 } from "lucide-react";
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
}

const CNAME_TARGET = "sleepinafrica.roomsonline.co.za";
const A_TARGET = "185.158.133.1";

const STATUS_META = {
  unconfigured: { label: "Not configured", icon: ShieldQuestion, tone: "secondary" as const },
  pending: { label: "Pending DNS", icon: Loader2, tone: "outline" as const },
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
}: WhiteLabelDomainPanelProps) {
  const [domain, setDomain] = useState(currentDomain || "");
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDns, setShowDns] = useState(currentStatus !== "active");
  const qc = useQueryClient();
  const status = STATUS_META[currentStatus] || STATUS_META.unconfigured;
  const StatusIcon = status.icon;
  const isActive = currentStatus === "active";
  const isPortfolioScope = !!portfolioId;

  useEffect(() => { setDomain(currentDomain || ""); setShowDns(currentStatus !== "active"); }, [currentDomain, currentStatus]);

  function invalidate() {
    if (portfolioId) qc.invalidateQueries({ queryKey: ["whitelabel-portfolio", portfolioId] });
    if (propertyId) qc.invalidateQueries({ queryKey: ["whitelabel", propertyId] });
    // Property-level inheritance may change for portfolio siblings — invalidate broadly.
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
        .update({
          white_label_domain: clean,
          white_label_domain_status: "pending",
        } as any)
        .eq("id", portfolioId));
    } else if (propertyId) {
      ({ error } = await supabase
        .from("property_billing_configs")
        .update({
          white_label_domain: clean,
          white_label_domain_status: "pending",
        } as any)
        .eq("property_id", propertyId));
    }
    setSaving(false);
    if (error) return toast.error("Could not save", { description: error.message });
    toast.success("Domain saved — now click Verify DNS");
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
    invalidate();
    if (data?.status === "active") toast.success("Domain verified — WL host is live");
    else if (data?.status === "pending") toast.info("No DNS records found yet — try again in a few minutes");
    else toast.warning("DNS points elsewhere", { description: "Add the CNAME or A record shown below." });
  }

  const dnsSnippet = `Type: CNAME\nName: ${domain || "book"}\nValue: ${CNAME_TARGET}\n\n(SSL is terminated at your CDN / reverse proxy — not on our hosting.)`;

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
          <Badge variant={status.tone} className={`gap-1 ${isActive ? "bg-green-600 hover:bg-green-600 text-white" : ""}`}>
            <StatusIcon className={`h-3 w-3 ${currentStatus === "pending" ? "animate-spin" : ""}`} />
            {status.label}
          </Badge>
        </div>
        <CardDescription>
          {isPortfolioScope
            ? <>Point a subdomain (for example <code>book.yourbrand.com</code>) at our hosting. Every property in this portfolio will use it automatically for Smart Buttons, widgets and embeds — guests never see the ROL'OS URL.</>
            : <>Point a subdomain of your own site (for example <code>book.yourhotel.com</code>) at our hosting so the entire booking flow lives on your URL. Once verified, every integration snippet below automatically uses this domain — guests never see the ROL'OS URL.</>}
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
            Verify DNS
          </Button>
        </div>

        {isActive && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>
                Domain verified — <code className="font-mono text-xs">{domain}</code> is live.
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              onClick={() => setShowDns((v) => !v)}
            >
              {showDns ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showDns ? "Hide DNS record" : "Show DNS record"}
            </Button>
          </div>
        )}

        {showDns && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs">Add this DNS record at your registrar</Label>
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

            <p className="text-xs text-muted-foreground">
              Point a CNAME from your branded host to <code className="font-mono">{CNAME_TARGET}</code> and terminate
              SSL at your own CDN or reverse proxy (Cloudflare, Fastly, nginx, etc.). The widget always loads from the
              canonical host — your branded domain is only what customers see in the URL. No registration on our
              hosting is required.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
